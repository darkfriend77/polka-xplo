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
import { hexToBytes, bytesToHex } from "../hex-utils.js";

// Import PAPI transitive dependencies using createRequire since ESM
// module resolution with "bundler" moduleResolution may not resolve
// these sub-packages correctly at compile time.
const require = createRequire(import.meta.url);

/** Shape of a SCALE type definition from the metadata lookup table */
type ScaleTypeDef = { tag: string; value: unknown };

/** Shape returned by getLookupFn for a resolved type */
interface LookupResult {
  type: string;
  value: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PAPI types are untyped
const { decAnyMetadata } = require("@polkadot-api/substrate-bindings") as {
  decAnyMetadata: (bytes: Uint8Array) => { metadata: { tag: string; value: unknown } };
};
const { getLookupFn } = require("@polkadot-api/metadata-builders") as {
  getLookupFn: (metadata: unknown) => (typeId: number) => LookupResult;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

interface CompactResult {
  value: number;
  offset: number;
}

function readCompact(bytes: Uint8Array, offset: number): CompactResult {
  const first = bytes[offset++]!;
  const mode = first & 0x03;
  if (mode === 0) return { value: first >> 2, offset };
  if (mode === 1) {
    return { value: (first >> 2) | (bytes[offset]! << 6), offset: offset + 1 };
  }
  if (mode === 2) {
    const val =
      (first >> 2) | (bytes[offset]! << 6) | (bytes[offset + 1]! << 14) | (bytes[offset + 2]! << 22);
    return { value: val, offset: offset + 3 };
  }
  // Big integer mode
  const len = (first >> 2) + 4;
  let val = 0;
  for (let i = 0; i < Math.min(len, 6); i++) {
    val += bytes[offset + i]! * 256 ** i;
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

  // Metadata hash check — the mode byte (0=Disabled, 1=Enabled) is the only
  // "extra" data included in the extrinsic body.  The actual 32-byte hash
  // lives in `additionalSigned` (signed over but NOT embedded).
  CheckMetadataHash: (_bytes, o) => o + 1,
};

// ── Event Storage ─────────────────────────────────────────────────────────────

/** Well-known storage key: twox128("System") ++ twox128("Events") */
const SYSTEM_EVENTS_KEY = "0x26aa394eea5630e07c48ae0c9558cef780d41e5e16056765bc8461851072c9d7";

// ── SCALE Type Traversal ─────────────────────────────────────────────────────

/** Skip past a SCALE-encoded value of the given type, returning the new offset. */
function skipScaleType(
  bytes: Uint8Array,
  offset: number,
  typeId: number,
  registry: Map<number, ScaleTypeDef>,
  depth = 0,
): number {
  if (depth > 64) throw new Error("Type traversal exceeded depth limit");

  const typeDef = registry.get(typeId);
  if (!typeDef) throw new Error(`Unknown type ID ${typeId}`);

  switch (typeDef.tag) {
    case "primitive": {
      const p = (typeDef.value as { tag: string }).tag;
      if (p === "bool" || p === "u8" || p === "i8") return offset + 1;
      if (p === "u16" || p === "i16") return offset + 2;
      if (p === "u32" || p === "i32" || p === "char") return offset + 4;
      if (p === "u64" || p === "i64") return offset + 8;
      if (p === "u128" || p === "i128") return offset + 16;
      if (p === "u256" || p === "i256") return offset + 32;
      if (p === "str") {
        const len = readCompact(bytes, offset);
        return len.offset + len.value;
      }
      throw new Error(`Unknown primitive: ${p}`);
    }
    case "compact":
      return readCompact(bytes, offset).offset;
    case "sequence": {
      const elemType = typeDef.value as number;
      const len = readCompact(bytes, offset);
      offset = len.offset;
      const elemDef = registry.get(elemType);
      if (elemDef?.tag === "primitive" && (elemDef.value as { tag: string }).tag === "u8") {
        return offset + len.value; // Vec<u8> fast-path
      }
      for (let i = 0; i < len.value; i++) {
        offset = skipScaleType(bytes, offset, elemType, registry, depth + 1);
      }
      return offset;
    }
    case "array": {
      const { len, type: elemType } = typeDef.value as { len: number; type: number };
      const elemDef = registry.get(elemType);
      if (elemDef?.tag === "primitive" && (elemDef.value as { tag: string }).tag === "u8") {
        return offset + len; // [u8; N] fast-path
      }
      for (let i = 0; i < len; i++) {
        offset = skipScaleType(bytes, offset, elemType, registry, depth + 1);
      }
      return offset;
    }
    case "tuple": {
      for (const ft of typeDef.value as number[]) {
        offset = skipScaleType(bytes, offset, ft, registry, depth + 1);
      }
      return offset;
    }
    case "composite": {
      for (const field of typeDef.value as Array<{ type: number }>) {
        offset = skipScaleType(bytes, offset, field.type, registry, depth + 1);
      }
      return offset;
    }
    case "variant": {
      const vi = bytes[offset++];
      const variants = typeDef.value as Array<{ index: number; fields: Array<{ type: number }> }>;
      const variant = variants.find((v) => v.index === vi);
      if (!variant) throw new Error(`Unknown variant ${vi} in type ${typeId}`);
      for (const field of variant.fields ?? []) {
        offset = skipScaleType(bytes, offset, field.type, registry, depth + 1);
      }
      return offset;
    }
    case "bitSequence": {
      const bitLen = readCompact(bytes, offset);
      return bitLen.offset + Math.ceil(bitLen.value / 8);
    }
    default:
      throw new Error(`Unknown type tag: ${typeDef.tag}`);
  }
}

/**
 * Read a SCALE-encoded value, producing a JavaScript value for common types.
 * Falls back to hex strings for complex or unknown types.
 */
function readScaleValue(
  bytes: Uint8Array,
  startOffset: number,
  typeId: number,
  registry: Map<number, ScaleTypeDef>,
  depth = 0,
): { value: unknown; offset: number } {
  if (depth > 16) {
    const end = skipScaleType(bytes, startOffset, typeId, registry, depth);
    return { value: "0x" + bytesToHex(bytes.slice(startOffset, end)), offset: end };
  }

  const typeDef = registry.get(typeId);
  if (!typeDef) return { value: null, offset: startOffset };

  try {
    switch (typeDef.tag) {
      case "primitive": {
        const p = (typeDef.value as { tag: string }).tag;
        if (p === "bool") return { value: bytes[startOffset] !== 0, offset: startOffset + 1 };
        if (p === "u8") return { value: bytes[startOffset], offset: startOffset + 1 };
        if (p === "u16")
          return {
            value: bytes[startOffset]! | (bytes[startOffset + 1]! << 8),
            offset: startOffset + 2,
          };
        if (p === "u32")
          return {
            value:
              (bytes[startOffset]! |
                (bytes[startOffset + 1]! << 8) |
                (bytes[startOffset + 2]! << 16) |
                (bytes[startOffset + 3]! << 24)) >>>
              0,
            offset: startOffset + 4,
          };
        if (p === "u64") {
          let v = BigInt(0);
          for (let i = 0; i < 8; i++) v |= BigInt(bytes[startOffset + i]!) << BigInt(i * 8);
          return { value: v.toString(), offset: startOffset + 8 };
        }
        if (p === "u128") {
          let v = BigInt(0);
          for (let i = 0; i < 16; i++) v |= BigInt(bytes[startOffset + i]!) << BigInt(i * 8);
          return { value: v.toString(), offset: startOffset + 16 };
        }
        break;
      }
      case "compact":
        return readCompact(bytes, startOffset);
      case "array": {
        const { len, type: elemType } = typeDef.value as { len: number; type: number };
        const elemDef = registry.get(elemType);
        if (elemDef?.tag === "primitive" && (elemDef.value as { tag: string }).tag === "u8") {
          return {
            value: "0x" + bytesToHex(bytes.slice(startOffset, startOffset + len)),
            offset: startOffset + len,
          };
        }
        break;
      }
      case "composite": {
        const fields = typeDef.value as Array<{ name?: string; type: number }>;
        if (fields.length === 1) {
          return readScaleValue(bytes, startOffset, fields[0]!.type, registry, depth + 1);
        }
        const obj: Record<string, unknown> = {};
        let off = startOffset;
        for (const field of fields) {
          const r = readScaleValue(bytes, off, field.type, registry, depth + 1);
          obj[field.name ?? `_${field.type}`] = r.value;
          off = r.offset;
        }
        return { value: obj, offset: off };
      }
      case "variant": {
        const idx = bytes[startOffset];
        const off1 = startOffset + 1;
        const variants = typeDef.value as Array<{
          name: string;
          index: number;
          fields: Array<{ name?: string; type: number }>;
        }>;
        const variant = variants.find((v) => v.index === idx);
        if (!variant) break;
        if (variant.fields.length === 0) return { value: variant.name, offset: off1 };
        if (variant.fields.length === 1 && !variant.fields[0]!.name) {
          const inner = readScaleValue(bytes, off1, variant.fields[0]!.type, registry, depth + 1);
          return { value: { [variant.name]: inner.value }, offset: inner.offset };
        }
        const obj: Record<string, unknown> = {};
        let off = off1;
        for (const field of variant.fields) {
          const r = readScaleValue(bytes, off, field.type, registry, depth + 1);
          obj[field.name ?? `_${field.type}`] = r.value;
          off = r.offset;
        }
        return { value: { [variant.name]: obj }, offset: off };
      }
      case "sequence": {
        const elemType = typeDef.value as number;
        const elemDef = registry.get(elemType);
        const len = readCompact(bytes, startOffset);
        if (elemDef?.tag === "primitive" && (elemDef.value as { tag: string }).tag === "u8") {
          return {
            value: "0x" + bytesToHex(bytes.slice(len.offset, len.offset + len.value)),
            offset: len.offset + len.value,
          };
        }
        break;
      }
    }
  } catch {
    // Fall through to hex fallback
  }

  const end = skipScaleType(bytes, startOffset, typeId, registry, depth);
  return { value: "0x" + bytesToHex(bytes.slice(startOffset, end)), offset: end };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface VariantInfo {
  name: string;
  fields: { name: string | null; typeId: number }[];
}

interface PalletCallLookup {
  palletsByIndex: Map<number, { name: string; calls: Map<number, string> }>;
  /** pallet index → Map<call variant index → VariantInfo with field types> */
  callsByPalletIndex: Map<number, Map<number, VariantInfo>>;
  signedExtensions: string[];
  eventsByPalletIndex: Map<number, Map<number, VariantInfo>>;
  rawTypes: Map<number, ScaleTypeDef>;
}

export interface DecodedCallInfo {
  module: string;
  call: string;
  signer: string | null;
  /** Decoded call arguments with named fields (falls back to raw hex on error) */
  args: Record<string, unknown>;
  /** Raw extrinsic hex for tx_hash computation */
  rawHex: string;
  /** Signed extension values extracted from the extrinsic */
  nonce: number | null;
  tip: string | null;
}

export interface DecodedEvent {
  index: number;
  extrinsicIndex: number | null;
  module: string;
  event: string;
  data: Record<string, unknown>;
  phaseType: "ApplyExtrinsic" | "Finalization" | "Initialization";
}

// ── ExtrinsicDecoder ─────────────────────────────────────────────────────────

import type { RpcPool } from "../rpc-pool.js";
import { LRUCache } from "../lru-cache.js";

export class ExtrinsicDecoder {
  private rpcPool: RpcPool;
  private metadataCache = new LRUCache<number, PalletCallLookup>(50); // specVersion → lookup
  private specVersionForBlock = new LRUCache<string, number>(10_000); // blockHash → specVersion
  /** In-flight metadata fetch promises keyed by specVersion — prevents duplicate fetches under concurrency */
  private metadataInflight = new Map<number, Promise<PalletCallLookup>>();

  constructor(rpcPool: RpcPool) {
    this.rpcPool = rpcPool;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Ensure metadata is loaded for the given block's runtime.
   * Returns the cached lookup and the resolved specVersion.
   *
   * Uses promise-based deduplication so that concurrent backfill workers
   * requesting the same specVersion share a single in-flight fetch.
   */
  async ensureMetadata(
    blockHash: string,
  ): Promise<{ lookup: PalletCallLookup; specVersion: number }> {
    let specVersion = this.specVersionForBlock.get(blockHash);

    if (specVersion === undefined) {
      specVersion = await this.fetchSpecVersion(blockHash);
      this.specVersionForBlock.set(blockHash, specVersion);
    }

    // Fast path — already cached
    const existing = this.metadataCache.get(specVersion);
    if (existing) return { lookup: existing, specVersion };

    // Dedup — join an in-flight fetch if one exists
    const inflight = this.metadataInflight.get(specVersion);
    if (inflight) return { lookup: await inflight, specVersion };

    // Start a new fetch and store the promise for dedup
    console.log(`[ExtrinsicDecoder] Fetching metadata for specVersion ${specVersion}`);
    const promise = this.fetchAndDecodeMetadata(blockHash).then((lookup) => {
      this.metadataCache.set(specVersion!, lookup);
      this.metadataInflight.delete(specVersion!);
      return lookup;
    });
    this.metadataInflight.set(specVersion, promise);
    return { lookup: await promise, specVersion };
  }

  /**
   * Decode the call info (pallet name, call name, signer, decoded args,
   * nonce, tip) from a single raw extrinsic hex string.
   */
  decodeCallInfo(hex: string, lookup: PalletCallLookup): DecodedCallInfo {
    const fallback = (
      mod = "Unknown",
      call = "unknown",
      signer: string | null = null,
    ): DecodedCallInfo => ({
      module: mod,
      call,
      signer,
      args: { raw: hex },
      rawHex: hex,
      nonce: null,
      tip: null,
    });

    try {
      const bytes = hexToBytes(hex);

      // 1. Skip compact length prefix
      let { offset } = readCompact(bytes, 0);

      // 2. Version byte — bit 7 indicates signed
      const version = bytes[offset++]!;
      const isSigned = (version & 0x80) !== 0;

      // ── Unsigned extrinsic ──────────────────────────────────────────────
      if (!isSigned) {
        const palletIndex = bytes[offset]!;
        const callIndex = bytes[offset + 1]!;
        const mod = this.resolvePalletName(palletIndex, lookup);
        const call = this.resolveCallName(palletIndex, callIndex, lookup);
        const args = this.decodeCallArgs(bytes, offset + 2, palletIndex, callIndex, lookup);
        return { module: mod, call, signer: null, args, rawHex: hex, nonce: null, tip: null };
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
        return fallback();
      }

      // MultiSignature prefix byte
      const sigType = bytes[offset++];
      if (sigType === 0 || sigType === 1) {
        offset += 64; // Ed25519 or Sr25519
      } else if (sigType === 2) {
        offset += 65; // Ecdsa
      } else {
        return fallback("Unknown", "unknown", signer);
      }

      // Signed extensions — parse and extract nonce + tip
      let nonce: number | null = null;
      let tip: string | null = null;

      for (const extId of lookup.signedExtensions) {
        if (extId === "CheckNonce") {
          const r = readCompact(bytes, offset);
          nonce = r.value;
          offset = r.offset;
        } else if (extId === "ChargeTransactionPayment") {
          const r = readCompact(bytes, offset);
          tip = r.value.toString();
          offset = r.offset;
        } else if (extId === "ChargeAssetTxPayment") {
          const r = readCompact(bytes, offset);
          tip = r.value.toString();
          offset = r.offset;
          // Option<AssetId>
          const hasAssetId = bytes[offset++];
          if (hasAssetId === 1) {
            offset = readCompact(bytes, offset).offset;
          }
        } else {
          const parser = SIGNED_EXTENSION_PARSERS[extId];
          if (parser) {
            offset = parser(bytes, offset);
          } else {
            console.warn(`[ExtrinsicDecoder] Unknown signed extension "${extId}" — offset may drift`);
          }
        }
      }

      // Call data — decode pallet/call and arguments
      if (offset + 1 < bytes.length) {
        const palletIndex = bytes[offset]!;
        const callIndex = bytes[offset + 1]!;
        const mod = this.resolvePalletName(palletIndex, lookup);
        const call = this.resolveCallName(palletIndex, callIndex, lookup);
        const args = this.decodeCallArgs(bytes, offset + 2, palletIndex, callIndex, lookup);
        return { module: mod, call, signer, args, rawHex: hex, nonce, tip };
      }

      return fallback("Unknown", "unknown", signer);
    } catch {
      return fallback();
    }
  }

  /**
   * Extract the timestamp from a `Timestamp.set` inherent extrinsic.
   * Returns the Unix timestamp in milliseconds, or null if the extrinsic
   * is not a Timestamp.set call.
   */
  extractTimestamp(hex: string, module: string, call: string): number | null {
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

  /**
   * Decode all events from a block by reading System.Events storage.
   * Returns an array matching the RawEvent interface from block-processor.
   */
  async decodeEvents(blockHash: string, lookup: PalletCallLookup): Promise<DecodedEvent[]> {
    try {
      const storageHex = await this.rpcCall<string | null>("state_getStorage", [
        SYSTEM_EVENTS_KEY,
        blockHash,
      ]);
      if (!storageHex) return [];

      const bytes = hexToBytes(storageHex);
      let offset = 0;

      // Vec<EventRecord>: compact length prefix
      const count = readCompact(bytes, offset);
      offset = count.offset;

      const events: DecodedEvent[] = [];

      for (let i = 0; i < count.value; i++) {
        // ── Phase ──
        const phaseTag = bytes[offset++];
        let phaseType: DecodedEvent["phaseType"];
        let extrinsicIndex: number | null = null;

        if (phaseTag === 0) {
          // ApplyExtrinsic(u32) — little-endian
          extrinsicIndex =
            bytes[offset]! |
            (bytes[offset + 1]! << 8) |
            (bytes[offset + 2]! << 16) |
            (bytes[offset + 3]! << 24);
          offset += 4;
          phaseType = "ApplyExtrinsic";
        } else if (phaseTag === 1) {
          phaseType = "Finalization";
        } else {
          phaseType = "Initialization";
        }

        // ── RuntimeEvent outer enum ──
        // [pallet variant idx] [inner Event enum variant idx] [fields...]
        const palletIndex = bytes[offset++]!;
        const eventIndex = bytes[offset++]!;

        const palletName = lookup.palletsByIndex.get(palletIndex)?.name ?? `Pallet(${palletIndex})`;
        const eventVariant = lookup.eventsByPalletIndex.get(palletIndex)?.get(eventIndex);
        const eventName = eventVariant?.name ?? `event(${eventIndex})`;

        // ── Event data fields ──
        const data: Record<string, unknown> = {};
        if (eventVariant?.fields && eventVariant.fields.length > 0) {
          for (const field of eventVariant.fields) {
            const r = readScaleValue(bytes, offset, field.typeId, lookup.rawTypes);
            data[field.name ?? `_${field.typeId}`] = r.value;
            offset = r.offset;
          }
        }

        // ── Topics: Vec<H256> ──
        const topicCount = readCompact(bytes, offset);
        offset = topicCount.offset + topicCount.value * 32;

        events.push({
          index: i,
          extrinsicIndex,
          module: palletName,
          event: eventName,
          data,
          phaseType,
        });
      }

      return events;
    } catch (err) {
      console.error(`[ExtrinsicDecoder] Failed to decode events for ${blockHash}:`, err);
      return [];
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Decode call arguments using the metadata type registry.
   * Looks up the call variant's field definitions and reads each argument
   * using readScaleValue. Falls back to raw hex on any error.
   */
  private decodeCallArgs(
    bytes: Uint8Array,
    offset: number,
    palletIndex: number,
    callIndex: number,
    lookup: PalletCallLookup,
  ): Record<string, unknown> {
    try {
      const callVariant = lookup.callsByPalletIndex.get(palletIndex)?.get(callIndex);

      if (!callVariant || callVariant.fields.length === 0) {
        return {};
      }

      const args: Record<string, unknown> = {};
      let off = offset;
      for (const field of callVariant.fields) {
        const r = readScaleValue(bytes, off, field.typeId, lookup.rawTypes);
        args[field.name ?? `arg_${field.typeId}`] = r.value;
        off = r.offset;
      }
      return args;
    } catch {
      // On any decode error, return the remaining bytes as raw hex
      return { raw: "0x" + bytesToHex(bytes.slice(offset)) };
    }
  }

  private resolvePalletName(index: number, lookup: PalletCallLookup): string {
    return lookup.palletsByIndex.get(index)?.name ?? `Pallet(${index})`;
  }

  private resolveCallName(
    palletIndex: number,
    callIndex: number,
    lookup: PalletCallLookup,
  ): string {
    const pallet = lookup.palletsByIndex.get(palletIndex);
    if (!pallet) return `call(${callIndex})`;
    return pallet.calls.get(callIndex) ?? `call(${callIndex})`;
  }

  private async fetchSpecVersion(blockHash: string): Promise<number> {
    const json = await this.rpcCall<{ specVersion?: number }>("state_getRuntimeVersion", [blockHash]);
    return json?.specVersion ?? 0;
  }

  private async fetchAndDecodeMetadata(blockHash: string): Promise<PalletCallLookup> {
    const metaHex = await this.rpcCall<string>("state_getMetadata", [blockHash]);

    const metaBytes = hexToBytes(metaHex);

    const decoded = decAnyMetadata(metaBytes);
    const v = decoded.metadata.value as {
      pallets: Array<{ name: string; index: number; calls?: number; events?: number }>;
      lookup: Array<{ id: number; def: ScaleTypeDef }>;
      extrinsic: { signedExtensions?: Array<{ identifier: string }> };
    };

    // Build pallet index → { name, calls } lookup
    const palletsByIndex = new Map<number, { name: string; calls: Map<number, string> }>();

    const lookupFn = getLookupFn(v);

    for (const pallet of v.pallets) {
      const calls = new Map<number, string>();

      if (pallet.calls != null) {
        try {
          const callType = lookupFn(pallet.calls);
          if (callType.type === "enum") {
            for (const [name, info] of Object.entries(
              callType.value as Record<string, { idx: number }>,
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

    // Build raw type registry for SCALE traversal

    const rawTypes = new Map<number, ScaleTypeDef>();
    for (const entry of v.lookup) {
      rawTypes.set(entry.id, entry.def);
    }

    // Build call lookup: pallet index → Map<call_variant_idx → VariantInfo with field types>
    const callsByPalletIndex = new Map<number, Map<number, VariantInfo>>();
    for (const pallet of v.pallets) {
      if (pallet.calls != null) {
        const callMap = new Map<number, VariantInfo>();
        const typeEntry = rawTypes.get(pallet.calls);
        if (typeEntry && typeEntry.tag === "variant") {
          for (const variant of typeEntry.value as Array<{
            name: string;
            index: number;
            fields: Array<{ name?: string; type: number }>;
          }>) {
            callMap.set(variant.index, {
              name: variant.name,
              fields: (variant.fields ?? []).map((f) => ({
                name: f.name ?? null,
                typeId: f.type,
              })),
            });
          }
        }
        callsByPalletIndex.set(pallet.index, callMap);
      }
    }

    // Build event lookup: pallet index → Map<event_variant_idx → VariantInfo>
    const eventsByPalletIndex = new Map<number, Map<number, VariantInfo>>();
    for (const pallet of v.pallets) {
      if (pallet.events != null) {
        const evtMap = new Map<number, VariantInfo>();
        const typeEntry = rawTypes.get(pallet.events);
        if (typeEntry && typeEntry.tag === "variant") {
          for (const variant of typeEntry.value as Array<{
            name: string;
            index: number;
            fields: Array<{ name?: string; type: number }>;
          }>) {
            evtMap.set(variant.index, {
              name: variant.name,
              fields: (variant.fields ?? []).map((f) => ({
                name: f.name ?? null,
                typeId: f.type,
              })),
            });
          }
        }
        eventsByPalletIndex.set(pallet.index, evtMap);
      }
    }

    // Extract signed extension identifiers
    const signedExtensions: string[] = (
      (v.extrinsic.signedExtensions ?? []) as Array<{ identifier: string }>
    ).map((ext) => ext.identifier);

    return { palletsByIndex, callsByPalletIndex, signedExtensions, eventsByPalletIndex, rawTypes };
  }

  private async rpcCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
    return this.rpcPool.call<T>(method, params);
  }
}
