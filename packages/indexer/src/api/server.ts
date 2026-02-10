import express from "express";
import { fileURLToPath } from "node:url";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { PluginRegistry } from "../plugins/registry.js";
import {
  getLatestBlocks,
  getBlockByHeight,
  getBlockByHash,
  getExtrinsicsByBlock,
  getExtrinsicByHash,
  getExtrinsicById,
  getExtrinsicsBySigner,
  getExtrinsicsList,
  getEventsByBlock,
  getEventsByExtrinsic,
  getEventsList,
  getAccount,
  getAccounts,
  getIndexerState,
  searchByHash,
  getChainStats,
  getLatestTransfers,
  getTransfersList,
} from "@polka-xplo/db";
import { detectSearchType, normalizeAddress } from "@polka-xplo/shared";

/**
 * The API server exposes indexed blockchain data to the frontend.
 * It provides REST endpoints for blocks, extrinsics, events, accounts, and search.
 */
export function createApiServer(
  registry: PluginRegistry,
  chainId: string
): express.Express {
  const app = express();

  app.use(express.json());

  // ---- Swagger / OpenAPI ----
  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Polka-Xplo Indexer API",
        version: "0.1.0",
        description:
          "REST API for querying indexed Polkadot/Substrate blockchain data — blocks, extrinsics, events, accounts, and search.",
        license: { name: "AGPL-3.0", url: "https://www.gnu.org/licenses/agpl-3.0.html" },
      },
      servers: [{ url: "/", description: "Current host" }],
    },
    apis: [fileURLToPath(import.meta.url)], // scan this file for JSDoc comments
  });
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customCss: ".swagger-ui .topbar { display: none }" }));
  app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

  // CORS — configurable via CORS_ORIGIN env var (defaults to * for local dev)
  const allowedOrigin = process.env.CORS_ORIGIN ?? "*";
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", allowedOrigin);
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

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
      const state = await getIndexerState(chainId);
      res.json({
        status: state?.state === "live" ? "healthy" : "degraded",
        nodeConnected: true,
        syncLag: state ? state.chainTip - state.lastFinalizedBlock : -1,
        dbConnected: true,
        chainTip: state?.chainTip ?? 0,
        indexedTip: state?.lastFinalizedBlock ?? 0,
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
   * /api/blocks:
   *   get:
   *     tags: [Blocks]
   *     summary: List recent blocks
   *     description: Returns a paginated list of blocks, newest first.
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *           minimum: 1
   *           maximum: 100
   *         description: Number of blocks to return (max 100)
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *           minimum: 0
   *         description: Pagination offset
   *     responses:
   *       200:
   *         description: Paginated block list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/BlockSummary'
   *                 total:
   *                   type: integer
   *                 page:
   *                   type: integer
   *                 pageSize:
   *                   type: integer
   *                 hasMore:
   *                   type: boolean
   *       400:
   *         description: Invalid parameters
   */
  app.get("/api/blocks", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
      const offset = parseInt(String(req.query.offset ?? "0"), 10);
      if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
        res.status(400).json({ error: "Invalid limit or offset parameter" });
        return;
      }
      const result = await getLatestBlocks(limit, offset);
      res.json({
        data: result.blocks,
        total: result.total,
        page: Math.floor(offset / limit),
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch blocks" });
    }
  });

  /**
   * @openapi
   * /api/blocks/{id}:
   *   get:
   *     tags: [Blocks]
   *     summary: Get block details
   *     description: Returns block header, extrinsics, and events by block height or hash.
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Block height (number) or 0x-prefixed block hash
   *     responses:
   *       200:
   *         description: Block detail with extrinsics and events
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 block:
   *                   $ref: '#/components/schemas/BlockSummary'
   *                 extrinsics:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Extrinsic'
   *                 events:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Event'
   *       400:
   *         description: Invalid block identifier
   *       404:
   *         description: Block not found
   */
  app.get("/api/blocks/:id", async (req, res) => {
    try {
      const { id } = req.params;
      // Validate: must be a block number or a 0x-prefixed hash
      if (!/^\d+$/.test(id) && !/^0x[0-9a-fA-F]{64}$/.test(id)) {
        res.status(400).json({ error: "Invalid block identifier — expected a block number or 0x-prefixed hash" });
        return;
      }
      const block = /^\d+$/.test(id)
        ? await getBlockByHeight(parseInt(id, 10))
        : await getBlockByHash(id);

      if (!block) {
        res.status(404).json({ error: "Block not found" });
        return;
      }

      const [extrinsics, events] = await Promise.all([
        getExtrinsicsByBlock(block.height),
        getEventsByBlock(block.height),
      ]);

      res.json({ block, extrinsics, events });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch block" });
    }
  });

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
      const result = await getExtrinsicsList(limit, offset, signedOnly);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch extrinsics" });
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

      // Fetch block for timestamp
      const block = await getBlockByHeight(extrinsic.blockHeight);
      const events = await getEventsByExtrinsic(extrinsic.id);
      res.json({
        extrinsic,
        events,
        blockTimestamp: block?.timestamp ?? null,
        blockHash: block?.hash ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch extrinsic" });
    }
  });

  /**
   * @openapi
   * /api/accounts:
   *   get:
   *     tags: [Accounts]
   *     summary: List all accounts
   *     description: Returns a paginated list of accounts sorted by balance (descending).
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 25
   *         description: Number of accounts per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Pagination offset
   *     responses:
   *       200:
   *         description: Paginated account list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       address:
   *                         type: string
   *                       publicKey:
   *                         type: string
   *                       identity:
   *                         type: object
   *                         nullable: true
   *                       lastActiveBlock:
   *                         type: integer
   *                       createdAtBlock:
   *                         type: integer
   *                       balance:
   *                         type: object
   *                         nullable: true
   *                       extrinsicCount:
   *                         type: integer
   *                 total:
   *                   type: integer
   *                 page:
   *                   type: integer
   *                 pageSize:
   *                   type: integer
   *                 hasMore:
   *                   type: boolean
   */
  app.get("/api/accounts", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const result = await getAccounts(limit, offset);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  /**
   * @openapi
   * /api/accounts/{address}:
   *   get:
   *     tags: [Accounts]
   *     summary: Get account details
   *     description: Returns account identity, balance breakdown, and recent extrinsics.
   *     parameters:
   *       - in: path
   *         name: address
   *         required: true
   *         schema:
   *           type: string
   *         description: SS58 or H160 (EVM) address
   *     responses:
   *       200:
   *         description: Account with balance and recent activity
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 account:
   *                   $ref: '#/components/schemas/Account'
   *                 balance:
   *                   $ref: '#/components/schemas/AccountBalance'
   *                 recentExtrinsics:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Extrinsic'
   *       400:
   *         description: Invalid address
   *       404:
   *         description: Account not found
   */
  app.get("/api/accounts/:address", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || address.length > 128) {
        res.status(400).json({ error: "Invalid address format" });
        return;
      }

      // Normalize SS58 or hex input to canonical hex public key
      const hexKey = normalizeAddress(address);
      if (!hexKey) {
        res.status(400).json({ error: "Invalid address — could not decode SS58 or hex public key" });
        return;
      }

      const account = await getAccount(hexKey);
      if (!account) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const recentExtrinsics = await getExtrinsicsBySigner(hexKey, 20);

      res.json({
        account: {
          address: account.address,
          publicKey: account.publicKey,
          identity: account.identity,
          lastActiveBlock: account.lastActiveBlock,
          createdAtBlock: account.createdAtBlock,
        },
        balance: account.balance,
        recentExtrinsics,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch account" });
    }
  });

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
   */
  app.get("/api/stats", async (_req, res) => {
    try {
      const stats = await getChainStats();
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  /**
   * @openapi
   * /api/transfers:
   *   get:
   *     tags: [Transfers]
   *     summary: Latest transfers
   *     description: Returns the most recent balance transfer events.
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *           minimum: 1
   *           maximum: 50
   *         description: Number of transfers to return (max 50)
   *     responses:
   *       200:
   *         description: Transfer list
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   extrinsicId:
   *                     type: string
   *                   blockHeight:
   *                     type: integer
   *                   timestamp:
   *                     type: integer
   *                     nullable: true
   *                   amount:
   *                     type: string
   *                   from:
   *                     type: string
   *                   to:
   *                     type: string
   */
  app.get("/api/transfers", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      // If offset=0 and limit<=50, use old fast path for homepage card; otherwise paginated
      if (offset === 0 && limit <= 50 && !req.query.offset) {
        const transfers = await getLatestTransfers(limit);
        res.json(transfers);
      } else {
        const result = await getTransfersList(limit, offset);
        const page = Math.floor(offset / limit) + 1;
        res.json({
          data: result.data,
          total: result.total,
          page,
          pageSize: limit,
          hasMore: offset + limit < result.total,
        });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch transfers" });
    }
  });

  /**
   * @openapi
   * /api/events:
   *   get:
   *     tags: [Events]
   *     summary: List events
   *     description: Returns a paginated list of events, most recent first. Optionally filter by module.
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
   *         name: module
   *         schema:
   *           type: string
   *         description: Filter by pallet module name (e.g. Balances, System)
   *     responses:
   *       200:
   *         description: Paginated event list
   */
  app.get("/api/events", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const module = req.query.module as string | undefined;
      const result = await getEventsList(limit, offset, module || undefined);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  /**
   * @openapi
   * /api/search:
   *   get:
   *     tags: [Search]
   *     summary: Smart search
   *     description: |
   *       Searches by heuristic input detection:
   *       - **Block number** (numeric) → searches blocks by height
   *       - **Hash** (0x-prefixed, 66 chars) → searches blocks and extrinsics
   *       - **Address** (SS58/H160) → links to account page
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Search query (block number, hash, or address)
   *     responses:
   *       200:
   *         description: Search results
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 results:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       type:
   *                         type: string
   *                         enum: [block, extrinsic, account]
   *                       id:
   *                         type: string
   *                       label:
   *                         type: string
   *                       url:
   *                         type: string
   */
  app.get("/api/search", async (req, res) => {
    try {
      const input = String(req.query.q ?? "").trim();
      if (!input) {
        res.json({ results: [] });
        return;
      }

      const inputType = detectSearchType(input);
      const results = [];

      switch (inputType) {
        case "blockNumber": {
          const height = parseInt(input, 10);
          const block = await getBlockByHeight(height);
          if (block) {
            results.push({
              type: "block",
              id: String(block.height),
              label: `Block #${block.height}`,
              url: `/block/${block.height}`,
            });
          }
          break;
        }

        case "hash": {
          const match = await searchByHash(input);
          if (match) {
            if (match.type === "block") {
              const block = match.data as { height: number };
              results.push({
                type: "block",
                id: String(block.height),
                label: `Block #${block.height}`,
                url: `/block/${block.height}`,
              });
            } else {
              const ext = match.data as { txHash: string; blockHeight: number };
              results.push({
                type: "extrinsic",
                id: ext.txHash,
                label: `Extrinsic in block #${ext.blockHeight}`,
                url: `/extrinsic/${ext.txHash}`,
              });
            }
          }
          break;
        }

        case "address": {
          // Normalize SS58/hex to canonical hex public key
          const hexAddr = normalizeAddress(input) ?? input;
          const account = await getAccount(hexAddr);
          if (account) {
            results.push({
              type: "account",
              id: account.address,
              label: `Account ${account.address}`,
              url: `/account/${account.address}`,
            });
          } else {
            // Even if we haven't indexed this account, provide a link
            results.push({
              type: "account",
              id: hexAddr,
              label: `Account ${hexAddr}`,
              url: `/account/${hexAddr}`,
            });
          }
          break;
        }
      }

      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  /**
   * @openapi
   * /api/extensions:
   *   get:
   *     tags: [Extensions]
   *     summary: List registered extensions
   *     description: Returns all registered pallet extension manifests.
   *     responses:
   *       200:
   *         description: Extension manifest list
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 extensions:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       name:
   *                         type: string
   *                       version:
   *                         type: string
   *                       palletId:
   *                         type: string
   *                       supportedEvents:
   *                         type: array
   *                         items:
   *                           type: string
   *                       supportedCalls:
   *                         type: array
   *                         items:
   *                           type: string
   */
  app.get("/api/extensions", (_req, res) => {
    res.json({ extensions: registry.getExtensions() });
  });

  /**
   * @openapi
   * components:
   *   schemas:
   *     BlockSummary:
   *       type: object
   *       properties:
   *         height:
   *           type: integer
   *           description: Block number
   *         hash:
   *           type: string
   *           description: 0x-prefixed block hash
   *         parentHash:
   *           type: string
   *         stateRoot:
   *           type: string
   *         extrinsicsRoot:
   *           type: string
   *         timestamp:
   *           type: integer
   *           nullable: true
   *           description: Unix timestamp (ms)
   *         validatorId:
   *           type: string
   *           nullable: true
   *         status:
   *           type: string
   *           enum: [best, finalized]
   *         specVersion:
   *           type: integer
   *         eventCount:
   *           type: integer
   *         extrinsicCount:
   *           type: integer
   *     Extrinsic:
   *       type: object
   *       properties:
   *         id:
   *           type: string
   *           description: "blockHeight-index"
   *         blockHeight:
   *           type: integer
   *         txHash:
   *           type: string
   *           nullable: true
   *         index:
   *           type: integer
   *         signer:
   *           type: string
   *           nullable: true
   *         module:
   *           type: string
   *         call:
   *           type: string
   *         args:
   *           type: object
   *           description: Decoded call arguments (JSONB)
   *         success:
   *           type: boolean
   *         fee:
   *           type: string
   *           nullable: true
   *         tip:
   *           type: string
   *           nullable: true
   *     Event:
   *       type: object
   *       properties:
   *         id:
   *           type: string
   *         blockHeight:
   *           type: integer
   *         extrinsicId:
   *           type: string
   *           nullable: true
   *         index:
   *           type: integer
   *         module:
   *           type: string
   *         event:
   *           type: string
   *         data:
   *           type: object
   *           description: Decoded event data (JSONB)
   *     Account:
   *       type: object
   *       properties:
   *         address:
   *           type: string
   *         publicKey:
   *           type: string
   *           nullable: true
   *         identity:
   *           type: object
   *           nullable: true
   *         lastActiveBlock:
   *           type: integer
   *         createdAtBlock:
   *           type: integer
   *     AccountBalance:
   *       type: object
   *       properties:
   *         free:
   *           type: string
   *         reserved:
   *           type: string
   *         frozen:
   *           type: string
   *         flags:
   *           type: string
   *           nullable: true
   *         updatedAtBlock:
   *           type: integer
   */

  return app;
}
