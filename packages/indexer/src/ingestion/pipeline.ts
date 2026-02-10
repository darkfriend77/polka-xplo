import { createRequire } from "node:module";
import type { PapiClient } from "../client.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { processBlock, type RawBlockData, type RawExtrinsic, type RawEvent } from "./block-processor.js";
import { ExtrinsicDecoder } from "./extrinsic-decoder.js";
import {
  getLastFinalizedHeight,
  upsertIndexerState,
  finalizeBlock,
} from "@polka-xplo/db";
import type { BlockStatus, DigestLog } from "@polka-xplo/shared";

// Blake2-256 hash for computing extrinsic tx_hash
const require2 = createRequire(import.meta.url);
const { Blake2256 } = require2("@polkadot-api/substrate-bindings") as {
  Blake2256: (input: Uint8Array) => Uint8Array;
};

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compute Blake2-256 hash of a raw extrinsic hex, returning 0x-prefixed hash */
function computeTxHash(rawHex: string): string {
  const bytes = hexToBytes(rawHex);
  return "0x" + bytesToHex(Blake2256(bytes));
}

/**
 * Post-process extrinsics with decoded events to fill in success/fee.
 * Correlates System.ExtrinsicSuccess / ExtrinsicFailed events and
 * TransactionPayment.TransactionFeePaid events.
 */
function enrichExtrinsicsFromEvents(
  extrinsics: RawExtrinsic[],
  events: RawEvent[]
): void {
  for (const evt of events) {
    if (evt.extrinsicIndex == null) continue;
    const ext = extrinsics[evt.extrinsicIndex];
    if (!ext) continue;

    if (evt.module === "System" && evt.event === "ExtrinsicFailed") {
      ext.success = false;
    }
    if (evt.module === "TransactionPayment" && evt.event === "TransactionFeePaid") {
      const fee = evt.data?.actual_fee ?? evt.data?.actualFee;
      if (fee != null) ext.fee = String(fee);
    }
  }
}

/**
 * The Ingestion Pipeline manages the dual-stream architecture:
 * 1. The Canonical (Finalized) Stream — source of truth
 * 2. The Live (Best Head) Stream — optimistic updates
 *
 * It also handles backfilling gaps when the indexer restarts.
 *
 * PAPI PolkadotClient API used:
 * - client.finalizedBlock$        → Observable<BlockInfo>  { hash, number, parent }
 * - client.bestBlocks$            → Observable<BlockInfo[]> [best, ..., finalized]
 * - client.getFinalizedBlock()    → Promise<BlockInfo>
 * - client.getBestBlocks()        → Promise<BlockInfo[]>
 * - client.getBlockHeader(hash?)  → Promise<BlockHeader>   { parentHash, number, stateRoot, extrinsicRoot, digests }
 * - client.getBlockBody(hash)     → Promise<HexString[]>   (SCALE-encoded extrinsics)
 */
export class IngestionPipeline {
  private papiClient: PapiClient;
  private registry: PluginRegistry;
  private chainId: string;
  private decoder: ExtrinsicDecoder;
  private running = false;
  private finalizedUnsub: (() => void) | null = null;
  private bestUnsub: (() => void) | null = null;

  constructor(papiClient: PapiClient, registry: PluginRegistry) {
    this.papiClient = papiClient;
    this.registry = registry;
    this.chainId = papiClient.chainConfig.id;
    this.decoder = new ExtrinsicDecoder(papiClient.chainConfig.rpc[0]);
  }

