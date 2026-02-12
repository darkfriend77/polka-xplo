import type {
  Block,
  Extrinsic,
  ExplorerEvent,
  BlockContext,
  BlockStatus,
} from "@polka-xplo/shared";
import {
  insertBlock,
  insertExtrinsic,
  insertEvent,
  upsertAccount,
  transaction,
} from "@polka-xplo/db";
import type { PluginRegistry } from "../plugins/registry.js";
import { extractAccountsFromEvent } from "../event-utils.js";

export interface RawBlockData {
  number: number;
  hash: string;
  parentHash: string;
  stateRoot: string;
  extrinsicsRoot: string;
  extrinsics: RawExtrinsic[];
  events: RawEvent[];
  digestLogs: { type: string; engine: string | null; data: string }[];
  timestamp: number | null;
  validatorId: string | null;
  specVersion: number;
}

/** Maximum serialized args size in bytes before truncation (4 KB) */
const ARGS_SIZE_LIMIT = 4096;

/**
 * If serialized args exceed ARGS_SIZE_LIMIT, replace with a compact
 * marker so the extrinsics table stays manageable.
 */
function truncateOversizedArgs(args: Record<string, unknown>): Record<string, unknown> {
  const json = JSON.stringify(args);
  if (json.length <= ARGS_SIZE_LIMIT) return args;
  return { _oversized: true, _originalBytes: json.length };
}

export interface RawExtrinsic {
  index: number;
  hash: string | null;
  signer: string | null;
  module: string;
  call: string;
  args: Record<string, unknown>;
  success: boolean;
  fee: string | null;
  tip: string | null;
}

export interface RawEvent {
  index: number;
  extrinsicIndex: number | null;
  module: string;
  event: string;
  data: Record<string, unknown>;
  phaseType: "ApplyExtrinsic" | "Finalization" | "Initialization";
}

/**
 * Process a single block: store block, extrinsics, events,
 * update accounts, and invoke extension plugins.
 *
 * Retries on deadlock (PostgreSQL error 40P01) which can occur
 * when concurrent workers upsert the same accounts.
 */
export async function processBlock(
  raw: RawBlockData,
  status: BlockStatus,
  registry: PluginRegistry,
): Promise<void> {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await processBlockInner(raw, status, registry);
      return; // success
    } catch (err: unknown) {
      const pgCode = (err as { code?: string }).code;
      if (pgCode === "40P01" && attempt < MAX_RETRIES) {
        // Deadlock — wait briefly with jitter and retry
        const delay = 50 + Math.random() * 150 * attempt;
        console.warn(`[Block ${raw.number}] Deadlock detected, retry ${attempt}/${MAX_RETRIES} in ${delay.toFixed(0)}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function processBlockInner(
  raw: RawBlockData,
  status: BlockStatus,
  registry: PluginRegistry,
): Promise<void> {
  const blockCtx: BlockContext = {
    blockHeight: raw.number,
    blockHash: raw.hash,
    timestamp: raw.timestamp,
    specVersion: raw.specVersion,
  };

  // Wrap all DB writes in a single transaction to prevent partial data on failure
  await transaction(async (client) => {
    // 1. Build and store the block record
    const block: Block = {
      height: raw.number,
      hash: raw.hash,
      parentHash: raw.parentHash,
      stateRoot: raw.stateRoot,
      extrinsicsRoot: raw.extrinsicsRoot,
      timestamp: raw.timestamp,
      validatorId: raw.validatorId,
      status,
      specVersion: raw.specVersion,
      eventCount: raw.events.length,
      extrinsicCount: raw.extrinsics.length,
      digestLogs: raw.digestLogs,
    };

    await insertBlock(block, client);

    // Invoke onBlock hooks
    await registry.invokeBlockHandlers(blockCtx, block);

    // 2. Process extrinsics
    const extrinsicMap = new Map<number, string>(); // index -> id

    for (const rawExt of raw.extrinsics) {
      const extId = `${raw.number}-${rawExt.index}`;
      extrinsicMap.set(rawExt.index, extId);

      const extrinsic: Extrinsic = {
        id: extId,
        blockHeight: raw.number,
        txHash: rawExt.hash,
        index: rawExt.index,
        signer: rawExt.signer,
        module: rawExt.module,
        call: rawExt.call,
        args: truncateOversizedArgs(rawExt.args),
        success: rawExt.success,
        fee: rawExt.fee,
        tip: rawExt.tip,
      };

      await insertExtrinsic(extrinsic, client);

      // Track signer account
      if (rawExt.signer) {
        await upsertAccount(rawExt.signer, rawExt.signer, raw.number, client);
      }

      // Invoke extension extrinsic handlers
      await registry.invokeExtrinsicHandlers(blockCtx, extrinsic);
    }

    // 3. Process events and correlate with extrinsics
    for (const rawEvt of raw.events) {
      const evtId = `${raw.number}-${rawEvt.index}`;
      const extrinsicId =
        rawEvt.extrinsicIndex !== null ? (extrinsicMap.get(rawEvt.extrinsicIndex) ?? null) : null;

      const event: ExplorerEvent = {
        id: evtId,
        blockHeight: raw.number,
        extrinsicId,
        index: rawEvt.index,
        module: rawEvt.module,
        event: rawEvt.event,
        data: rawEvt.data,
        phase:
          rawEvt.phaseType === "ApplyExtrinsic"
            ? { type: "ApplyExtrinsic", index: rawEvt.extrinsicIndex! }
            : rawEvt.phaseType === "Finalization"
              ? { type: "Finalization" }
              : { type: "Initialization" },
      };

      await insertEvent(event, client);

      // Track accounts referenced in events
      const addrs = extractAccountsFromEvent(rawEvt);
      for (const addr of addrs) {
        await upsertAccount(addr, addr, raw.number, client);
      }

      // Invoke extension event handlers
      await registry.invokeEventHandlers(blockCtx, event);
    }
  });
}
