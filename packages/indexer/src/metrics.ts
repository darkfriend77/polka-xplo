/**
 * IndexerMetrics — in-memory metrics collector for the ingestion pipeline.
 *
 * Tracks block processing throughput, error counts, sync state,
 * and chain tip to power the /api/indexer-status dashboard endpoint.
 *
 * Uses a rolling window (ring buffer) of block timestamps to compute
 * blocks/minute and blocks/hour rates.
 */

export interface MetricsSnapshot {
  /** Unix ms when the indexer process started */
  startedAt: number;
  /** Current uptime in seconds */
  uptimeSeconds: number;
  /** Pipeline state: idle | syncing | live */
  state: "idle" | "syncing" | "live";
  /** Total blocks processed since start */
  blocksProcessed: number;
  /** Current indexed height */
  indexedHeight: number;
  /** Chain finalized tip from RPC */
  chainTip: number;
  /** Blocks remaining to sync */
  blocksRemaining: number;
  /** Sync percentage (0-100) */
  syncPercent: number;
  /** Blocks processed in the last 60 seconds */
  blocksPerMinute: number;
  /** Blocks processed in the last 3600 seconds */
  blocksPerHour: number;
  /** Estimated seconds until fully synced (null if live or rate is 0) */
  etaSeconds: number | null;
  /** Total errors encountered */
  errorCount: number;
  /** Node.js process memory usage */
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  /** Block processing time stats (ms per block) */
  blockProcessingTime: {
    avg: number;
    p50: number;
    p95: number;
    max: number;
    count: number;
  };
}

const WINDOW_SIZE = 7200; // keep last 2 hours of block timestamps

const BLOCK_TIME_WINDOW = 1000; // keep last 1000 block processing times

class IndexerMetrics {
  private startedAt = Date.now();
  private state: "idle" | "syncing" | "live" = "idle";
  private blocksProcessed = 0;
  private indexedHeight = 0;
  private chainTip = 0;
  private errorCount = 0;

  /** Ring buffer of block processing timestamps (for rate calculation) */
  private blockTimestamps: number[] = [];
  /** Ring buffer of block processing durations in ms */
  private blockProcessingTimes: number[] = [];

  /** Record a successfully processed block */
  recordBlock(height: number, processingTimeMs?: number): void {
    this.blocksProcessed++;
    if (height > this.indexedHeight) {
      this.indexedHeight = height;
    }
    const now = Date.now();
    this.blockTimestamps.push(now);
    // Trim: keep only the last WINDOW_SIZE entries
    if (this.blockTimestamps.length > WINDOW_SIZE) {
      this.blockTimestamps = this.blockTimestamps.slice(-WINDOW_SIZE);
    }
    if (processingTimeMs !== undefined) {
      this.blockProcessingTimes.push(processingTimeMs);
      if (this.blockProcessingTimes.length > BLOCK_TIME_WINDOW) {
        this.blockProcessingTimes = this.blockProcessingTimes.slice(-BLOCK_TIME_WINDOW);
      }
    }
  }

  /** Record an error */
  recordError(): void {
    this.errorCount++;
  }

  /** Update the pipeline state */
  setState(state: "idle" | "syncing" | "live"): void {
    this.state = state;
  }

  /** Update the known chain tip */
  setChainTip(tip: number): void {
    if (tip > this.chainTip) {
      this.chainTip = tip;
    }
  }

  /** Seed the indexed height from the database on startup */
  seedIndexedHeight(height: number): void {
    if (height > this.indexedHeight) {
      this.indexedHeight = height;
    }
  }

  /** Get a snapshot of all metrics for the API */
  getSnapshot(): MetricsSnapshot {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;

    const blocksPerMinute = this.blockTimestamps.filter((t) => t >= oneMinuteAgo).length;
    const blocksPerHour = this.blockTimestamps.filter((t) => t >= oneHourAgo).length;

    const blocksRemaining = Math.max(0, this.chainTip - this.indexedHeight);
    const syncPercent =
      this.chainTip > 0 ? Math.min(100, (this.indexedHeight / this.chainTip) * 100) : 0;

    // ETA: use blocks/minute rate (more responsive than hourly)
    let etaSeconds: number | null = null;
    if (blocksRemaining > 0 && blocksPerMinute > 0) {
      const blocksPerSecond = blocksPerMinute / 60;
      etaSeconds = Math.ceil(blocksRemaining / blocksPerSecond);
    }

    const mem = process.memoryUsage();

    return {
      startedAt: this.startedAt,
      uptimeSeconds: Math.floor((now - this.startedAt) / 1000),
      state: this.state,
      blocksProcessed: this.blocksProcessed,
      indexedHeight: this.indexedHeight,
      chainTip: this.chainTip,
      blocksRemaining,
      syncPercent: Math.round(syncPercent * 100) / 100,
      blocksPerMinute,
      blocksPerHour,
      etaSeconds,
      errorCount: this.errorCount,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      blockProcessingTime: blockTimePercentiles(this.blockProcessingTimes),
    };
  }
}

function blockTimePercentiles(arr: number[]): { avg: number; p50: number; p95: number; max: number; count: number } {
  if (arr.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0, count: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const len = sorted.length;
  return {
    avg: Math.round((sum / len) * 100) / 100,
    p50: Math.round(sorted[Math.floor(len * 0.5)] * 100) / 100,
    p95: Math.round(sorted[Math.floor(len * 0.95)] * 100) / 100,
    max: Math.round(sorted[len - 1] * 100) / 100,
    count: len,
  };
}

/** Singleton metrics instance */
export const metrics = new IndexerMetrics();
