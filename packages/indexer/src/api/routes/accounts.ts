import type { Express } from "express";
import type { ApiContext } from "../types.js";
import {
  getAccount,
  getAccounts,
  getExtrinsicsBySigner,
  getAccountTransfers,
  getRegisteredAssets,
  query,
} from "@polka-xplo/db";
import { normalizeAddress } from "@polka-xplo/shared";
import { getLiveBalance, getLiveIdentity, getLiveAssetBalances } from "../../chain-state.js";

export function register(app: Express, ctx: ApiContext): void {
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

      // Fetch live balance and identity from chain RPC (always accurate)
      let balance = account?.balance ?? null;
      let identity: Awaited<ReturnType<typeof getLiveIdentity>> = null;
      if (ctx.rpcPool) {
        try {
          const [live, liveId] = await Promise.allSettled([
            getLiveBalance(ctx.rpcPool, hexKey),
            getLiveIdentity(ctx.rpcPool, hexKey),
          ]);
          if (live.status === "fulfilled" && live.value) {
            balance = {
              free: live.value.free,
              reserved: live.value.reserved,
              frozen: live.value.frozen,
              flags: live.value.flags,
            };
          }
          if (liveId.status === "fulfilled" && liveId.value) {
            identity = liveId.value;
          }
        } catch (err) {
          // Fall back to DB balance if RPC fails
          console.warn("[API] Live balance/identity query failed, using DB fallback:", err);
        }
      }

      if (!account && !balance) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      const recentExtrinsics = account ? await getExtrinsicsBySigner(hexKey, 20) : [];

      // Fetch live asset balances (ext-assets)
      let assetBalances: Awaited<ReturnType<typeof getLiveAssetBalances>> = [];
      if (ctx.rpcPool) {
        try {
          const registeredAssets = await getRegisteredAssets();
          if (registeredAssets.length > 0) {
            assetBalances = await getLiveAssetBalances(ctx.rpcPool, hexKey, registeredAssets);
          }
        } catch (err) {
          console.warn("[API] Asset balance query failed:", err);
        }
      }

      res.json({
        account: {
          address: account?.address ?? hexKey,
          publicKey: account?.publicKey ?? hexKey,
          lastActiveBlock: account?.lastActiveBlock ?? null,
          createdAtBlock: account?.createdAtBlock ?? null,
        },
        balance,
        identity,
        assetBalances,
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
   * /api/accounts/{address}/asset-transfers:
   *   get:
   *     tags: [Accounts]
   *     summary: Asset pallet transfers involving an account
   *     description: Returns paginated asset (non-native) transfers where the account is sender or receiver.
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
   *         description: Paginated asset transfers for the account
   *       400:
   *         description: Invalid address
   */
  app.get("/api/accounts/:address/asset-transfers", async (req, res) => {
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
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 25, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

      const countRes = await query(
        "SELECT COUNT(*) FROM asset_transfers WHERE from_address = $1 OR to_address = $1",
        [hexKey],
      );
      const total = parseInt(String(countRes.rows[0]!.count), 10);

      const rows = await query(
        `SELECT t.*, a.symbol, a.name AS asset_name, a.decimals
         FROM asset_transfers t
         LEFT JOIN assets a ON a.asset_id = t.asset_id
         WHERE t.from_address = $1 OR t.to_address = $1
         ORDER BY t.block_height DESC, t.id DESC
         LIMIT $2 OFFSET $3`,
        [hexKey, limit, offset],
      );

      const page = Math.floor(offset / limit) + 1;
      res.json({
        data: rows.rows,
        total,
        page,
        pageSize: limit,
        hasMore: offset + limit < total,
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch account asset transfers" });
    }
  });
}