  /** Start the ingestion pipeline */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`[Pipeline:${this.chainId}] Starting ingestion pipeline...`);

    // Phase 1: Backfill any missed finalized blocks
    await this.backfill();

    // Phase 2: Subscribe to live streams
    this.subscribeFinalized();
    this.subscribeBestHead();

    console.log(`[Pipeline:${this.chainId}] Pipeline is live.`);
  }

  /** Stop the pipeline gracefully */
  async stop(): Promise<void> {
    this.running = false;
    if (this.finalizedUnsub) this.finalizedUnsub();
    if (this.bestUnsub) this.bestUnsub();
    console.log(`[Pipeline:${this.chainId}] Pipeline stopped.`);
  }

  /**
   * Backfill: fetch any blocks between our last indexed height
   * and the chain's current finalized head.
   */
  private async backfill(): Promise<void> {
    const dbHeight = await getLastFinalizedHeight();
    const chainTip = await this.getChainFinalizedHeight();

    if (chainTip <= dbHeight) {
      console.log(`[Pipeline:${this.chainId}] No backfill needed. DB at ${dbHeight}, chain at ${chainTip}`);
      return;
    }

    const gap = chainTip - dbHeight;
    console.log(`[Pipeline:${this.chainId}] Backfilling ${gap} blocks (${dbHeight + 1} -> ${chainTip})`);

    await upsertIndexerState(this.chainId, dbHeight, dbHeight, "syncing");

    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "100", 10);
    const CONCURRENCY = Math.min(parseInt(process.env.BACKFILL_CONCURRENCY ?? "10", 10), BATCH_SIZE);

    for (let start = dbHeight + 1; start <= chainTip; start += BATCH_SIZE) {
      if (!this.running) break;

      const end = Math.min(start + BATCH_SIZE - 1, chainTip);

      // Process blocks with bounded concurrency to avoid overwhelming RPC/DB
      const heights: number[] = [];
      for (let height = start; height <= end; height++) {
        heights.push(height);
      }
      await this.runWithConcurrency(
        heights,
        (height) => this.fetchAndProcessByHash(null, height, "finalized"),
        CONCURRENCY
      );

      await upsertIndexerState(this.chainId, end, end, "syncing");

      if ((end - dbHeight) % 1000 === 0 || end === chainTip) {
        console.log(`[Pipeline:${this.chainId}] Backfill progress: ${end}/${chainTip}`);
      }
    }

    await upsertIndexerState(this.chainId, chainTip, chainTip, "live");
    console.log(`[Pipeline:${this.chainId}] Backfill complete.`);
  }

  /** Subscribe to the finalized block stream */
  private subscribeFinalized(): void {
    const { client } = this.papiClient;

    const sub = client.finalizedBlock$.subscribe({
      next: async (block) => {
        try {
          console.log(`[Pipeline:${this.chainId}] Finalized block #${block.number}`);

          await this.fetchAndProcessByHash(block.hash, block.number, "finalized");
          await finalizeBlock(block.number);
          await upsertIndexerState(this.chainId, block.number, block.number, "live");
        } catch (err) {
          console.error(`[Pipeline:${this.chainId}] Error processing finalized block:`, err);
        }
      },
      error: (err) => {
        console.error(`[Pipeline:${this.chainId}] Finalized stream error:`, err);
      },
    });

    this.finalizedUnsub = () => sub.unsubscribe();
  }

  /** Subscribe to the best (unfinalized) block stream */
  private subscribeBestHead(): void {
    const { client } = this.papiClient;

    const sub = client.bestBlocks$.subscribe({
      next: async (blocks) => {
        try {
          // bestBlocks$ emits [best, ..., finalized]
          const latest = blocks[0];
          if (!latest) return;

          console.log(`[Pipeline:${this.chainId}] Best block #${latest.number}`);
          await this.fetchAndProcessByHash(latest.hash, latest.number, "best");
        } catch (err) {
          console.error(`[Pipeline:${this.chainId}] Error processing best block:`, err);
        }
      },
      error: (err) => {
        console.error(`[Pipeline:${this.chainId}] Best stream error:`, err);
      },
    });

    this.bestUnsub = () => sub.unsubscribe();
  }

  /**
   * Fetch a block by its hash (from subscription) and run it through the processor.
   * If hash is null (backfill by height), we look it up from the best/finalized blocks.
   */
  private async fetchAndProcessByHash(
    blockHash: string | null,
    height: number,
    status: BlockStatus
  ): Promise<void> {
    const rawBlock = await this.fetchBlock(blockHash, height);
    if (!rawBlock) {
      console.warn(`[Pipeline:${this.chainId}] Could not fetch block #${height}`);
      return;
    }

    await processBlock(rawBlock, status, this.registry);
  }

  /**
   * Fetch and extract a block using PAPI's PolkadotClient for live blocks,
   * or falling back to legacy JSON-RPC for historical blocks.
   *
   * PAPI's chainHead_v1 subscription only covers blocks in the current follow
   * window (recent finalized + best head forks). Historical blocks during
   * backfill must be fetched via the legacy `chain_getBlock` JSON-RPC method.
   */
  private async fetchBlock(
    blockHash: string | null,
    height: number
  ): Promise<RawBlockData | null> {
    // If we have a hash from a live subscription, try PAPI first
    if (blockHash) {
      try {
        return await this.fetchBlockViaPapi(blockHash, height);
      } catch {
        // Fall through to legacy RPC
      }
    }

    // For backfill or if PAPI fails, use legacy JSON-RPC
    return this.fetchBlockViaLegacyRpc(height);
  }

  /** Fetch a block via PAPI client (for live/recent blocks in chainHead follow window) */
  private async fetchBlockViaPapi(
    blockHash: string,
    height: number
  ): Promise<RawBlockData | null> {
    try {
      const { client } = this.papiClient;

      const [header, body] = await Promise.all([
        client.getBlockHeader(blockHash),
        client.getBlockBody(blockHash),
      ]);

      // Decode extrinsic call info using runtime metadata
      const { lookup, specVersion } = await this.decoder.ensureMetadata(blockHash);
      let timestamp: number | null = null;

      const extrinsics: RawBlockData["extrinsics"] = body.map(
        (encodedExt, i) => {
          const decoded = this.decoder.decodeCallInfo(encodedExt, lookup);
          const ts = this.decoder.extractTimestamp(
            encodedExt,
            decoded.module,
            decoded.call
          );
          if (ts !== null) timestamp = ts;

          return {
            index: i,
            hash: decoded.signer ? computeTxHash(decoded.rawHex) : null,
            signer: decoded.signer,
            module: decoded.module,
            call: decoded.call,
            args: decoded.args,
            success: true, // will be corrected by enrichExtrinsicsFromEvents
            fee: null,     // will be filled by enrichExtrinsicsFromEvents
            tip: decoded.tip,
          };
        }
      );

      // Decode events from System.Events storage
      const decodedEvents = await this.decoder.decodeEvents(blockHash, lookup);
      const events: RawBlockData["events"] = decodedEvents.map((evt) => ({
        index: evt.index,
        extrinsicIndex: evt.extrinsicIndex,
        module: evt.module,
        event: evt.event,
        data: evt.data,
        phaseType: evt.phaseType,
      }));

      // Correlate success/fee from events back into extrinsics
      enrichExtrinsicsFromEvents(extrinsics, events);

      const hasRuntimeUpgrade = header.digests.some(
        (d) => d.type === "runtimeUpdated"
      );
      if (hasRuntimeUpgrade) {
        console.log(
          `[Pipeline:${this.chainId}] Runtime upgrade detected at block #${height}`
        );
      }

      // Parse PAPI digest items into our DigestLog format
      const digestLogs: DigestLog[] = header.digests.map((d) => {
        const type = d.type === "runtimeUpdated"
          ? "runtimeEnvironmentUpdated"
          : d.type;
        const value = d.value as { engine?: string; payload?: string } | undefined;
        return {
          type,
          engine: value?.engine ?? null,
          data: value?.payload ?? "",
        };
      });

      return {
        number: header.number,
        hash: blockHash,
        parentHash: header.parentHash,
        stateRoot: header.stateRoot,
        extrinsicsRoot: header.extrinsicRoot,
        extrinsics,
        events,
        digestLogs,
        timestamp,
        validatorId: null,
        specVersion,
      };
    } catch (err) {
      console.error(`[Pipeline:${this.chainId}] PAPI fetchBlock failed for #${height}:`, err);
      return null;
    }
  }

  /**
   * Fetch a block via legacy `chain_getBlock` JSON-RPC.
   * Works for any historical block on archive/full nodes that support
   * the legacy (pre-v2) JSON-RPC API.
   */
  private async fetchBlockViaLegacyRpc(
    height: number
  ): Promise<RawBlockData | null> {
    try {
      const rpcUrl = this.papiClient.chainConfig.rpc[0];
      const httpUrl = rpcUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

      // 1. Resolve block hash
      const hash = await this.rpcGetBlockHash(rpcUrl, height);
      if (!hash) return null;

      // 2. Fetch the full block via chain_getBlock
      const res = await fetch(httpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "chain_getBlock",
          params: [hash],
        }),
      });
      const json = (await res.json()) as {
        result?: {
          block: {
            header: {
              parentHash: string;
              number: string;
              stateRoot: string;
              extrinsicsRoot: string;
              digest: { logs: string[] };
            };
            extrinsics: string[];
          };
        };
        error?: { code: number; message: string };
      };

      if (!json.result?.block) {
        console.warn(`[Pipeline:${this.chainId}] chain_getBlock returned no data for #${height}`);
        return null;
      }

      const { header, extrinsics: rawExts } = json.result.block;
      const blockNumber = parseInt(header.number, 16);

      // Decode extrinsic call info using runtime metadata
      const { lookup, specVersion } = await this.decoder.ensureMetadata(hash);
      let timestamp: number | null = null;

      const extrinsics: RawBlockData["extrinsics"] = rawExts.map(
        (encodedExt, i) => {
          const decoded = this.decoder.decodeCallInfo(encodedExt, lookup);
          const ts = this.decoder.extractTimestamp(
            encodedExt,
            decoded.module,
            decoded.call
          );
          if (ts !== null) timestamp = ts;

          return {
            index: i,
            hash: decoded.signer ? computeTxHash(decoded.rawHex) : null,
            signer: decoded.signer,
            module: decoded.module,
            call: decoded.call,
            args: decoded.args,
            success: true, // will be corrected by enrichExtrinsicsFromEvents
            fee: null,     // will be filled by enrichExtrinsicsFromEvents
            tip: decoded.tip,
          };
        }
      );

      // Decode events from System.Events storage
      const decodedEvents = await this.decoder.decodeEvents(hash, lookup);
      const events: RawBlockData["events"] = decodedEvents.map((evt) => ({
        index: evt.index,
        extrinsicIndex: evt.extrinsicIndex,
        module: evt.module,
        event: evt.event,
        data: evt.data,
        phaseType: evt.phaseType,
      }));

      // Correlate success/fee from events back into extrinsics
      enrichExtrinsicsFromEvents(extrinsics, events);

      // Parse legacy RPC digest logs
      const digestLogs: DigestLog[] = (header.digest?.logs ?? []).map(
        (hexLog: string) => parseDigestLogHex(hexLog)
      );

      return {
        number: blockNumber,
        hash,
        parentHash: header.parentHash,
        stateRoot: header.stateRoot,
        extrinsicsRoot: header.extrinsicsRoot,
        extrinsics,
        events,
        digestLogs,
        timestamp,
        validatorId: null,
        specVersion,
      };
    } catch (err) {
      console.error(`[Pipeline:${this.chainId}] Legacy RPC failed for block #${height}:`, err);
      return null;
    }
  }

  /** Call chain_getBlockHash via direct JSON-RPC */
  private async rpcGetBlockHash(rpcUrl: string, height: number): Promise<string | null> {
    // Convert WSS URL to HTTPS for JSON-RPC calls
    const httpUrl = rpcUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
    try {
      const res = await fetch(httpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "chain_getBlockHash",
          params: [height],
        }),
      });
      const json = await res.json() as { result?: string; error?: unknown };
      if (json.result && typeof json.result === "string") {
        return json.result;
      }
      return null;
    } catch (err) {
      console.warn(`[Pipeline:${this.chainId}] RPC chain_getBlockHash(${height}) failed:`, err);
      return null;
    }
  }

  /** Run tasks with bounded concurrency */
  private async runWithConcurrency<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
    concurrency: number
  ): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        await fn(items[i]);
      }
    });
    await Promise.all(workers);
  }

  private async getChainFinalizedHeight(): Promise<number> {
    try {
      const { client } = this.papiClient;
      const block = await client.getFinalizedBlock();
      return block.number;
    } catch {
      return 0;
    }
  }
}

