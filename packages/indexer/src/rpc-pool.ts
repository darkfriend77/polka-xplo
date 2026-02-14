/**
 * RPC Pool — latency-weighted load balancing with automatic failover.
 *
 * Distributes JSON-RPC calls across multiple endpoints to:
 * - Reduce rate-limiting from any single node
 * - Survive individual node outages
 * - Improve backfill throughput with concurrent workers
 *
 * Routing: Once enough latency samples are collected, endpoints are
 * weighted by inverse-average-latency so faster nodes receive
 * proportionally more traffic. Falls back to round-robin until
 * the warm-up period is complete.
 *
 * Each endpoint tracks health. Failed endpoints are temporarily
 * suspended and retried after a cooldown period.
 */

const RPC_LATENCY_WINDOW = 500; // keep last 500 call timings per endpoint
const LATENCY_WARMUP_CALLS = 20; // round-robin until each endpoint has this many samples

interface EndpointState {
  /** The HTTP URL (converted from WSS if needed) */
  httpUrl: string;
  /** The original WSS/WS URL */
  wsUrl: string;
  /** Number of consecutive failures */
  failures: number;
  /** Timestamp when the endpoint was suspended */
  suspendedUntil: number;
  /** Total successful calls */
  successCount: number;
  /** Total failed calls */
  failCount: number;
  /** Recent call latencies (ms) for percentile stats */
  latencies: number[];
}

export interface RpcCallResult<T = unknown> {
  result: T;
  endpoint: string;
}

const SUSPENSION_BASE_MS = 5_000; // 5 seconds initial suspension
const SUSPENSION_MAX_MS = 120_000; // 2 minute max suspension
const MAX_FAILURES = 3; // Suspend after 3 consecutive failures

