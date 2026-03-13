import type { Express } from "express";
import type { ApiContext } from "../types.js";
import {
  getIndexerState,
  getDatabaseSize,
  query,
  dbMetrics,
  getQueryCacheStatus,
} from "@polka-xplo/db";
import { metrics } from "../../metrics.js";
import { getStatsCacheStatus } from "./stats.js";

export function register(app: Express, ctx: ApiContext): void {
  /**
   * @openapi
   * /health:
   *   get:
   *     tags: [Health]
   *     summary: Indexer health check
   *     description: Returns the operational status of the indexer, including sync progress and connectivity.
   *     responses:
   *       200:
   *         description: Indexer status
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   enum: [healthy, degraded, unhealthy]
   *                 nodeConnected:
   *                   type: boolean
   *                 syncLag:
   *                   type: integer
   *                   description: Blocks behind the chain tip
   *                 dbConnected:
   *                   type: boolean
   *                 chainTip:
   *                   type: integer
   *                 indexedTip:
   *                   type: integer
   *                 timestamp:
   *                   type: integer
   *       503:
   *         description: Indexer unhealthy
   */
  app.get("/health", async (_req, res) => {
    try {
      const state = await getIndexerState(ctx.chainId);
      const metricsSnap = metrics.getSnapshot();
      // Use the metrics chain tip (updated by pipeline) since getIndexerState
      // doesn't track chain tip separately from last_finalized_block.
      const chainTip = metricsSnap.chainTip || state?.lastFinalizedBlock || 0;
      const indexedTip = state?.lastFinalizedBlock ?? 0;
      res.json({
        status: state?.state === "live" ? "healthy" : "degraded",
        nodeConnected: true,
        syncLag: chainTip - indexedTip,
        dbConnected: true,
        chainTip,
        indexedTip,
        timestamp: Date.now(),
      });
    } catch (err) {
      res.status(503).json({
        status: "unhealthy",
        nodeConnected: false,
        dbConnected: false,
        error: String(err),
        timestamp: Date.now(),
      });
    }
  });

  /**
   * @openapi
   * /api/rpc-health:
   *   get:
   *     tags: [System]
   *     summary: RPC pool health
   *     description: Returns health stats for all RPC endpoints in the pool.
   *     responses:
   *       200:
   *         description: RPC pool stats
   */
  app.get("/api/rpc-health", (_req, res) => {
    if (!ctx.rpcPool) {
      res.json({ endpoints: [], message: "RPC pool not initialized" });
      return;
    }
    res.json({
      endpointCount: ctx.rpcPool.size,
      endpoints: ctx.rpcPool.getStats(),
    });
  });

  /**
   * @openapi
   * /api/indexer-status:
   *   get:
   *     tags: [System]
   *     summary: Indexer status and metrics
   *     description: Returns comprehensive indexer metrics including sync progress, throughput, memory usage, database size, and RPC health.
   *     responses:
   *       200:
   *         description: Indexer status snapshot
   */
  app.get("/api/indexer-status", async (_req, res) => {
    try {
      const [snapshot, dbSize, cacheHitResult] = await Promise.all([
        Promise.resolve(metrics.getSnapshot()),
        getDatabaseSize(),
        query<{ ratio: string }>(
          `SELECT ROUND(
             CASE WHEN (sum(blks_hit) + sum(blks_read)) = 0 THEN 0
             ELSE sum(blks_hit)::numeric / (sum(blks_hit) + sum(blks_read))
             END, 4
           ) AS ratio FROM pg_stat_database WHERE datname = current_database()`,
        ),
      ]);
      const rpcHealth = ctx.rpcPool
        ? { endpointCount: ctx.rpcPool.size, endpoints: ctx.rpcPool.getStats() }
        : { endpointCount: 0, endpoints: [] };
      const cacheHitRatio = parseFloat(cacheHitResult.rows[0]?.ratio ?? "0");
      // Gather cache status
      const statsCtx = getStatsCacheStatus();
      const queryCacheEntries = getQueryCacheStatus();
      const now = Date.now();

      // Summarise caches into a clean object for the dashboard
      const caches = {
        stats: statsCtx.stats
          ? {
              refreshIntervalMs: statsCtx.stats.refreshIntervalMs,
              nextRefreshMs: statsCtx.stats.ttlMs,
              expiresAt: statsCtx.stats.expiresAt,
            }
          : null,
        activity: statsCtx.activity.map((a) => ({
          key: a.key,
          nextRefreshMs: a.ttlMs,
          expiresAt: a.expiresAt,
        })),
        queryCache: {
          size: queryCacheEntries.length,
          entries: queryCacheEntries.map((e) => ({
            key: e.key,
            nextRefreshMs: e.ttlMs,
            expiresAt: e.expiresAt,
          })),
        },
      };

      res.json({
        ...snapshot,
        database: {
          ...dbSize,
          cacheHitRatio,
          ...dbMetrics.getSnapshot(),
        },
        rpc: rpcHealth,
        caches,
      });
    } catch {
      res.status(500).json({ error: "Failed to collect indexer status" });
    }
  });
}