// ============================================================
// Digest Log Parsing (Legacy RPC hex-encoded DigestItem)
// ============================================================

const DIGEST_TYPES: Record<number, string> = {
  0: "other",
  4: "consensus",
  5: "seal",
  6: "preRuntime",
  8: "runtimeEnvironmentUpdated",
};

/** Parse a single hex-encoded SCALE DigestItem from legacy JSON-RPC */
function parseDigestLogHex(hex: string): DigestLog {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const typeTag = parseInt(clean.slice(0, 2), 16);
  const type = DIGEST_TYPES[typeTag] ?? `unknown(${typeTag})`;

  // PreRuntime, Consensus, Seal all have: [type_u8] [engine_id: 4 bytes] [SCALE Vec<u8>]
  if (typeTag === 4 || typeTag === 5 || typeTag === 6) {
    const engineHex = clean.slice(2, 10); // 4 bytes = 8 hex chars
    const engine = Buffer.from(engineHex, "hex").toString("ascii");
    const data = "0x" + clean.slice(10);
    return { type, engine, data };
  }

  // RuntimeEnvironmentUpdated: no payload
  if (typeTag === 8) {
    return { type, engine: null, data: "" };
  }

  // Other: rest is SCALE Vec<u8>
  return { type, engine: null, data: "0x" + clean.slice(2) };
}
