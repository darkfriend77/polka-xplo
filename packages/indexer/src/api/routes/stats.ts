import type { Express } from "express";
import type { ApiContext } from "../types.js";
import { getChainStats, query } from "@polka-xplo/db";
import { getExistentialDeposit } from "../../runtime-parser.js";
import { getSystemProperties, getParachainId } from "../../chain-state.js";

// ---- Activity endpoint cache ----
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const activityCache = new Map<string, CacheEntry>();

// ---- Stats endpoint cache ----
// The /api/stats response is cached with a short TTL and proactively
// refreshed in the background so no user request ever hits a cold cache.
const STATS_TTL_MS = 60_000; // 60 seconds
let statsCache: CacheEntry | null = null;
let statsRefreshTimer: ReturnType<typeof setInterval> | null = null;
/** Cache TTL per period: hourly data changes faster, monthly rarely */
const ACTIVITY_TTL: Record<string, number> = {
  hour: 60_000,     // 1 minute
  day: 300_000,     // 5 minutes
  week: 600_000,    // 10 minutes
  month: 1_800_000, // 30 minutes
};
/** How far back to scan per period (avoids full-table scans) */
const LOOKBACK_INTERVALS: Record<string, string> = {
  hour: "400 hours",   // generous margin over 365 hours
  day: "400 days",
  week: "200 weeks",
  month: "400 months",
};