function toHttpUrl(url: string): string {
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export class RpcPool {
  private endpoints: EndpointState[];
  private roundRobinIndex = 0;

  constructor(rpcUrls: string[]) {
    if (rpcUrls.length === 0) {
      throw new Error("[RpcPool] At least one RPC URL is required");
    }

    // Deduplicate
    const unique = [...new Set(rpcUrls)];
    this.endpoints = unique.map((url) => ({
      httpUrl: toHttpUrl(url),
      wsUrl: url,
      failures: 0,
      suspendedUntil: 0,
      successCount: 0,
      failCount: 0,
      latencies: [],
    }));

    console.log(`[RpcPool] Initialized with ${this.endpoints.length} endpoint(s):`);
    for (const ep of this.endpoints) {
      console.log(`  - ${ep.wsUrl} → ${ep.httpUrl}`);
    }
  }

  /** Number of configured endpoints */
  get size(): number {
    return this.endpoints.length;
  }

  /** Get the primary WSS URL (first healthy or first overall) */
  get primaryWsUrl(): string {
    const healthy = this.endpoints.find((ep) => ep.suspendedUntil < Date.now());
    return (healthy ?? this.endpoints[0]!).wsUrl;
  }

  /** Get all WSS URLs */
  get wsUrls(): string[] {
    return this.endpoints.map((ep) => ep.wsUrl);
  }

  /**
   * Pick the next endpoint using latency-weighted probability.
   *
   * Weight = 1 / avgLatency — so an endpoint twice as fast gets twice
   * the traffic. Falls back to round-robin during the warm-up phase
   * (< LATENCY_WARMUP_CALLS samples per endpoint).
   */
  private getNextEndpoint(): EndpointState {
    const now = Date.now();
    const healthy = this.endpoints.filter((ep) => ep.suspendedUntil <= now);

    if (healthy.length === 0) {
      // All suspended — unsuspend the one with the earliest suspendedUntil
      const earliest = this.endpoints.reduce((a, b) =>
        a.suspendedUntil < b.suspendedUntil ? a : b,
      );
      earliest.suspendedUntil = 0;
      earliest.failures = 0;
      return earliest;
    }

    // Warm-up: use round-robin until every healthy endpoint has enough samples
    const allWarmedUp = healthy.every((ep) => ep.latencies.length >= LATENCY_WARMUP_CALLS);
    if (!allWarmedUp) {
      // Simple round-robin over healthy endpoints
      for (let i = 0; i < this.endpoints.length; i++) {
        const idx = (this.roundRobinIndex + i) % this.endpoints.length;
        const ep = this.endpoints[idx]!;
        if (ep.suspendedUntil <= now) {
          this.roundRobinIndex = (idx + 1) % this.endpoints.length;
          return ep;
        }
      }
    }

    // Weighted selection: weight = 1 / avgLatency
    const weights = healthy.map((ep) => {
      const avg = ep.latencies.reduce((a, b) => a + b, 0) / ep.latencies.length;
      return 1 / Math.max(avg, 0.1); // floor to avoid division by zero
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < healthy.length; i++) {
      rand -= weights[i]!;
      if (rand <= 0) return healthy[i]!;
    }
    return healthy[healthy.length - 1]!;
  }

  /** Mark an endpoint as having succeeded */
  private markSuccess(ep: EndpointState, latencyMs: number): void {
    ep.failures = 0;
    ep.suspendedUntil = 0;
    ep.successCount++;
    ep.latencies.push(latencyMs);
    if (ep.latencies.length > RPC_LATENCY_WINDOW) {
      ep.latencies = ep.latencies.slice(-RPC_LATENCY_WINDOW);
    }
  }

  /** Mark an endpoint as having failed */
  private markFailed(ep: EndpointState): void {
    ep.failures++;
    ep.failCount++;

    if (ep.failures >= MAX_FAILURES) {
      // Exponential backoff: 5s, 10s, 20s, 40s, ... up to 120s
      const backoff = Math.min(
        SUSPENSION_BASE_MS * Math.pow(2, ep.failures - MAX_FAILURES),
        SUSPENSION_MAX_MS,
      );
      ep.suspendedUntil = Date.now() + backoff;
      console.warn(
        `[RpcPool] Suspending ${ep.httpUrl} for ${backoff / 1000}s after ${ep.failures} failures`,
      );
    }
  }

  /**
   * Execute a JSON-RPC call with automatic failover.
   * Tries up to N endpoints (where N = pool size).
   */
  async call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    const maxAttempts = this.endpoints.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ep = this.getNextEndpoint();
      const callStart = performance.now();

      try {
        const res = await fetch(ep.httpUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const json = (await res.json()) as {
          result?: T;
          error?: { code: number; message: string };
        };

        if (json.error) {
          throw new Error(`RPC ${method} error: ${json.error.message} (code ${json.error.code})`);
        }

        const callLatency = performance.now() - callStart;
        this.markSuccess(ep, callLatency);
        return json.result as T;
      } catch (err) {
        this.markFailed(ep);
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[RpcPool] ${ep.httpUrl} failed for ${method}: ${lastError.message} (attempt ${attempt + 1}/${maxAttempts})`,
        );
      }
    }

    throw new Error(
      `[RpcPool] All ${maxAttempts} endpoints failed for ${method}: ${lastError?.message}`,
    );
  }

  /** Print pool health stats with latency percentiles and routing weight */
  getStats(): {
    url: string;
    healthy: boolean;
    successes: number;
    failures: number;
    latency: { avg: number; p50: number; p95: number; max: number };
    weight: number;
  }[] {
    const now = Date.now();
    const healthy = this.endpoints.filter((ep) => ep.suspendedUntil <= now && ep.latencies.length >= LATENCY_WARMUP_CALLS);
    // Compute relative weights (0-100% share)
    let weights: Map<EndpointState, number> = new Map();
    if (healthy.length > 0) {
      const rawWeights = healthy.map((ep) => {
        const avg = ep.latencies.reduce((a, b) => a + b, 0) / ep.latencies.length;
        return { ep, w: 1 / Math.max(avg, 0.1) };
      });
      const totalW = rawWeights.reduce((a, b) => a + b.w, 0);
      for (const { ep, w } of rawWeights) {
        weights.set(ep, Math.round((w / totalW) * 100));
      }
    }
    return this.endpoints.map((ep) => ({
      url: ep.httpUrl,
      healthy: ep.suspendedUntil <= now,
      successes: ep.successCount,
      failures: ep.failCount,
      latency: rpcPercentiles(ep.latencies),
      weight: weights.get(ep) ?? 0,
    }));
  }
}

function rpcPercentiles(arr: number[]): { avg: number; p50: number; p95: number; max: number } {
  if (arr.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const len = sorted.length;
  return {
    avg: Math.round(sum / len),
    p50: Math.round(sorted[Math.floor(len * 0.5)]!),
    p95: Math.round(sorted[Math.floor(len * 0.95)]!),
    max: Math.round(sorted[len - 1]!),
  };
}
