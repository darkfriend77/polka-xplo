import type { Express } from "express";
import type { ApiContext } from "../types.js";
import {
  query,
  findMissingBlocks,
  getBrokenExtrinsicBlocks,
  truncateOversizedArgs,
  getDatabaseSize,
} from "@polka-xplo/db";

export function register(app: Express, ctx: ApiContext): void {
  /**
   * @openapi
   * /api/admin/extensions/{extensionId}/backfill:
   *   post:
   *     tags: [Admin]
   *     security:
   *       - AdminApiKey: []
   *     summary: Trigger historical event backfill for an extension
   *     description: Re-reads matching events from the events table and replays them through the extension handlers. Useful after deploying a new extension on an already-indexed chain.
   *     parameters:
   *       - in: path
   *         name: extensionId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Backfill triggered
   *       404:
   *         description: Extension not found
   */
  app.post("/api/admin/extensions/:extensionId/backfill", async (req, res) => {
    try {
      const result = await ctx.registry.backfillById(req.params.extensionId);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: String(err) });
    }
  });

  /**
   * @openapi
   * /api/admin/consistency-check:
   *   get:
   *     tags: [Admin]
   *     security:
   *       - AdminApiKey: []
   *     summary: Detect missing blocks (gaps) in the indexed data
   *     description: Scans the blocks table for gaps in block heights. Returns missing block numbers.
   *     parameters:
   *       - in: query
   *         name: start
   *         schema:
   *           type: integer
   *         description: Start height (defaults to lowest indexed block)
   *       - in: query
   *         name: end
   *         schema:
   *           type: integer
   *         description: End height (defaults to highest indexed block)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 1000
   *         description: Maximum number of missing heights to return
   *     responses:
   *       200:
   *         description: Gap analysis results
   */
  app.get("/api/admin/consistency-check", async (req, res) => {
    try {
      const start = req.query.start ? parseInt(String(req.query.start), 10) : undefined;
      const end = req.query.end ? parseInt(String(req.query.end), 10) : undefined;
      const limit = Math.min(parseInt(String(req.query.limit ?? "1000"), 10) || 1000, 10000);

      const result = await findMissingBlocks(start, end, limit);
      res.json({
        ...result,
        healthy: result.total === 0,
        message:
          result.total === 0
            ? "No gaps detected — all blocks are indexed."
            : `Found ${result.total} missing block(s) in range ${result.rangeStart}..${result.rangeEnd}.`,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * @openapi
   * /api/admin/consistency-check/repair:
   *   post:
   *     tags: [Admin]
   *     security:
   *       - AdminApiKey: []
   *     summary: Repair missing blocks by re-fetching them from the chain
   *     description: Fetches and processes missing blocks to fill gaps. Requires the ingestion pipeline to be running.
   *     parameters:
   *       - in: query
   *         name: start
   *         schema:
   *           type: integer
   *       - in: query
   *         name: end
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 500
   *     responses:
   *       200:
   *         description: Repair results
   *       503:
   *         description: Pipeline not available
   */
  app.post("/api/admin/consistency-check/repair", async (req, res) => {
    const pipeline = ctx.pipelineHolder?.current ?? null;
    if (!pipeline) {
      res.status(503).json({ error: "Ingestion pipeline is not running. Cannot repair gaps." });
      return;
    }

    try {
      const start = req.query.start ? parseInt(String(req.query.start), 10) : undefined;
      const end = req.query.end ? parseInt(String(req.query.end), 10) : undefined;
      const limit = Math.min(parseInt(String(req.query.limit ?? "500"), 10) || 500, 5000);

      const gaps = await findMissingBlocks(start, end, limit);

      if (gaps.total === 0) {
        res.json({ message: "No gaps found — nothing to repair.", repaired: 0, failed: [] });
        return;
      }

      console.log(`[API] Repairing ${gaps.missingHeights.length} missing blocks...`);
      const result = await pipeline.repairGaps(gaps.missingHeights);

      res.json({
        message: `Repair complete: ${result.repaired} blocks repaired, ${result.failed.length} failed.`,
        totalGaps: gaps.total,
        attempted: gaps.missingHeights.length,
        ...result,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * @openapi
   * /api/admin/repair/extrinsics:
   *   post:
   *     tags: [Admin]
   *     security:
   *       - AdminApiKey: []
   *     summary: Repair mis-decoded extrinsics
   *     description: |
   *       Finds extrinsics with placeholder module/call names (e.g. "Pallet(217)", "call(56)")
   *       caused by decoder bugs, re-fetches the block from RPC, re-decodes the extrinsics,
   *       and updates the DB rows.
   *     responses:
   *       200:
   *         description: Repair results
   */
  app.post("/api/admin/repair/extrinsics", async (_req, res) => {
    if (!ctx.rpcPool) {
      res.status(503).json({ error: "RPC pool not available" });
      return;
    }
    try {
      const { ExtrinsicDecoder } = await import("../../ingestion/extrinsic-decoder.js");
      const decoder = new ExtrinsicDecoder(ctx.rpcPool);

      // Find blocks with broken extrinsic names
      const brokenBlocks = await getBrokenExtrinsicBlocks(2000);
      if (brokenBlocks.length === 0) {
        res.json({ message: "No broken extrinsics found", repaired: 0 });
        return;
      }

      console.log(`[Repair] Found ${brokenBlocks.length} blocks with broken extrinsic names`);
      let totalRepaired = 0;
      let errors = 0;

      for (const height of brokenBlocks) {
        try {
          // Get block hash
          const blockHash: string = await ctx.rpcPool.call("chain_getBlockHash", [height]);
          if (!blockHash) { errors++; continue; }

          // Fetch full block
          const blockData = await ctx.rpcPool.call<{
            block: { extrinsics: string[] };
          }>("chain_getBlock", [blockHash]);
          if (!blockData?.block?.extrinsics) { errors++; continue; }

          // Ensure metadata is loaded for this block's runtime
          const { lookup } = await decoder.ensureMetadata(blockHash);

          // Re-decode each extrinsic and update
          for (let i = 0; i < blockData.block.extrinsics.length; i++) {
            const hex = blockData.block.extrinsics[i]!;
            const decoded = decoder.decodeCallInfo(hex, lookup);
            const extId = `${height}-${i}`;

            await query(
              `UPDATE extrinsics SET module = $1, call = $2 WHERE id = $3`,
              [decoded.module, decoded.call, extId],
            );
          }

          totalRepaired++;
        } catch (err) {
          console.error(`[Repair] Failed to repair block ${height}:`, err);
          errors++;
        }
      }

      console.log(`[Repair] Done: ${totalRepaired} blocks repaired, ${errors} errors`);
      res.json({
        blocksFound: brokenBlocks.length,
        blocksRepaired: totalRepaired,
        errors,
      });
    } catch (err) {
      console.error("[Repair] Failed:", err);
      res.status(500).json({ error: "Repair failed" });
    }
  });

  /**
   * @openapi
   * /api/admin/maintenance/truncate-args:
   *   post:
   *     tags: [Admin]
   *     security:
   *       - AdminApiKey: []
   *     summary: Truncate oversized extrinsic args
   *     description: |
   *       Replaces extrinsic args larger than 4 KB with a compact marker
   *       `{"_oversized": true, "_originalBytes": N}`.
   *       Runs in batches; call repeatedly until `remaining` is 0.
   *     responses:
   *       200:
   *         description: Truncation results
   */
  app.post("/api/admin/maintenance/truncate-args", async (_req, res) => {
    try {
      let totalUpdated = 0;
      let batch: { updated: number };

      const MAX_BATCHES = 20;  // 20 batches x 500 rows = 10,000 rows per call
      let batchCount = 0;

      do {
        batch = await truncateOversizedArgs(4096, 500);
        totalUpdated += batch.updated;
        batchCount++;
        if (batch.updated > 0) {
          console.log(`[Maintenance] Truncated ${batch.updated} oversized args (batch ${batchCount}, total: ${totalUpdated})`);
        }
      } while (batch.updated > 0 && batchCount < MAX_BATCHES);

      const done = batch.updated === 0;
      console.log(`[Maintenance] ${done ? "Done" : "Paused"}: ${totalUpdated} truncated this call`);

      res.json({
        truncated: totalUpdated,
        done,
        message: done
          ? "All oversized args truncated"
          : "Call again to continue",
      });
    } catch (err) {
      console.error("[Maintenance] Failed:", err);
      res.status(500).json({ error: "Truncation failed" });
    }
  });

  /**
   * @openapi
   * /api/admin/maintenance/vacuum:
   *   post:
   *     tags: [Admin]
   *     security:
   *       - AdminApiKey: []
   *     summary: Run VACUUM FULL ANALYZE on main tables
   *     description: |
   *       Reclaims disk space after large truncation operations
   *       and updates planner statistics.
   *       Uses VACUUM FULL to actually shrink files on disk.
   *       WARNING: Locks tables during operation — may take 10-30 minutes.
   *     responses:
   *       200:
   *         description: Vacuum results
   */
  app.post("/api/admin/maintenance/vacuum", async (_req, res) => {
    try {
      console.log("[Maintenance] Starting VACUUM FULL ANALYZE on extrinsics...");
      const start = Date.now();
      await query("VACUUM FULL ANALYZE extrinsics", []);
      const extTime = Date.now() - start;
      console.log(`[Maintenance] extrinsics done in ${(extTime / 1000).toFixed(1)}s`);

      console.log("[Maintenance] Starting VACUUM FULL ANALYZE on events...");
      const start2 = Date.now();
      await query("VACUUM FULL ANALYZE events", []);
      const evtTime = Date.now() - start2;
      console.log(`[Maintenance] events done in ${(evtTime / 1000).toFixed(1)}s`);

      console.log("[Maintenance] Starting VACUUM FULL ANALYZE on blocks...");
      const start3 = Date.now();
      await query("VACUUM FULL ANALYZE blocks", []);
      const blkTime = Date.now() - start3;
      console.log(`[Maintenance] blocks done in ${(blkTime / 1000).toFixed(1)}s`);

      const sizeResult = await getDatabaseSize();
      res.json({
        vacuumed: ["extrinsics", "events", "blocks"],
        durationMs: { extrinsics: extTime, events: evtTime, blocks: blkTime },
        databaseSize: sizeResult.totalSize,
      });
    } catch (err) {
      console.error("[Maintenance] VACUUM failed:", err);
      res.status(500).json({ error: "Vacuum failed" });
    }
  });
}