export function register(app: Express, ctx: ApiContext): void {
  /**
   * @openapi
   * /api/stats:
   *   get:
   *     tags: [Stats]
   *     summary: Chain statistics
   *     description: Returns aggregate chain statistics for the homepage.
   *     responses:
   *       200:
   *         description: Chain stats
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 latestBlock:
   *                   type: integer
   *                 finalizedBlock:
   *                   type: integer
   *                 signedExtrinsics:
   *                   type: integer
   *                 transfers:
   *                   type: integer
   *                 totalAccounts:
   *                   type: integer
   *                 existentialDeposit:
   *                   type: string
   *                   description: Existential deposit in planck (from runtime metadata)
   *                 tokenDecimals:
   *                   type: integer
   *                   description: Token decimals (from system_properties)
   *                 paraId:
   *                   type: integer
   *                   nullable: true
   *                   description: Parachain ID (from ParachainInfo pallet, null for relay chains)
   */
  // --- Helper: build the stats response ---
  async function buildStatsResponse() {
    const [stats, chainProps] = await Promise.all([
      getChainStats(),
      ctx.rpcPool
        ? Promise.all([
            getExistentialDeposit(ctx.rpcPool),
            getSystemProperties(ctx.rpcPool),
            getParachainId(ctx.rpcPool),
          ]).then(([ed, props, paraId]) => ({
            existentialDeposit: ed,
            tokenDecimals: props.tokenDecimals,
            paraId,
          }))
        : Promise.resolve({ existentialDeposit: "0", tokenDecimals: 10, paraId: null }),
    ]);
    return { ...stats, ...chainProps };
  }

  // --- Background refresh: warm the cache every 6s so users never wait ---
  async function refreshStatsCache() {
    try {
      const data = await buildStatsResponse();
      statsCache = { data, expiresAt: Date.now() + STATS_TTL_MS };
    } catch {
      // Keep stale cache on error rather than clearing it
    }
  }
  // Start background refresh immediately and repeat every 6s
  refreshStatsCache();
  statsRefreshTimer = setInterval(refreshStatsCache, STATS_TTL_MS);
  // Ensure timer doesn't keep the process alive
  if (statsRefreshTimer.unref) statsRefreshTimer.unref();

  app.get("/api/stats", async (_req, res) => {
    try {
      // Serve from cache if available (even if slightly stale — background refresh keeps it fresh)
      if (statsCache?.data) {
        res.json(statsCache.data);
        return;
      }
      // Fallback: build synchronously on first request if background hasn't finished yet
      const data = await buildStatsResponse();
      statsCache = { data, expiresAt: Date.now() + STATS_TTL_MS };
      res.json(data);
    } catch {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  /**
   * @openapi
   * /api/stats/activity:
   *   get:
   *     tags: [Stats]
   *     summary: Chain activity over time
   *     description: >
   *       Returns extrinsic counts, event counts, transfer counts, and block counts
   *       aggregated by time period (hour, day, week, month).
   *     parameters:
   *       - in: query
   *         name: period
   *         schema:
   *           type: string
   *           enum: [hour, day, week, month]
   *           default: day
   *         description: Aggregation period
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 30
   *           minimum: 1
   *           maximum: 365
   *         description: Number of time buckets to return
   *     responses:
   *       200:
   *         description: Time-series activity data
   */
  app.get("/api/stats/activity", async (req, res) => {
    try {
      const period = String(req.query.period || "day");
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 30, 1), 365);

      // Map period to PostgreSQL date_trunc interval
      const truncMap: Record<string, string> = {
        hour: "hour",
        day: "day",
        week: "week",
        month: "month",
      };
      const trunc = truncMap[period];
      if (!trunc) {
        res.status(400).json({ error: "Invalid period. Use: hour, day, week, month" });
        return;
      }

      // ---- Cache check ----
      const cacheKey = `activity:${period}:${limit}`;
      const now = Date.now();
      const cached = activityCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        res.json(cached.data);
        return;
      }

      // ---- Single combined query with time-range filter ----
      // Instead of scanning the entire blocks + events tables, restrict to
      // a reasonable lookback window and combine both aggregations into one
      // query using a LEFT JOIN, avoiding two full-table scans.
      const lookback = LOOKBACK_INTERVALS[period] ?? "400 days";

      const result = await query(
        `WITH block_stats AS (
           SELECT
             date_trunc($1, to_timestamp(b.timestamp / 1000)) AS bucket,
             SUM(b.extrinsic_count)::int AS extrinsics,
             SUM(b.event_count)::int AS events,
             COUNT(*)::int AS blocks
           FROM blocks b
           WHERE b.timestamp IS NOT NULL
             AND b.timestamp >= (EXTRACT(EPOCH FROM NOW()) * 1000 - EXTRACT(EPOCH FROM INTERVAL '${lookback}') * 1000)::bigint
           GROUP BY 1
           ORDER BY 1 DESC
           LIMIT $2
         ),
         transfer_stats AS (
           SELECT
             date_trunc($1, to_timestamp(b.timestamp / 1000)) AS bucket,
             COUNT(*)::int AS transfers
           FROM events e
           JOIN blocks b ON b.height = e.block_height
           WHERE b.timestamp IS NOT NULL
             AND b.timestamp >= (EXTRACT(EPOCH FROM NOW()) * 1000 - EXTRACT(EPOCH FROM INTERVAL '${lookback}') * 1000)::bigint
             AND e.module = 'Balances' AND e.event IN ('Transfer', 'transfer')
           GROUP BY 1
         )
         SELECT
           bs.bucket,
           bs.extrinsics,
           bs.events,
           bs.blocks,
           COALESCE(ts.transfers, 0)::int AS transfers
         FROM block_stats bs
         LEFT JOIN transfer_stats ts ON ts.bucket = bs.bucket
         ORDER BY bs.bucket DESC`,
        [trunc, limit],
      );

      const data = result.rows
        .map((row: Record<string, unknown>) => ({
          timestamp: new Date(String(row.bucket)).getTime(),
          label: String(row.bucket),
          extrinsics: Number(row.extrinsics),
          events: Number(row.events),
          blocks: Number(row.blocks),
          transfers: Number(row.transfers),
        }))
        .reverse(); // chronological order

      const response = { period, count: data.length, data };

      // ---- Populate cache ----
      const ttl = ACTIVITY_TTL[period] ?? 300_000;
      activityCache.set(cacheKey, { data: response, expiresAt: now + ttl });

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
