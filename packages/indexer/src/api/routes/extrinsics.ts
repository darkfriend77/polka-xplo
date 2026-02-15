import type { Express } from "express";
import {
  getExtrinsicsList,
  getExtrinsicByHash,
  getExtrinsicById,
  getExtrinsicModules,
  getBlockByHeight,
  getEventsByExtrinsic,
} from "@polka-xplo/db";

export function register(app: Express): void {
  /**
   * @openapi
   * /api/extrinsics:
   *   get:
   *     tags: [Extrinsics]
   *     summary: List extrinsics
   *     description: Returns a paginated list of extrinsics, most recent first.
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
   *     responses:
   *       200:
   *         description: Paginated extrinsic list
   */
  app.get("/api/extrinsics", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const signedOnly = req.query.signed === "true";
      const module = (req.query.module as string) || undefined;
      const callParam = (req.query.call as string) || undefined;
      const calls = callParam ? callParam.split(",").filter(Boolean) : undefined;
      const result = await getExtrinsicsList(limit, offset, signedOnly, module, calls);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch extrinsics" });
    }
  });

  /**
   * @openapi
   * /api/extrinsics/modules:
   *   get:
   *     tags: [Extrinsics]
   *     summary: List distinct extrinsic modules and their calls
   *     description: Returns all unique module names and their call types found in indexed data. Useful for building dynamic filter UIs.
   *     responses:
   *       200:
   *         description: List of modules with their call types
   */
  app.get("/api/extrinsics/modules", async (_req, res) => {
    try {
      const modules = await getExtrinsicModules();
      res.json({ modules });
    } catch {
      res.status(500).json({ error: "Failed to fetch extrinsic modules" });
    }
  });

  /**
   * @openapi
   * /api/extrinsics/{hash}:
   *   get:
   *     tags: [Extrinsics]
   *     summary: Get extrinsic by hash
   *     description: Returns extrinsic details and all correlated events.
   *     parameters:
   *       - in: path
   *         name: hash
   *         required: true
   *         schema:
   *           type: string
   *         description: Extrinsic transaction hash
   *     responses:
   *       200:
   *         description: Extrinsic with correlated events
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 extrinsic:
   *                   $ref: '#/components/schemas/Extrinsic'
   *                 events:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Event'
   *       400:
   *         description: Invalid hash
   *       404:
   *         description: Extrinsic not found
   */
  app.get("/api/extrinsics/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || id.length > 200) {
        res.status(400).json({ error: "Invalid extrinsic identifier" });
        return;
      }

      // Support both block-index format ("100-0") and tx hash ("0x...")
      let extrinsic;
      if (/^\d+-\d+$/.test(id)) {
        extrinsic = await getExtrinsicById(id);
      } else {
        extrinsic = await getExtrinsicByHash(id);
      }

      if (!extrinsic) {
        res.status(404).json({ error: "Extrinsic not found" });
        return;
      }

      // Fetch block and events in parallel
      const [block, events] = await Promise.all([
        getBlockByHeight(extrinsic.blockHeight),
        getEventsByExtrinsic(extrinsic.id),
      ]);
      res.json({
        extrinsic,
        events,
        blockTimestamp: block?.timestamp ?? null,
        blockHash: block?.hash ?? null,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch extrinsic" });
    }
  });
}
