import type { Express } from "express";
import {
  getBlockByHeight,
  getAccount,
  searchByHash,
} from "@polka-xplo/db";
import { detectSearchType, normalizeAddress } from "@polka-xplo/shared";

export function register(app: Express): void {
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

      if (input.length > 256) {
        res.status(400).json({ error: "Search query too long" });
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
}
