import type { BlockContext, ExplorerEvent } from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Assets Extension — Event Handler
 *
 * Processes events from the Assets pallet into dedicated tables
 * tracking asset metadata, ownership, supply, and transfers.
 */
export async function onEvent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const key = `${event.module}.${event.event}`;

  switch (key) {
    case "Assets.ForceCreated":
    case "Assets.Created":
      await handleAssetCreated(ctx, event);
      break;
    case "Assets.MetadataSet":
      await handleMetadataSet(ctx, event);
      break;
    case "Assets.MetadataCleared":
      await handleMetadataCleared(ctx, event);
      break;
    case "Assets.Issued":
      await handleIssued(ctx, event);
      break;
    case "Assets.Burned":
      await handleBurned(ctx, event);
      break;
    case "Assets.Transferred":
      await handleTransferred(ctx, event);
      break;
    case "Assets.AssetStatusChanged":
      await handleStatusChanged(ctx, event);
      break;
    case "Assets.Frozen":
      await handleFreezeState(ctx, event, true);
      break;
    case "Assets.Thawed":
      await handleFreezeState(ctx, event, false);
      break;
    case "Assets.OwnerChanged":
      await handleOwnerChanged(ctx, event);
      break;
    case "Assets.TeamChanged":
      await handleTeamChanged(ctx, event);
      break;
    case "Assets.Destroyed":
      await handleDestroyed(ctx, event);
      break;
    default:
      break;
  }
}

/**
 * Return raw SQL for the assets migration.
 * Path resolves relative to compiled JS in dist/indexer/.
 */
export function getMigrationSQL(): string {
  const migrationPath = path.resolve(__dirname, "..", "..", "migrations", "001_assets.sql");
  return fs.readFileSync(migrationPath, "utf-8");
}

// ========================================================================
// Helpers
// ========================================================================

function getField(data: Record<string, unknown>, key: string): unknown {
  return data?.[key] ?? null;
}

function asStr(v: unknown): string {
  return v != null ? String(v) : "";
}

function asInt(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Decode hex-encoded UTF-8 strings like "0x506f6c6b61646f7420444f54".
 * Returns the decoded string, or the original value if not hex.
 */
function decodeHexString(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.startsWith("0x") || s.startsWith("0X")) {
    try {
      const hex = s.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    } catch {
      return s;
    }
  }
  return s;
}

/**
 * Ensure an asset row exists before updating it.
 * Some events (MetadataSet, Issued, etc.) can arrive before ForceCreated
 * during backfill if events at the same block are processed out of order.
 */
async function ensureAsset(assetId: number, blockHeight: number): Promise<void> {
  await query(
    `INSERT INTO assets (asset_id, created_block, updated_block)
     VALUES ($1, $2, $2)
     ON CONFLICT (asset_id) DO NOTHING`,
    [assetId, blockHeight],
  );
}

// ========================================================================
// Event handlers
// ========================================================================

async function handleAssetCreated(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  const owner = asStr(getField(data, "owner"));

  await query(
    `INSERT INTO assets (asset_id, owner, admin, issuer, freezer, created_block, updated_block)
     VALUES ($1, $2, $2, $2, $2, $3, $3)
     ON CONFLICT (asset_id) DO UPDATE SET
       owner = COALESCE(NULLIF($2, ''), assets.owner),
       admin = COALESCE(NULLIF($2, ''), assets.admin),
       issuer = COALESCE(NULLIF($2, ''), assets.issuer),
       freezer = COALESCE(NULLIF($2, ''), assets.freezer),
       updated_block = $3,
       updated_at = NOW()`,
    [assetId, owner, ctx.blockHeight],
  );
}

async function handleMetadataSet(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  const name = decodeHexString(getField(data, "name"));
  const symbol = decodeHexString(getField(data, "symbol"));
  const decimals = asInt(getField(data, "decimals"));
  const isFrozen = Boolean(getField(data, "is_frozen"));

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `UPDATE assets SET
       name = $2, symbol = $3, decimals = $4, is_frozen = $5,
       updated_block = $6, updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId, name, symbol, decimals, isFrozen, ctx.blockHeight],
  );
}

async function handleMetadataCleared(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `UPDATE assets SET
       name = NULL, symbol = NULL, decimals = 0,
       updated_block = $2, updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId, ctx.blockHeight],
  );
}

async function handleIssued(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  // Issued events use "amount" or "total_supply"
  const amount = asStr(getField(data, "amount") ?? getField(data, "total_supply") ?? "0");

  await ensureAsset(assetId, ctx.blockHeight);

  // Add to supply using numeric cast
  await query(
    `UPDATE assets SET
       supply = (CAST(supply AS NUMERIC) + CAST($2 AS NUMERIC))::TEXT,
       updated_block = $3, updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId, amount, ctx.blockHeight],
  );
}

async function handleBurned(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  const balance = asStr(getField(data, "balance") ?? getField(data, "amount") ?? "0");

  await ensureAsset(assetId, ctx.blockHeight);

  // Subtract from supply, floor at 0
  await query(
    `UPDATE assets SET
       supply = GREATEST(0, CAST(supply AS NUMERIC) - CAST($2 AS NUMERIC))::TEXT,
       updated_block = $3, updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId, balance, ctx.blockHeight],
  );
}

async function handleTransferred(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  const from = asStr(getField(data, "from"));
  const to = asStr(getField(data, "to"));
  const amount = asStr(getField(data, "amount") ?? "0");

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `INSERT INTO asset_transfers (asset_id, block_height, extrinsic_id, from_address, to_address, amount)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [assetId, ctx.blockHeight, event.extrinsicId ?? null, from, to, amount],
  );
}

async function handleStatusChanged(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));

  await ensureAsset(assetId, ctx.blockHeight);

  // AssetStatusChanged doesn't carry a new status value — just mark updated
  await query(
    `UPDATE assets SET updated_block = $2, updated_at = NOW() WHERE asset_id = $1`,
    [assetId, ctx.blockHeight],
  );
}

async function handleFreezeState(
  ctx: BlockContext,
  event: ExplorerEvent,
  frozen: boolean,
): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `UPDATE assets SET is_frozen = $2, updated_block = $3, updated_at = NOW() WHERE asset_id = $1`,
    [assetId, frozen, ctx.blockHeight],
  );
}

async function handleOwnerChanged(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  const owner = asStr(getField(data, "owner"));

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `UPDATE assets SET owner = $2, updated_block = $3, updated_at = NOW() WHERE asset_id = $1`,
    [assetId, owner, ctx.blockHeight],
  );
}

async function handleTeamChanged(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));
  const admin = asStr(getField(data, "admin") ?? "");
  const issuer = asStr(getField(data, "issuer") ?? "");
  const freezer = asStr(getField(data, "freezer") ?? "");

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `UPDATE assets SET
       admin = COALESCE(NULLIF($2, ''), admin),
       issuer = COALESCE(NULLIF($3, ''), issuer),
       freezer = COALESCE(NULLIF($4, ''), freezer),
       updated_block = $5, updated_at = NOW()
     WHERE asset_id = $1`,
    [assetId, admin, issuer, freezer, ctx.blockHeight],
  );
}

async function handleDestroyed(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const assetId = asInt(getField(data, "asset_id"));

  await ensureAsset(assetId, ctx.blockHeight);

  await query(
    `UPDATE assets SET status = 'destroyed', supply = '0', updated_block = $2, updated_at = NOW() WHERE asset_id = $1`,
    [assetId, ctx.blockHeight],
  );
}
