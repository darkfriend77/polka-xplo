import pg from "pg";

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

let pool: DbPool | null = null;

// ============================================================
// DB Performance Metrics
// ============================================================

const LATENCY_WINDOW = 1000; // keep last 1000 query timings

export interface DbMetricsSnapshot {
  /** Pool connection counts */
  pool: { total: number; idle: number; waiting: number };
  /** Query latency stats (ms) — last 1000 queries */
  queryLatency: { avg: number; p50: number; p95: number; p99: number; max: number; count: number };
  /** Write latency stats (ms) — INSERT/UPDATE/DELETE */
  writeLatency: { avg: number; p50: number; p95: number; p99: number; max: number; count: number };
  /** Read latency stats (ms) — SELECT */
  readLatency: { avg: number; p50: number; p95: number; p99: number; max: number; count: number };
  /** Total queries since startup */
  totalQueries: number;
  /** Slow queries (>100ms) since startup */
  slowQueries: number;
}

class DbMetrics {
  private queryTimings: number[] = [];
  private readTimings: number[] = [];
  private writeTimings: number[] = [];
  private _totalQueries = 0;
  private _slowQueries = 0;

  record(durationMs: number, isWrite: boolean): void {
    this._totalQueries++;
    if (durationMs > 100) this._slowQueries++;

    this.queryTimings.push(durationMs);
    if (this.queryTimings.length > LATENCY_WINDOW) {
      this.queryTimings = this.queryTimings.slice(-LATENCY_WINDOW);
    }

    const bucket = isWrite ? this.writeTimings : this.readTimings;
    bucket.push(durationMs);
    if (bucket.length > LATENCY_WINDOW) {
      if (isWrite) {
        this.writeTimings = this.writeTimings.slice(-LATENCY_WINDOW);
      } else {
        this.readTimings = this.readTimings.slice(-LATENCY_WINDOW);
      }
    }
  }

  getSnapshot(): DbMetricsSnapshot {
    const p = pool;
    return {
      pool: {
        total: p ? p.totalCount : 0,
        idle: p ? p.idleCount : 0,
        waiting: p ? p.waitingCount : 0,
      },
      queryLatency: percentiles(this.queryTimings),
      writeLatency: percentiles(this.writeTimings),
      readLatency: percentiles(this.readTimings),
      totalQueries: this._totalQueries,
      slowQueries: this._slowQueries,
    };
  }
}

function percentiles(arr: number[]): { avg: number; p50: number; p95: number; p99: number; max: number; count: number } {
  if (arr.length === 0) return { avg: 0, p50: 0, p95: 0, p99: 0, max: 0, count: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const len = sorted.length;
  return {
    avg: Math.round((sum / len) * 100) / 100,
    p50: sorted[Math.floor(len * 0.5)] ?? 0,
    p95: sorted[Math.floor(len * 0.95)] ?? 0,
    p99: sorted[Math.floor(len * 0.99)] ?? 0,
    max: sorted[len - 1] ?? 0,
    count: len,
  };
}

export const dbMetrics = new DbMetrics();

// ============================================================
// Pool & Query Functions
// ============================================================

/** Initialize the connection pool */
export function createPool(connectionString?: string): DbPool {
  if (pool) return pool;

  pool = new Pool({
    connectionString: connectionString ?? process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("[DB] Unexpected pool error:", err.message);
  });

  return pool;
}

/** Get the existing pool or create one */
export function getPool(): DbPool {
  if (!pool) {
    return createPool();
  }
  return pool;
}

/** Detect if a SQL statement is a write operation */
function isWriteQuery(sql: string): boolean {
  const cmd = sql.trimStart().substring(0, 10).toUpperCase();
  return cmd.startsWith("INSERT") || cmd.startsWith("UPDATE") || cmd.startsWith("DELETE") || cmd.startsWith("CREATE") || cmd.startsWith("ALTER");
}

/** Run a query with automatic client checkout and timing */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  const start = performance.now();
  try {
    return await p.query<T>(text, params);
  } finally {
    const elapsed = performance.now() - start;
    dbMetrics.record(elapsed, isWriteQuery(text));
  }
}

/** Run multiple queries in a transaction */
export async function transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Graceful shutdown */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
