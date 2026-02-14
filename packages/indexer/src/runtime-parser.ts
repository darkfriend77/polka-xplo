/**
 * Runtime Metadata Parser — extracts pallet summaries from on-chain metadata.
 *
 * For each pallet, counts: calls, events, storage items, constants, error variants.
 * Uses the same PAPI libraries as ExtrinsicDecoder but with a focused, read-only interface.
 */

import { createRequire } from "node:module";
import type { RpcPool } from "./rpc-pool.js";
import { hexToBytes } from "./hex-utils.js";

const require2 = createRequire(import.meta.url);

/** Shape of a SCALE type definition from the metadata lookup table */
type ScaleTypeDef = { tag: string; value: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PAPI types are untyped
const { decAnyMetadata } = require2("@polkadot-api/substrate-bindings") as {
  decAnyMetadata: (bytes: Uint8Array) => { metadata: { tag: string; value: unknown } };
};

export interface PalletSummary {
  name: string;
  index: number;
  callCount: number;
  eventCount: number;
  storageCount: number;
  constantCount: number;
  errorCount: number;
}

import { LRUCache } from "./lru-cache.js";

export interface RuntimeSummary {
  specVersion: number;
  pallets: PalletSummary[];
}

/** Cache: specVersion → RuntimeSummary (bounded to 50 entries) */
const runtimeCache = new LRUCache<number, RuntimeSummary>(50);

/**
 * Count the number of variants in a type definition from the raw types registry.
 * For calls, events, and errors these are variant (enum) types.
 */
function countVariants(
  typeId: number | undefined | null,
  rawTypes: Map<number, ScaleTypeDef>,
): number {
  if (typeId == null) return 0;
  const entry = rawTypes.get(typeId);
  if (!entry || entry.tag !== "variant") return 0;
  return (entry.value as Array<unknown>).length;
}

/**
 * Count storage items from a pallet's storage definition.
 * The storage field is an object with an `items` array.
 */
function countStorage(storage: { items: Array<unknown> } | undefined | null): number {
  if (!storage?.items) return 0;
  return storage.items.length;
}

/**
 * Count constants from a pallet's constants array.
 */
function countConstants(constants: Array<unknown> | undefined | null): number {
  if (!constants) return 0;
  return constants.length;
}

/**
 * Fetch and parse the runtime metadata for a given block hash,
 * returning a summary of all pallets with their function/event/storage/constant/error counts.
 */
export async function getRuntimeSummary(
  rpcPool: RpcPool,
  blockHash: string,
  specVersion: number,
): Promise<RuntimeSummary> {
  // Check cache
  const cached = runtimeCache.get(specVersion);
  if (cached) return cached;

  // Fetch raw metadata
  const metaHex = await rpcPool.call<string>("state_getMetadata", [blockHash]);
  const metaBytes = hexToBytes(metaHex);
  const decoded = decAnyMetadata(metaBytes);
  const v = decoded.metadata.value as {
    lookup: Array<{ id: number; def: ScaleTypeDef }>;
    pallets: Array<{
      name: string;
      index: number;
      calls?: number;
      events?: number;
      errors?: number;
      storage?: { items: Array<unknown> };
      constants?: Array<unknown>;
    }>;
  };

  // Build raw type registry (same as ExtrinsicDecoder)
  const rawTypes = new Map<number, ScaleTypeDef>();
  for (const entry of v.lookup) {
    rawTypes.set(entry.id, entry.def);
  }

  // Extract pallet summaries
  const pallets: PalletSummary[] = [];
  for (const pallet of v.pallets) {
    pallets.push({
      name: pallet.name,
      index: pallet.index,
      callCount: countVariants(pallet.calls, rawTypes),
      eventCount: countVariants(pallet.events, rawTypes),
      storageCount: countStorage(pallet.storage),
      constantCount: countConstants(pallet.constants),
      errorCount: countVariants(pallet.errors, rawTypes),
    });
  }

  // Sort alphabetically by name
  pallets.sort((a, b) => a.name.localeCompare(b.name));

  const summary: RuntimeSummary = { specVersion, pallets };
  runtimeCache.set(specVersion, summary);
  return summary;
}

// ============================================================
// Constant extraction from runtime metadata
// ============================================================

/** Cached existential deposit value (only changes on runtime upgrades). */
let cachedED: string | null = null;

/**
 * Extract the Balances.ExistentialDeposit constant from the latest runtime metadata.
 *
 * Fetches `state_getMetadata` (no block hash → latest), decodes it, and
 * reads the u128 LE value from the Balances pallet constants.
 * The result is cached for the lifetime of the process since it only
 * changes on runtime upgrades (which restart the indexer).
 */
export async function getExistentialDeposit(rpcPool: RpcPool): Promise<string> {
  if (cachedED !== null) return cachedED;

  const metaHex = await rpcPool.call<string>("state_getMetadata", []);
  const metaBytes = hexToBytes(metaHex);
  const decoded = decAnyMetadata(metaBytes);
  const pallets = (decoded.metadata.value as { pallets: Array<{
    name: string;
    constants?: Array<{ name: string; value: Uint8Array }>;
  }> }).pallets;

  for (const pallet of pallets) {
    if (pallet.name === "Balances") {
      for (const constant of pallet.constants ?? []) {
        if (constant.name === "ExistentialDeposit") {
          const bytes =
            constant.value instanceof Uint8Array
              ? constant.value
              : hexToBytes(String(constant.value));
          // u128 little-endian
          let value = 0n;
          for (let i = 0; i < 16; i++) {
            value |= BigInt(bytes[i]!) << BigInt(i * 8);
          }
          cachedED = value.toString();
          return cachedED;
        }
      }
    }
  }

  cachedED = "0";
  return cachedED;
}
