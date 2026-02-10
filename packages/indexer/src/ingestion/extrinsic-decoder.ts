/**
 * Extrinsic Decoder — uses runtime metadata to decode SCALE-encoded extrinsics.
 *
 * Extracts pallet name, call name, signer address, and block timestamp from
 * the raw extrinsic hex returned by `chain_getBlock`.
 *
 * The decoder fetches runtime metadata via `state_getMetadata` and caches it
 * per spec version so backfill only re-fetches on runtime upgrades.
 *
 * Uses PAPI's `@polkadot-api/substrate-bindings` for metadata SCALE decoding
 * and `@polkadot-api/metadata-builders` for type lookup resolution.
 */

import { createRequire } from "node:module";

// Import PAPI transitive dependencies using createRequire since ESM
// module resolution with "bundler" moduleResolution may not resolve
// these sub-packages correctly at compile time.
const require = createRequire(import.meta.url);
const { decAnyMetadata } = require("@polkadot-api/substrate-bindings") as {
  decAnyMetadata: (bytes: Uint8Array) => { metadata: { tag: string; value: any } };
};
const { getLookupFn } = require("@polkadot-api/metadata-builders") as {
  getLookupFn: (metadata: any) => (typeId: number) => any;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(
    clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface CompactResult {
  value: number;
  offset: number;
}

function readCompact(bytes: Uint8Array, offset: number): CompactResult {
  const first = bytes[offset++];
  const mode = first & 0x03;
  if (mode === 0) return { value: first >> 2, offset };
  if (mode === 1) {
    return { value: (first >> 2) | (bytes[offset] << 6), offset: offset + 1 };
  }
  if (mode === 2) {
    const val =
      (first >> 2) |
      (bytes[offset] << 6) |
      (bytes[offset + 1] << 14) |
      (bytes[offset + 2] << 22);
    return { value: val, offset: offset + 3 };
  }
  // Big integer mode
  const len = (first >> 2) + 4;
  let val = 0;
  for (let i = 0; i < Math.min(len, 6); i++) {
    val += bytes[offset + i] * 256 ** i;
  }
  return { value: val, offset: offset + len };
}

// ── Signed Extension Parsers ─────────────────────────────────────────────────

/**
 * Registry of known Substrate signed extensions and how many "extra" bytes
 * they contribute to the extrinsic body.
 *
 * Extensions that only contribute to `additionalSigned` (signed over but
 * not included in the extrinsic) have zero-byte parsers.
 */
type ExtensionParser = (bytes: Uint8Array, offset: number) => number;

const SIGNED_EXTENSION_PARSERS: Record<string, ExtensionParser> = {
  // Zero-byte extensions (contribute nothing to the extrinsic body)
  CheckNonZeroSender: (_, o) => o,
  CheckSpecVersion: (_, o) => o,
  CheckTxVersion: (_, o) => o,
  CheckGenesis: (_, o) => o,
  CheckWeight: (_, o) => o,
  PrevalidateAttests: (_, o) => o,

  // Era: Immortal (0x00 = 1 byte) or Mortal (2 bytes)
  CheckMortality: (bytes, o) => {
    const era = bytes[o++];
    if (era !== 0) o++; // Mortal era is 2 bytes
    return o;
  },

  // Nonce: compact<u32/u64>
  CheckNonce: (bytes, o) => readCompact(bytes, o).offset,

  // Tip only (older chains without asset-based payment)
  ChargeTransactionPayment: (bytes, o) => readCompact(bytes, o).offset,

  // Tip + Option<AssetId> (newer chains with pallet-asset-tx-payment)
  ChargeAssetTxPayment: (bytes, o) => {
    // compact-encoded tip
    o = readCompact(bytes, o).offset;
    // Option<AssetId>: 0x00 = None, 0x01 = Some(...)
    const hasAssetId = bytes[o++];
    if (hasAssetId === 1) {
      // AssetId is typically a small fixed type (u32 on most chains).
      // We try compact decoding which handles both compact<u32> and raw u32.
      o = readCompact(bytes, o).offset;
    }
    return o;
  },

  // Metadata hash check: 0x00 = Disabled, 0x01 = Some(hash: [u8; 32])
  CheckMetadataHash: (bytes, o) => {
    const mode = bytes[o++];
    if (mode === 1) o += 32;
    return o;
  },
};

// ── Types ────────────────────────────────────────────────────────────────────

interface PalletCallLookup {
  palletsByIndex: Map<number, { name: string; calls: Map<number, string> }>;
  signedExtensions: string[];
}

export interface DecodedCallInfo {
  module: string;
  call: string;
  signer: string | null;
}

// ── ExtrinsicDecoder ─────────────────────────────────────────────────────────

export class ExtrinsicDecoder {
  private httpUrl: string;
  private metadataCache = new Map<number, PalletCallLookup>(); // specVersion → lookup
  private specVersionForBlock = new Map<string, number>(); // blockHash → specVersion
  /** In-flight metadata fetch promises keyed by specVersion — prevents duplicate fetches under concurrency */
  private metadataInflight = new Map<number, Promise<PalletCallLookup>>();

  constructor(rpcUrl: string) {
    this.httpUrl = rpcUrl
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://");
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Ensure metadata is loaded for the given block's runtime.
   * Returns the cached lookup if already available.
   *
   * Uses promise-based deduplication so that concurrent backfill workers
   * requesting the same specVersion share a single in-flight fetch.
   */
  async ensureMetadata(blockHash: string): Promise<PalletCallLookup> {
    let specVersion = this.specVersionForBlock.get(blockHash);

    if (specVersion === undefined) {
      specVersion = await this.fetchSpecVersion(blockHash);
      this.specVersionForBlock.set(blockHash, specVersion);
    }

    // Fast path — already cached
    const existing = this.metadataCache.get(specVersion);
    if (existing) return existing;

    // Dedup — join an in-flight fetch if one exists
    const inflight = this.metadataInflight.get(specVersion);
    if (inflight) return inflight;

    // Start a new fetch and store the promise for dedup
    console.log(
      `[ExtrinsicDecoder] Fetching metadata for specVersion ${specVersion}`
    );
    const promise = this.fetchAndDecodeMetadata(blockHash).then((lookup) => {
      this.metadataCache.set(specVersion!, lookup);
      this.metadataInflight.delete(specVersion!);
      return lookup;
    });
    this.metadataInflight.set(specVersion, promise);
    return promise;
  }

  /**
   * Decode the call info (pallet name, call name, signer) from a single
   * raw extrinsic hex string.
   */
  decodeCallInfo(hex: string, lookup: PalletCallLookup): DecodedCallInfo {
    try {
      const bytes = hexToBytes(hex);

      // 1. Skip compact length prefix
      let { offset } = readCompact(bytes, 0);

      // 2. Version byte — bit 7 indicates signed
      const version = bytes[offset++];
      const isSigned = (version & 0x80) !== 0;

      // ── Unsigned extrinsic ──────────────────────────────────────────────
      if (!isSigned) {
        const palletIndex = bytes[offset];
        const callIndex = bytes[offset + 1];
        return {
          module: this.resolvePalletName(palletIndex, lookup),
          call: this.resolveCallName(palletIndex, callIndex, lookup),
          signer: null,
        };
      }

      // ── Signed extrinsic ───────────────────────────────────────────────
      let signer: string | null = null;

      // MultiAddress prefix byte
      const addrType = bytes[offset++];
      if (addrType === 0) {
        // AccountId32 — 32 bytes
        signer = "0x" + bytesToHex(bytes.slice(offset, offset + 32));
        offset += 32;
      } else if (addrType === 1) {
        // AccountIndex — 4 bytes
        offset += 4;
      } else if (addrType === 2) {
        // AccountId20 (EVM) — 20 bytes
        signer = "0x" + bytesToHex(bytes.slice(offset, offset + 20));
        offset += 20;
      } else {
        return { module: "Unknown", call: "unknown", signer: null };
      }

      // MultiSignature prefix byte
      const sigType = bytes[offset++];
      if (sigType === 0 || sigType === 1) {
        offset += 64; // Ed25519 or Sr25519
      } else if (sigType === 2) {
        offset += 65; // Ecdsa
      } else {
        return { module: "Unknown", call: "unknown", signer };
      }

      // Signed extensions — use metadata-declared extension list
      for (const extId of lookup.signedExtensions) {
        const parser = SIGNED_EXTENSION_PARSERS[extId];
        if (parser) {
          offset = parser(bytes, offset);
        }
        // Unknown extensions are assumed to contribute 0 bytes
      }

      // Call data
      if (offset + 1 < bytes.length) {
        const palletIndex = bytes[offset];
        const callIndex = bytes[offset + 1];
        return {
          module: this.resolvePalletName(palletIndex, lookup),
          call: this.resolveCallName(palletIndex, callIndex, lookup),
          signer,
        };
      }

      return { module: "Unknown", call: "unknown", signer };
    } catch {
      return { module: "Unknown", call: "unknown", signer: null };
    }
  }

  /**
   * Extract the timestamp from a `Timestamp.set` inherent extrinsic.
   * Returns the Unix timestamp in milliseconds, or null if the extrinsic
   * is not a Timestamp.set call.
   */
  extractTimestamp(
    hex: string,
    module: string,
    call: string
  ): number | null {
    if (module !== "Timestamp" || call !== "set") return null;

    try {
      const bytes = hexToBytes(hex);
      // Skip: compact length → version byte → pallet index (1) → call index (1)
      let { offset } = readCompact(bytes, 0);
      offset += 1 + 1 + 1; // version + pallet_index + call_index

      // The argument is compact<Moment> where Moment = u64 (milliseconds)
      const { value } = readCompact(bytes, offset);
      return value;
    } catch {
      return null;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private resolvePalletName(
    index: number,
    lookup: PalletCallLookup
  ): string {
    return lookup.palletsByIndex.get(index)?.name ?? `Pallet(${index})`;
  }

  private resolveCallName(
    palletIndex: number,
    callIndex: number,
    lookup: PalletCallLookup
  ): string {
    const pallet = lookup.palletsByIndex.get(palletIndex);
    if (!pallet) return `call(${callIndex})`;
    return pallet.calls.get(callIndex) ?? `call(${callIndex})`;
  }

  private async fetchSpecVersion(blockHash: string): Promise<number> {
    const json = await this.rpcCall("state_getRuntimeVersion", [blockHash]);
    return json?.specVersion ?? 0;
  }

  private async fetchAndDecodeMetadata(
    blockHash: string
  ): Promise<PalletCallLookup> {
    const metaHex: string = await this.rpcCall("state_getMetadata", [
      blockHash,
    ]);

    const metaBytes = hexToBytes(metaHex);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decoded: any = decAnyMetadata(metaBytes);
    const v = decoded.metadata.value;

    // Build pallet index → { name, calls } lookup
    const palletsByIndex = new Map<
      number,
      { name: string; calls: Map<number, string> }
    >();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookupFn: any = getLookupFn(v);

    for (const pallet of v.pallets as Array<{ name: string; index: number; calls?: number }>) {
      const calls = new Map<number, string>();

      if (pallet.calls != null) {
        try {
          const callType = lookupFn(pallet.calls);
          if (callType.type === "enum") {
            for (const [name, info] of Object.entries(
              callType.value as Record<string, { idx: number }>
            )) {
              calls.set(info.idx, name);
            }
          }
        } catch {
          // Type resolution failed — leave calls empty
        }
      }

      palletsByIndex.set(pallet.index, { name: pallet.name, calls });
    }

    // Extract signed extension identifiers
    const signedExtensions: string[] = (
      (v.extrinsic.signedExtensions ?? []) as Array<{ identifier: string }>
    ).map((ext) => ext.identifier);

    return { palletsByIndex, signedExtensions };
  }

  private async rpcCall(method: string, params: unknown[]): Promise<any> {
    const res = await fetch(this.httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as { result?: unknown; error?: unknown };
    if (json.error) {
      throw new Error(`RPC ${method} failed: ${JSON.stringify(json.error)}`);
    }
    return json.result;
  }
}
