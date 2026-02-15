import type { Express } from "express";
import { query, cachedCount, cachedQuery } from "@polka-xplo/db";

export function register(app: Express): void {
  /**
   * @openapi
   * /api/governance/referenda:
   *   get:
   *     tags: [Governance]
   *     summary: List democracy referenda
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [started, passed, notpassed]
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
   *         description: List of referenda
   */
  app.get("/api/governance/referenda", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string | undefined;

      // Use LEFT JOIN with FILTER instead of correlated subqueries
      let sql = `SELECT r.*,
                   COALESCE(v.vote_count, 0) AS vote_count,
                   COALESCE(v.aye_count, 0) AS aye_count,
                   COALESCE(v.nay_count, 0) AS nay_count
                 FROM gov_democracy_referenda r
                 LEFT JOIN (
                   SELECT ref_index,
                          COUNT(*) AS vote_count,
                          COUNT(*) FILTER (WHERE is_aye = true) AS aye_count,
                          COUNT(*) FILTER (WHERE is_aye = false) AS nay_count
                   FROM gov_democracy_votes
                   GROUP BY ref_index
                 ) v ON v.ref_index = r.ref_index`;
      const params: unknown[] = [];

      if (status) {
        params.push(status);
        sql += ` WHERE r.status = $${params.length}`;
      }

      sql += ` ORDER BY r.ref_index DESC`;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const cacheKey = status ? `gov_referenda:${status}` : "gov_referenda";
      const [result, total] = await Promise.all([
        query(sql, params),
        cachedCount(
          cacheKey,
          status
            ? `SELECT COUNT(*) FROM gov_democracy_referenda WHERE status = $1`
            : `SELECT COUNT(*) FROM gov_democracy_referenda`,
          status ? [status] : [],
        ),
      ]);

      res.json({ data: result.rows, total });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch referenda", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/referenda/{refIndex}:
   *   get:
   *     tags: [Governance]
   *     summary: Get a single referendum with its votes
   *     parameters:
   *       - in: path
   *         name: refIndex
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Referendum detail with votes
   */
  app.get("/api/governance/referenda/:refIndex", async (req, res) => {
    try {
      const refIndex = Number(req.params.refIndex);
      const refResult = await query(
        `SELECT * FROM gov_democracy_referenda WHERE ref_index = $1`,
        [refIndex],
      );

      if (refResult.rows.length === 0) {
        res.status(404).json({ error: "Referendum not found" });
        return;
      }

      const votes = await query(
        `SELECT * FROM gov_democracy_votes WHERE ref_index = $1 ORDER BY block_height DESC LIMIT 500`,
        [refIndex],
      );

      const countRes = await query(
        `SELECT COUNT(*) FROM gov_democracy_votes WHERE ref_index = $1`,
        [refIndex],
      );

      res.json({ referendum: refResult.rows[0], votes: votes.rows, totalVotes: Number(countRes.rows[0]?.count ?? 0) });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch referendum", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/proposals:
   *   get:
   *     tags: [Governance]
   *     summary: List democracy proposals
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [proposed, tabled, referendum]
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
   *         description: List of democracy proposals
   */
  app.get("/api/governance/proposals", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string | undefined;

      let sql = `SELECT * FROM gov_democracy_proposals`;
      const params: unknown[] = [];

      if (status) {
        params.push(status);
        sql += ` WHERE status = $${params.length}`;
      }

      sql += ` ORDER BY proposal_index DESC`;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const cacheKey = status ? `gov_proposals:${status}` : "gov_proposals";
      const [result, total] = await Promise.all([
        query(sql, params),
        cachedCount(
          cacheKey,
          status
            ? `SELECT COUNT(*) FROM gov_democracy_proposals WHERE status = $1`
            : `SELECT COUNT(*) FROM gov_democracy_proposals`,
          status ? [status] : [],
        ),
      ]);

      res.json({ data: result.rows, total });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch proposals", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/council/motions:
   *   get:
   *     tags: [Governance]
   *     summary: List council motions
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [proposed, approved, disapproved, executed, closed]
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
   *         description: List of council motions
   */
  app.get("/api/governance/council/motions", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string | undefined;

      let sql = `SELECT * FROM gov_council_motions`;
      const params: unknown[] = [];

      if (status) {
        params.push(status);
        sql += ` WHERE status = $${params.length}`;
      }

      sql += ` ORDER BY proposal_index DESC`;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const cacheKey = status ? `gov_council:${status}` : "gov_council";
      const [result, total] = await Promise.all([
        query(sql, params),
        cachedCount(
          cacheKey,
          status
            ? `SELECT COUNT(*) FROM gov_council_motions WHERE status = $1`
            : `SELECT COUNT(*) FROM gov_council_motions`,
          status ? [status] : [],
        ),
      ]);

      res.json({ data: result.rows, total });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch council motions", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/council/motions/{index}:
   *   get:
   *     tags: [Governance]
   *     summary: Get a council motion with its votes
   *     parameters:
   *       - in: path
   *         name: index
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Council motion detail with votes
   */
  app.get("/api/governance/council/motions/:index", async (req, res) => {
    try {
      const index = Number(req.params.index);
      const motionResult = await query(
        `SELECT * FROM gov_council_motions WHERE proposal_index = $1`,
        [index],
      );

      if (motionResult.rows.length === 0) {
        res.status(404).json({ error: "Motion not found" });
        return;
      }

      const votes = await query(
        `SELECT * FROM gov_council_votes WHERE proposal_hash = $1 ORDER BY block_height DESC LIMIT 500`,
        [motionResult.rows[0]!.proposal_hash],
      );

      res.json({ motion: motionResult.rows[0], votes: votes.rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch motion", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/techcomm/proposals:
   *   get:
   *     tags: [Governance]
   *     summary: List technical committee proposals
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [proposed, approved, disapproved, executed, closed]
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
   *         description: List of technical committee proposals
   */
  app.get("/api/governance/techcomm/proposals", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string | undefined;

      let sql = `SELECT * FROM gov_techcomm_proposals`;
      const params: unknown[] = [];

      if (status) {
        params.push(status);
        sql += ` WHERE status = $${params.length}`;
      }

      sql += ` ORDER BY proposal_index DESC`;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const cacheKey = status ? `gov_techcomm:${status}` : "gov_techcomm";
      const [result, total] = await Promise.all([
        query(sql, params),
        cachedCount(
          cacheKey,
          status
            ? `SELECT COUNT(*) FROM gov_techcomm_proposals WHERE status = $1`
            : `SELECT COUNT(*) FROM gov_techcomm_proposals`,
          status ? [status] : [],
        ),
      ]);

      res.json({ data: result.rows, total });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch techcomm proposals", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/techcomm/proposals/{index}:
   *   get:
   *     tags: [Governance]
   *     summary: Get a technical committee proposal with its votes
   *     parameters:
   *       - in: path
   *         name: index
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: TechComm proposal detail with votes
   */
  app.get("/api/governance/techcomm/proposals/:index", async (req, res) => {
    try {
      const index = Number(req.params.index);
      const propResult = await query(
        `SELECT * FROM gov_techcomm_proposals WHERE proposal_index = $1`,
        [index],
      );

      if (propResult.rows.length === 0) {
        res.status(404).json({ error: "Proposal not found" });
        return;
      }

      const votes = await query(
        `SELECT * FROM gov_techcomm_votes WHERE proposal_hash = $1 ORDER BY block_height DESC LIMIT 500`,
        [propResult.rows[0]!.proposal_hash],
      );

      res.json({ proposal: propResult.rows[0], votes: votes.rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch proposal", detail: String(err) });
    }
  });

  /**
   * @openapi
   * /api/governance/summary:
   *   get:
   *     tags: [Governance]
   *     summary: Governance overview stats
   *     responses:
   *       200:
   *         description: Counts of proposals, referenda, motions by status
   */
  app.get("/api/governance/summary", async (_req, res) => {
    try {
      const toMap = (rows: Record<string, unknown>[]) =>
        Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]));

      const summary = await cachedQuery("gov_summary", async () => {
        const [referenda, proposals, council, techcomm] = await Promise.all([
          query(`SELECT status, COUNT(*) as count FROM gov_democracy_referenda GROUP BY status`),
          query(`SELECT status, COUNT(*) as count FROM gov_democracy_proposals GROUP BY status`),
          query(`SELECT status, COUNT(*) as count FROM gov_council_motions GROUP BY status`),
          query(`SELECT status, COUNT(*) as count FROM gov_techcomm_proposals GROUP BY status`),
        ]);
        return {
          referenda: toMap(referenda.rows),
          proposals: toMap(proposals.rows),
          council: toMap(council.rows),
          techcomm: toMap(techcomm.rows),
        };
      });

      res.json(summary);
    } catch (err) {
      // Tables may not exist yet if extension hasn't been activated
      res.json({ referenda: {}, proposals: {}, council: {}, techcomm: {} });
    }
  });
}
