import express from "express";
import { fileURLToPath } from "node:url";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { PluginRegistry } from "../plugins/registry.js";
import type { RpcPool } from "../rpc-pool.js";
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
  getTransfersList,
  getAccountTransfers,
  getDatabaseSize,
  getSpecVersions,
  getBlockHashForSpecVersion,
  getDigestLogs,
  query,
  getEventModules,
  dbMetrics,
  getBrokenExtrinsicBlocks,
  truncateOversizedArgs,
} from "@polka-xplo/db";
import { detectSearchType, normalizeAddress } from "@polka-xplo/shared";
import { metrics } from "../metrics.js";
import { getRuntimeSummary } from "../runtime-parser.js";

/**
 * The API server exposes indexed blockchain data to the frontend.
 * It provides REST endpoints for blocks, extrinsics, events, accounts, and search.
 */
export function createApiServer(
  registry: PluginRegistry,
  chainId: string,
  rpcPool?: RpcPool,
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
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customCss: ".swagger-ui .topbar { display: none }" }),
  );
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
    if (!rpcPool) {
      res.json({ endpoints: [], message: "RPC pool not initialized" });
      return;
    }
    res.json({
      endpointCount: rpcPool.size,
      endpoints: rpcPool.getStats(),
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
      const rpcHealth = rpcPool
        ? { endpointCount: rpcPool.size, endpoints: rpcPool.getStats() }
        : { endpointCount: 0, endpoints: [] };
      const cacheHitRatio = parseFloat(cacheHitResult.rows[0]?.ratio ?? "0");
      res.json({
        ...snapshot,
        database: {
          ...dbSize,
          cacheHitRatio,
          ...dbMetrics.getSnapshot(),
        },
        rpc: rpcHealth,
      });
    } catch {
      res.status(500).json({ error: "Failed to collect indexer status" });
    }
  });

  /**
   * @openapi
   * /api/runtime:
   *   get:
   *     tags: [Runtime]
   *     summary: List spec versions
   *     description: Returns all indexed runtime spec versions with their block ranges.
   *     responses:
   *       200:
   *         description: List of spec versions
   */
  app.get("/api/runtime", async (_req, res) => {
    try {
      const versions = await getSpecVersions();
      res.json({ versions });
    } catch {
      res.status(500).json({ error: "Failed to fetch spec versions" });
    }
  });

  /**
   * @openapi
   * /api/runtime/{specVersion}:
   *   get:
   *     tags: [Runtime]
   *     summary: Get runtime modules for a spec version
   *     description: Returns pallet summaries (calls, events, storage, constants, errors) for a given spec version.
   *     parameters:
   *       - in: path
   *         name: specVersion
   *         required: true
   *         schema:
   *           type: integer
   *         description: The spec version number
   *     responses:
   *       200:
   *         description: Runtime module summaries
   *       404:
   *         description: Spec version not found
   */
  app.get("/api/runtime/:specVersion", async (req, res) => {
    try {
      const specVersion = parseInt(req.params.specVersion, 10);
      if (isNaN(specVersion)) {
        res.status(400).json({ error: "Invalid spec version" });
        return;
      }

      const blockHash = await getBlockHashForSpecVersion(specVersion);
      if (!blockHash) {
        res.status(404).json({ error: `Spec version ${specVersion} not found in indexed blocks` });
        return;
      }

      if (!rpcPool) {
        res.status(503).json({ error: "RPC pool not available" });
        return;
      }

      const summary = await getRuntimeSummary(rpcPool, blockHash, specVersion);
      res.json(summary);
    } catch (err) {
      console.error("[API] Failed to fetch runtime metadata:", err);
      res.status(500).json({ error: "Failed to fetch runtime metadata" });
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
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch {
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
        res.status(400).json({
          error: "Invalid block identifier — expected a block number or 0x-prefixed hash",
        });
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
        res
          .status(400)
          .json({ error: "Invalid address — could not decode SS58 or hex public key" });
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
    } catch {
      res.status(500).json({ error: "Failed to fetch account" });
    }
  });

  /**
   * @openapi
   * /api/accounts/{address}/transfers:
   *   get:
   *     tags: [Accounts]
   *     summary: Get transfers for an account
   *     description: Returns paginated Balances.Transfer events where the account is sender or receiver.
   *     parameters:
   *       - in: path
   *         name: address
   *         required: true
   *         schema:
   *           type: string
   *         description: SS58 or hex address
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
   *         description: Paginated account transfers
   *       400:
   *         description: Invalid address
   */
  app.get("/api/accounts/:address/transfers", async (req, res) => {
    try {
      const { address } = req.params;
      if (!address || address.length > 128) {
        res.status(400).json({ error: "Invalid address format" });
        return;
      }
      const hexKey = normalizeAddress(address);
      if (!hexKey) {
        res.status(400).json({ error: "Invalid address" });
        return;
      }
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 50);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const result = await getAccountTransfers(hexKey, limit, offset);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch account transfers" });
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
    } catch {
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
      const result = await getTransfersList(limit, offset);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch transfers" });
    }
  });

  /**
   * @openapi
   * /api/logs:
   *   get:
   *     tags: [Logs]
   *     summary: List digest logs
   *     description: Returns a paginated list of block digest logs (PreRuntime, Seal, Consensus, etc.).
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 25
   *           minimum: 1
   *           maximum: 100
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: Paginated digest log list
   */
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10), 100);
      const offset = parseInt(String(req.query.offset ?? "0"), 10);
      if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
        res.status(400).json({ error: "Invalid limit or offset parameter" });
        return;
      }
      const result = await getDigestLogs(limit, offset);
      res.json({
        data: result.data,
        total: result.total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch digest logs" });
    }
  });

  /**
   * @openapi
   * /api/events/modules:
   *   get:
   *     tags: [Events]
   *     summary: List distinct event modules and their event types
   *     description: Returns all unique module names and their event types found in indexed data. Useful for building dynamic filter UIs.
   *     responses:
   *       200:
   *         description: List of modules with their event types
   */
  app.get("/api/events/modules", async (_req, res) => {
    try {
      const modules = await getEventModules();
      res.json({ modules });
    } catch {
      res.status(500).json({ error: "Failed to fetch event modules" });
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
   *       - in: query
   *         name: event
   *         schema:
   *           type: string
   *         description: Filter by event name within a module (e.g. Transfer, Deposit)
   *     responses:
   *       200:
   *         description: Paginated event list
   */
  app.get("/api/events", async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
      const module = req.query.module as string | undefined;
      const eventParam = req.query.event as string | undefined;
      const eventNames = eventParam ? eventParam.split(",").map((e) => e.trim()).filter(Boolean) : undefined;
      const result = await getEventsList(limit, offset, module || undefined, eventNames);
      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: result.data,
        total: result.total,
        page,
        pageSize: limit,
        hasMore: offset + limit < result.total,
      });
    } catch {
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
    } catch {
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
   * /api/extensions/{extensionId}/backfill:
   *   post:
   *     tags: [Extensions]
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
  app.post("/api/extensions/:extensionId/backfill", async (req, res) => {
    try {
      const result = await registry.backfillById(req.params.extensionId);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: String(err) });
    }
  });

  // ============================================================
  // Repair Endpoint — re-decode broken extrinsics
  // ============================================================

  /**
   * @openapi
   * /api/repair/extrinsics:
   *   post:
   *     tags: [Admin]
   *     summary: Repair mis-decoded extrinsics
   *     description: |
   *       Finds extrinsics with placeholder module/call names (e.g. "Pallet(217)", "call(56)")
   *       caused by decoder bugs, re-fetches the block from RPC, re-decodes the extrinsics,
   *       and updates the DB rows.
   *     responses:
   *       200:
   *         description: Repair results
   */
  app.post("/api/repair/extrinsics", async (_req, res) => {
    if (!rpcPool) {
      res.status(503).json({ error: "RPC pool not available" });
      return;
    }
    try {
      const { ExtrinsicDecoder } = await import("../ingestion/extrinsic-decoder.js");
      const decoder = new ExtrinsicDecoder(rpcPool);

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
          const blockHash: string = await rpcPool.call("chain_getBlockHash", [height]);
          if (!blockHash) { errors++; continue; }

          // Fetch full block
          const blockData = await rpcPool.call<{
            block: { extrinsics: string[] };
          }>("chain_getBlock", [blockHash]);
          if (!blockData?.block?.extrinsics) { errors++; continue; }

          // Ensure metadata is loaded for this block's runtime
          const { lookup } = await decoder.ensureMetadata(blockHash);

          // Re-decode each extrinsic and update
          for (let i = 0; i < blockData.block.extrinsics.length; i++) {
            const hex = blockData.block.extrinsics[i];
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

  // ============================================================
  // Maintenance — Truncate oversized extrinsic args
  // ============================================================

  /**
   * @openapi
   * /api/maintenance/truncate-args:
   *   post:
   *     tags: [Admin]
   *     summary: Truncate oversized extrinsic args
   *     description: |
   *       Replaces extrinsic args larger than 4 KB with a compact marker
   *       `{"_oversized": true, "_originalBytes": N}`.
   *       Runs in batches; call repeatedly until `remaining` is 0.
   *     responses:
   *       200:
   *         description: Truncation results
   */
  app.post("/api/maintenance/truncate-args", async (_req, res) => {
    try {
      let totalUpdated = 0;
      let batch: { updated: number };

      // Process in batches to avoid long-running transactions
      do {
        batch = await truncateOversizedArgs(4096, 500);
        totalUpdated += batch.updated;
        if (batch.updated > 0) {
          console.log(`[Maintenance] Truncated ${batch.updated} oversized args (total: ${totalUpdated})`);
        }
      } while (batch.updated > 0);

      console.log(`[Maintenance] Done: ${totalUpdated} extrinsics truncated`);

      // Report remaining for follow-up calls
      const remaining = await query<{ cnt: string }>(
        `SELECT count(*) AS cnt FROM extrinsics WHERE length(args::text) > 4096 AND (args->>'_oversized') IS NULL`,
        [],
      );

      res.json({
        truncated: totalUpdated,
        remaining: Number(remaining.rows[0]?.cnt ?? 0),
      });
    } catch (err) {
      console.error("[Maintenance] Failed:", err);
      res.status(500).json({ error: "Truncation failed" });
    }
  });

  /**
   * @openapi
   * /api/maintenance/vacuum:
   *   post:
   *     tags: [Admin]
   *     summary: Run VACUUM ANALYZE on main tables
   *     description: |
   *       Reclaims disk space after large truncation operations
   *       and updates planner statistics. May take several minutes.
   *     responses:
   *       200:
   *         description: Vacuum results
   */
  app.post("/api/maintenance/vacuum", async (_req, res) => {
    try {
      console.log("[Maintenance] Starting VACUUM ANALYZE on extrinsics...");
      const start = Date.now();
      await query("VACUUM ANALYZE extrinsics", []);
      const extTime = Date.now() - start;
      console.log(`[Maintenance] extrinsics done in ${extTime}ms`);

      const start2 = Date.now();
      await query("VACUUM ANALYZE events", []);
      const evtTime = Date.now() - start2;
      console.log(`[Maintenance] events done in ${evtTime}ms`);

      const start3 = Date.now();
      await query("VACUUM ANALYZE blocks", []);
      const blkTime = Date.now() - start3;
      console.log(`[Maintenance] blocks done in ${blkTime}ms`);

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

  // ============================================================
  // Assets Extension API Endpoints
  // ============================================================

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

      const countRes = await query(`SELECT COUNT(*) FROM assets${where}`, status ? [status] : []);
      const total = parseInt(String(countRes.rows[0].count), 10);

      const rows = await query(
        `SELECT * FROM assets${where} ORDER BY asset_id ASC LIMIT $1 OFFSET $2`,
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
      res.status(500).json({ error: String(err) });
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
      const rows = await query(
        `SELECT status, COUNT(*) AS count FROM assets GROUP BY status`,
      );
      const summary: Record<string, number> = {};
      for (const r of rows.rows) {
        summary[String(r.status)] = parseInt(String(r.count), 10);
      }
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: String(err) });
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
      res.status(500).json({ error: String(err) });
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

      const countRes = await query(
        "SELECT COUNT(*) FROM asset_transfers WHERE asset_id = $1",
        [assetId],
      );
      const total = parseInt(String(countRes.rows[0].count), 10);

      const rows = await query(
        `SELECT * FROM asset_transfers WHERE asset_id = $1 ORDER BY block_height DESC LIMIT $2 OFFSET $3`,
        [assetId, limit, offset],
      );

      res.json({
        data: rows.rows,
        total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        hasMore: offset + limit < total,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ============================================================
  // Governance Extension API Endpoints
  // ============================================================

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

      let sql = `SELECT r.*, (SELECT COUNT(*) FROM gov_democracy_votes v WHERE v.ref_index = r.ref_index) as vote_count,
                 (SELECT COUNT(*) FROM gov_democracy_votes v WHERE v.ref_index = r.ref_index AND v.is_aye = true) as aye_count,
                 (SELECT COUNT(*) FROM gov_democracy_votes v WHERE v.ref_index = r.ref_index AND v.is_aye = false) as nay_count
                 FROM gov_democracy_referenda r`;
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

      const result = await query(sql, params);

      const countSql = status
        ? `SELECT COUNT(*) FROM gov_democracy_referenda WHERE status = $1`
        : `SELECT COUNT(*) FROM gov_democracy_referenda`;
      const countResult = await query(countSql, status ? [status] : []);
      const total = Number(countResult.rows[0]?.count ?? 0);

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
        `SELECT * FROM gov_democracy_votes WHERE ref_index = $1 ORDER BY block_height DESC`,
        [refIndex],
      );

      res.json({ referendum: refResult.rows[0], votes: votes.rows });
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

      const result = await query(sql, params);

      const countSql = status
        ? `SELECT COUNT(*) FROM gov_democracy_proposals WHERE status = $1`
        : `SELECT COUNT(*) FROM gov_democracy_proposals`;
      const countResult = await query(countSql, status ? [status] : []);
      const total = Number(countResult.rows[0]?.count ?? 0);

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

      const result = await query(sql, params);

      const countSql = status
        ? `SELECT COUNT(*) FROM gov_council_motions WHERE status = $1`
        : `SELECT COUNT(*) FROM gov_council_motions`;
      const countResult = await query(countSql, status ? [status] : []);
      const total = Number(countResult.rows[0]?.count ?? 0);

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
        `SELECT * FROM gov_council_votes WHERE proposal_hash = $1 ORDER BY block_height DESC`,
        [motionResult.rows[0].proposal_hash],
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

      const result = await query(sql, params);

      const countSql = status
        ? `SELECT COUNT(*) FROM gov_techcomm_proposals WHERE status = $1`
        : `SELECT COUNT(*) FROM gov_techcomm_proposals`;
      const countResult = await query(countSql, status ? [status] : []);
      const total = Number(countResult.rows[0]?.count ?? 0);

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
        `SELECT * FROM gov_techcomm_votes WHERE proposal_hash = $1 ORDER BY block_height DESC`,
        [propResult.rows[0].proposal_hash],
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
      const [referenda, proposals, council, techcomm] = await Promise.all([
        query(`SELECT status, COUNT(*) as count FROM gov_democracy_referenda GROUP BY status`),
        query(`SELECT status, COUNT(*) as count FROM gov_democracy_proposals GROUP BY status`),
        query(`SELECT status, COUNT(*) as count FROM gov_council_motions GROUP BY status`),
        query(`SELECT status, COUNT(*) as count FROM gov_techcomm_proposals GROUP BY status`),
      ]);

      const toMap = (rows: Record<string, unknown>[]) =>
        Object.fromEntries(rows.map((r) => [String(r.status), Number(r.count)]));

      res.json({
        referenda: toMap(referenda.rows),
        proposals: toMap(proposals.rows),
        council: toMap(council.rows),
        techcomm: toMap(techcomm.rows),
      });
    } catch (err) {
      // Tables may not exist yet if extension hasn't been activated
      res.json({ referenda: {}, proposals: {}, council: {}, techcomm: {} });
    }
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
