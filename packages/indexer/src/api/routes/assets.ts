import type { Express } from "express";
import { query, cachedCount, cachedQuery } from "@polka-xplo/db";

export function register(app: Express): void {
  /**
   * @openapi
   * /api/assets:
   *   get:
   *     tags: [Assets]
   *     summary: List all registered assets
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 25
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [active, destroyed]
   *     responses:
   *       200:
   *         description: Paginated list of assets
   */
  app.get("/api/assets", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10) || 25, 100);
      const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
      const status = req.query.status ? String(req.query.status) : undefined;

      let where = "";
      const params: unknown[] = [limit, offset];
      if (status) {
        where = " WHERE status = $3";
        params.push(status);
      }

      const cacheKey = status ? `assets:${status}` : "assets";
      const [rows, total] = await Promise.all([
        query(
          `SELECT * FROM assets${where} ORDER BY asset_id ASC LIMIT $1 OFFSET $2`,
          params,
        ),
        cachedCount(cacheKey, `SELECT COUNT(*) FROM assets${where}`, status ? [status] : []),
      ]);

      res.json({
        data: rows.rows,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < total,
      });
    } catch (err) {
      console.error("[assets] list error:", err);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  /**
   * @openapi
   * /api/assets/summary:
   *   get:
   *     tags: [Assets]
   *     summary: Asset overview — count of active/destroyed assets
   *     responses:
   *       200:
   *         description: Summary object with counts
   */
  app.get("/api/assets/summary", async (req, res) => {
    try {
      const summary = await cachedQuery("assets_summary", async () => {
        const rows = await query(
          `SELECT status, COUNT(*) AS count FROM assets GROUP BY status`,
        );
        const result: Record<string, number> = {};
        for (const r of rows.rows) {
          result[String(r.status)] = parseInt(String(r.count), 10);
        }
        return result;
      });
      res.json(summary);
    } catch (err) {
      console.error("[assets] summary error:", err);
      res.status(500).json({ error: "Failed to fetch asset summary" });
    }
  });

  /**
   * @openapi
   * /api/assets/{assetId}:
   *   get:
   *     tags: [Assets]
   *     summary: Get a single asset by ID
   *     parameters:
   *       - in: path
   *         name: assetId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Asset details with recent transfers
   */
  app.get("/api/assets/:assetId", async (req, res) => {
    try {
      const assetId = parseInt(req.params.assetId, 10);
      if (Number.isNaN(assetId)) {
        res.status(400).json({ error: "Invalid asset ID" });
        return;
      }

      const assetRes = await query("SELECT * FROM assets WHERE asset_id = $1", [assetId]);
      if (assetRes.rows.length === 0) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      // Recent transfers for this asset
      const transfersRes = await query(
        `SELECT * FROM asset_transfers WHERE asset_id = $1 ORDER BY block_height DESC LIMIT 25`,
        [assetId],
      );

      res.json({
        asset: assetRes.rows[0],
        recentTransfers: transfersRes.rows,
      });
    } catch (err) {
      console.error("[assets] detail error:", err);
      res.status(500).json({ error: "Failed to fetch asset" });
    }
  });

  /**
   * @openapi
   * /api/assets/{assetId}/transfers:
   *   get:
   *     tags: [Assets]
   *     summary: List transfers for an asset
   *     parameters:
   *       - in: path
   *         name: assetId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 25
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: Paginated transfers for the asset
   */
  app.get("/api/assets/:assetId/transfers", async (req, res) => {
    try {
      const assetId = parseInt(req.params.assetId, 10);
      if (Number.isNaN(assetId)) {
        res.status(400).json({ error: "Invalid asset ID" });
        return;
      }

      const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10) || 25, 100);
      const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;

      const [countRes, rows] = await Promise.all([
        query(
          "SELECT COUNT(*) FROM asset_transfers WHERE asset_id = $1",
          [assetId],
        ),
        query(
          `SELECT * FROM asset_transfers WHERE asset_id = $1 ORDER BY block_height DESC LIMIT $2 OFFSET $3`,
          [assetId, limit, offset],
        ),
      ]);
      const total = parseInt(String(countRes.rows[0]!.count), 10);

      res.json({
        data: rows.rows,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < total,
      });
    } catch (err) {
      console.error("[assets] transfers error:", err);
      res.status(500).json({ error: "Failed to fetch asset transfers" });
    }
  });
}
