import type { Express } from "express";
import { query } from "@polka-xplo/db";
import { normalizeAddress } from "@polka-xplo/shared";

export function register(app: Express): void {
  /**
   * @openapi
   * /api/xcm/messages:
   *   get:
   *     tags: [XCM]
   *     summary: List XCM messages
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
   *         name: direction
   *         schema:
   *           type: string
   *           enum: [inbound, outbound]
   *       - in: query
   *         name: protocol
   *         schema:
   *           type: string
   *           enum: [HRMP, UMP, DMP]
   *       - in: query
   *         name: chain_id
   *         schema:
   *           type: integer
   *         description: Filter by origin or dest para ID
   *     responses:
   *       200:
   *         description: Paginated list of XCM messages
   */
  app.get("/api/xcm/messages", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const direction = req.query.direction ? String(req.query.direction) : undefined;
      const protocol = req.query.protocol ? String(req.query.protocol) : undefined;
      const chainId = req.query.chain_id != null ? Number(req.query.chain_id) : undefined;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (direction) {
        conditions.push(`direction = $${idx++}`);
        params.push(direction);
      }
      if (protocol) {
        conditions.push(`protocol = $${idx++}`);
        params.push(protocol);
      }
      if (chainId != null) {
        conditions.push(`(origin_para_id = $${idx} OR dest_para_id = $${idx})`);
        params.push(chainId);
        idx++;
      }

      const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

      const countRes = await query(`SELECT COUNT(*) FROM xcm_messages${where}`, params);
      const total = parseInt(String(countRes.rows[0]!.count), 10);

      params.push(limit, offset);
      const rows = await query(
        `SELECT id, message_hash, message_id, direction, protocol,
                origin_para_id, dest_para_id, sender, success,
                block_height, extrinsic_id, created_at
         FROM xcm_messages${where}
         ORDER BY block_height DESC, id DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        params,
      );

      res.json({
        data: rows.rows,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < total,
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        res.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  /**
   * @openapi
   * /api/xcm/transfers:
   *   get:
   *     tags: [XCM]
   *     summary: List XCM value transfers
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
   *         name: direction
   *         schema:
   *           type: string
   *           enum: [inbound, outbound]
   *       - in: query
   *         name: asset
   *         schema:
   *           type: string
   *         description: Filter by asset symbol (e.g. AJUN, DOT, USDt)
   *       - in: query
   *         name: from_chain
   *         schema:
   *           type: integer
   *       - in: query
   *         name: to_chain
   *         schema:
   *           type: integer
   *       - in: query
   *         name: address
   *         schema:
   *           type: string
   *         description: Filter by from_address or to_address
   *     responses:
   *       200:
   *         description: Paginated list of XCM transfers
   */
  app.get("/api/xcm/transfers", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const offset = Number(req.query.offset) || 0;
      const direction = req.query.direction ? String(req.query.direction) : undefined;
      const asset = req.query.asset ? String(req.query.asset) : undefined;
      const fromChain = req.query.from_chain != null ? Number(req.query.from_chain) : undefined;
      const toChain = req.query.to_chain != null ? Number(req.query.to_chain) : undefined;
      const address = req.query.address ? String(req.query.address) : undefined;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (direction) {
        conditions.push(`t.direction = $${idx++}`);
        params.push(direction);
      }
      if (asset) {
        conditions.push(`t.asset_symbol = $${idx++}`);
        params.push(asset);
      }
      if (fromChain != null) {
        conditions.push(`t.from_chain_id = $${idx++}`);
        params.push(fromChain);
      }
      if (toChain != null) {
        conditions.push(`t.to_chain_id = $${idx++}`);
        params.push(toChain);
      }
      if (address) {
        const hexAddr = normalizeAddress(address) ?? address;
        conditions.push(`(t.from_address = $${idx} OR t.to_address = $${idx})`);
        params.push(hexAddr);
        idx++;
      }

      const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

      const countRes = await query(`SELECT COUNT(*) FROM xcm_transfers t${where}`, params);
      const total = parseInt(String(countRes.rows[0]!.count), 10);

      params.push(limit, offset);
      const rows = await query(
        `SELECT t.id, t.xcm_message_id, t.direction,
                t.from_chain_id, t.to_chain_id,
                t.from_address, t.to_address,
                t.asset_id, t.asset_symbol, t.amount,
                t.block_height, t.extrinsic_id, t.created_at,
                m.message_hash, m.protocol
         FROM xcm_transfers t
         LEFT JOIN xcm_messages m ON m.id = t.xcm_message_id
         ${where}
         ORDER BY t.block_height DESC, t.id DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        params,
      );

      res.json({
        data: rows.rows,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < total,
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        res.json({ data: [], total: 0, page: 1, pageSize: 25, hasMore: false });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  /**
   * @openapi
   * /api/xcm/channels:
   *   get:
   *     tags: [XCM]
   *     summary: List XCM channels with message/transfer counts
   *     responses:
   *       200:
   *         description: List of XCM channels
   */
  app.get("/api/xcm/channels", async (_req, res) => {
    try {
      const rows = await query(
        `SELECT * FROM xcm_channels
         ORDER BY message_count DESC`,
      );
      res.json({ data: rows.rows });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        res.json({ data: [] });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  /**
   * @openapi
   * /api/xcm/channels/{fromParaId}-{toParaId}:
   *   get:
   *     tags: [XCM]
   *     summary: Get details for a specific XCM channel
   *     parameters:
   *       - in: path
   *         name: fromParaId
   *         required: true
   *         schema:
   *           type: integer
   *       - in: path
   *         name: toParaId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Channel info with recent messages and transfers
   *       404:
   *         description: Channel not found
   */
  app.get("/api/xcm/channels/:fromParaId-:toParaId", async (req, res) => {
    try {
      const fromPara = Number(req.params.fromParaId);
      const toPara = Number(req.params.toParaId);

      const ch = await query(
        `SELECT * FROM xcm_channels WHERE from_para_id = $1 AND to_para_id = $2`,
        [fromPara, toPara],
      );

      if (ch.rows.length === 0) {
        res.status(404).json({ error: "Channel not found" });
        return;
      }

      // Recent messages for this channel
      const msgs = await query(
        `SELECT id, message_hash, message_id, direction, protocol,
                origin_para_id, dest_para_id, sender, success,
                block_height, extrinsic_id, created_at
         FROM xcm_messages
         WHERE (origin_para_id = $1 AND direction = 'inbound')
            OR (dest_para_id = $2 AND direction = 'outbound')
         ORDER BY block_height DESC
         LIMIT 25`,
        [fromPara, toPara],
      );

      // Recent transfers for this channel
      const transfers = await query(
        `SELECT t.*, m.message_hash, m.protocol
         FROM xcm_transfers t
         LEFT JOIN xcm_messages m ON m.id = t.xcm_message_id
         WHERE (t.from_chain_id = $1 AND t.to_chain_id IS NULL)
            OR (t.from_chain_id IS NULL AND t.to_chain_id = $2)
            OR (t.from_chain_id = $1 AND t.to_chain_id = $2)
         ORDER BY t.block_height DESC
         LIMIT 25`,
        [fromPara, toPara],
      );

      res.json({
        channel: ch.rows[0],
        recentMessages: msgs.rows,
        recentTransfers: transfers.rows,
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        res.status(404).json({ error: "XCM extension not active" });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  /**
   * @openapi
   * /api/xcm/summary:
   *   get:
   *     tags: [XCM]
   *     summary: XCM overview — total messages, transfers, channels
   *     responses:
   *       200:
   *         description: Summary statistics
   */
  app.get("/api/xcm/summary", async (_req, res) => {
    try {
      const [msgs, transfers, channels] = await Promise.all([
        query(`SELECT direction, protocol, COUNT(*) AS count
               FROM xcm_messages GROUP BY direction, protocol`),
        query(`SELECT direction, COUNT(*) AS count, COUNT(DISTINCT asset_symbol) AS assets
               FROM xcm_transfers GROUP BY direction`),
        query(`SELECT COUNT(*) AS count FROM xcm_channels`),
      ]);

      const msgStats: Record<string, Record<string, number>> = {};
      for (const r of msgs.rows) {
        const dir = String(r.direction);
        if (!msgStats[dir]) msgStats[dir] = {};
        msgStats[dir][String(r.protocol)] = Number(r.count);
      }

      const transferStats: Record<string, { count: number; assets: number }> = {};
      for (const r of transfers.rows) {
        transferStats[String(r.direction)] = {
          count: Number(r.count),
          assets: Number(r.assets),
        };
      }

      res.json({
        messages: msgStats,
        transfers: transferStats,
        channelCount: Number(channels.rows[0]?.count ?? 0),
      });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("does not exist")) {
        res.json({ messages: {}, transfers: {}, channelCount: 0 });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });
}
