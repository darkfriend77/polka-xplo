import type { BlockContext, ExplorerEvent } from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * XCM Extension — Event Handler
 *
 * Processes XCM-related events from multiple pallets to build a unified
 * view of cross-chain messages, transfers, and channels.
 *
 * Key pallets:
 *   - PolkadotXcm    — outbound sends (Sent, Attempted, FeesPaid)
 *   - XcmpQueue      — outbound HRMP message hashes
 *   - MessageQueue   — inbound message processing
 *   - ParachainSystem — UMP/DMP counters
 *   - DmpQueue       — legacy DMP execution
 *   - CumulusXcm     — legacy DMP execution
 *
 * Strategy: Each event is processed individually. For outbound messages we
 * correlate PolkadotXcm.Sent (rich data) with XcmpQueue.XcmpMessageSent
 * (message_hash) via the same extrinsic. For inbound, we correlate
 * MessageQueue.Processed with sibling Assets.Issued / Balances.Deposit
 * events in the same block to extract transfer amounts.
 */

// ============================================================
// Public API
// ============================================================

export async function onEvent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const key = `${event.module}.${event.event}`;

  switch (key) {
    // ---- Outbound ----
    case "PolkadotXcm.Sent":
      await handlePolkadotXcmSent(ctx, event);
      break;
    case "XcmpQueue.XcmpMessageSent":
      await handleXcmpQueueMessageSent(ctx, event);
      break;
    case "XTokens.TransferredAssets":
      await handleXTokensTransferred(ctx, event);
      break;
    case "ParachainSystem.UpwardMessageSent":
      await handleUpwardMessageSent(ctx, event);
      break;

    // ---- Inbound ----
    case "MessageQueue.Processed":
      await handleMessageQueueProcessed(ctx, event);
      break;
    case "ParachainSystem.DownwardMessagesReceived":
      // informational — counted events only, no additional extraction needed
      break;
    case "ParachainSystem.DownwardMessagesProcessed":
      // informational
      break;
    case "DmpQueue.ExecutedDownward":
      await handleDmpExecuted(ctx, event);
      break;
    case "CumulusXcm.ExecutedDownward":
      await handleDmpExecuted(ctx, event);
      break;

    // ---- Metadata ----
    case "PolkadotXcm.Attempted":
      // Handled inline in Sent when same extrinsic. Standalone = no-op.
      break;
    case "PolkadotXcm.FeesPaid":
      // Fees info — can be correlated later if needed
      break;
    case "PolkadotXcm.AssetsTrapped":
      // Trapped assets — log for debugging, not a transfer
      break;
    case "PolkadotXcm.SupportedVersionChanged":
    case "PolkadotXcm.VersionNotifyRequested":
    case "PolkadotXcm.VersionNotifyStarted":
      // Version negotiation — informational
      break;
    default:
      break;
  }
}

export function getMigrationSQL(): string {
  const migrationPath = path.resolve(__dirname, "..", "..", "migrations", "001_xcm.sql");
  return fs.readFileSync(migrationPath, "utf-8");
}

// ============================================================
// Outbound Handlers
// ============================================================

/**
 * PolkadotXcm.Sent — the richest outbound event.
 * Contains origin multilocation, destination multilocation, raw XCM program,
 * and a unique message_id.
 *
 * Data shape: { origin, destination, message, message_id }
 */
async function handlePolkadotXcmSent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;

  const messageId = asStr(data.message_id);
  const rawMessage = asStr(data.message);
  const origin = data.origin as Record<string, unknown> | undefined;
  const destination = data.destination as Record<string, unknown> | undefined;

  // Decode sender from origin multilocation
  const sender = extractAccountFromMultilocation(origin);

  // Decode destination para ID from destination multilocation
  const destParaId = extractParaIdFromMultilocation(destination);

  // Determine protocol: if dest is relay (destParaId=null && destination.parents=1 && interior=Here)
  // that's UMP. Otherwise it's HRMP (sent to a sibling parachain via relay).
  const protocol = destParaId === null ? "UMP" : "HRMP";

  // Insert the message
  const msgResult = await query(
    `INSERT INTO xcm_messages
       (message_hash, message_id, direction, protocol, origin_para_id, dest_para_id,
        sender, success, block_height, extrinsic_id, raw_message)
     VALUES ($1, $2, 'outbound', $3, NULL, $4, $5, true, $6, $7, $8)
     ON CONFLICT (message_hash, block_height, direction) DO UPDATE SET
       message_id = COALESCE(EXCLUDED.message_id, xcm_messages.message_id),
       sender = COALESCE(EXCLUDED.sender, xcm_messages.sender),
       dest_para_id = COALESCE(EXCLUDED.dest_para_id, xcm_messages.dest_para_id),
       raw_message = COALESCE(EXCLUDED.raw_message, xcm_messages.raw_message)
     RETURNING id`,
    [messageId, messageId, protocol, destParaId, sender, ctx.blockHeight, event.extrinsicId, rawMessage],
  );

  const xcmMsgId = (msgResult.rows[0] as { id: number } | undefined)?.id;

  // Upsert channel stats
  if (destParaId !== null) {
    await upsertChannel(null, destParaId, ctx.blockHeight);
  }

  // Try to extract transfer details from sibling events in the same extrinsic.
  // For outbound transfers, look for Assets.Burned or Balances.Withdraw in the same extrinsic.
  if (xcmMsgId && event.extrinsicId) {
    await extractOutboundTransfers(ctx, event, xcmMsgId, destParaId, sender);
  }
}

/**
 * XTokens.TransferredAssets — emitted by the ORML XTokens pallet.
 * This is the PRIMARY outbound transfer event on chains that use XTokens
 * (like Ajuna). Contains sender, destination multilocation (with parachain +
 * recipient), and encoded assets. The corresponding XcmpQueue.XcmpMessageSent
 * event only has the message_hash.
 *
 * Data shape: { sender, assets (hex-encoded), fee: { id, fun: { Fungible } }, dest }
 */
async function handleXTokensTransferred(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;

  const sender = asStr(data.sender);
  const dest = data.dest as Record<string, unknown> | undefined;

  // Extract destination para ID and recipient from dest multilocation
  const destParaId = extractParaIdFromMultilocation(dest);
  const recipient = extractAccountFromMultilocation(dest);
  const protocol = destParaId === null ? "UMP" : "HRMP";

  // Find the matching XcmpQueue.XcmpMessageSent in the same extrinsic for the message_hash
  let messageHash = "";
  if (event.extrinsicId) {
    const hashResult = await query(
      `SELECT data->>'message_hash' as hash FROM events
       WHERE extrinsic_id = $1 AND block_height = $2
       AND module = 'XcmpQueue' AND event = 'XcmpMessageSent'
       LIMIT 1`,
      [event.extrinsicId, ctx.blockHeight],
    );
    if (hashResult.rows.length > 0) {
      messageHash = String(hashResult.rows[0].hash ?? "");
    }
  }

  if (!messageHash) {
    // Generate a synthetic hash from the block + index as fallback
    messageHash = `xtokens-${ctx.blockHeight}-${event.index}`;
  }

  // Upsert xcm_message — enriches existing XcmpQueue row or creates new one
  const msgResult = await query(
    `INSERT INTO xcm_messages
       (message_hash, direction, protocol, origin_para_id, dest_para_id,
        sender, success, block_height, extrinsic_id)
     VALUES ($1, 'outbound', $2, NULL, $3, $4, true, $5, $6)
     ON CONFLICT (message_hash, block_height, direction) DO UPDATE SET
       sender = COALESCE(EXCLUDED.sender, xcm_messages.sender),
       dest_para_id = COALESCE(EXCLUDED.dest_para_id, xcm_messages.dest_para_id),
       protocol = COALESCE(EXCLUDED.protocol, xcm_messages.protocol)
     RETURNING id`,
    [messageHash, protocol, destParaId, sender, ctx.blockHeight, event.extrinsicId],
  );

  const xcmMsgId = (msgResult.rows[0] as { id: number } | undefined)?.id;

  // Upsert channel stats
  if (destParaId !== null) {
    await upsertChannel(null, destParaId, ctx.blockHeight);
  }

  // Extract the transfer amount from sibling Balances.Transfer event
  // (XTokens transfers the tokens to the sovereign account before sending XCM)
  if (xcmMsgId && event.extrinsicId) {
    await extractXTokensTransfer(ctx, event, xcmMsgId, destParaId, sender, recipient);
  }
}

/**
 * Extract transfer details from an XTokens extrinsic.
 * Looks for Balances.Transfer (to sovereign/holding account) in the same extrinsic.
 */
async function extractXTokensTransfer(
  ctx: BlockContext,
  event: ExplorerEvent,
  xcmMsgId: number,
  destParaId: number | null,
  sender: string,
  recipient: string,
): Promise<void> {
  if (!event.extrinsicId) return;

  const siblings = await query(
    `SELECT module, event, data FROM events
     WHERE extrinsic_id = $1 AND block_height = $2
     ORDER BY index ASC`,
    [event.extrinsicId, ctx.blockHeight],
  );

  for (const row of siblings.rows) {
    const mod = String(row.module);
    const evt = String(row.event);
    const d = row.data as Record<string, unknown>;

    // Balances.Transfer to sovereign account = the actual cross-chain transfer amount
    if (mod === "Balances" && evt === "Transfer") {
      const from = asStr(d.from);
      const amount = asStr(d.amount ?? "0");

      // Verify this is from the sender (not a fee refund or unrelated)
      if (from === sender && BigInt(amount) > 0n) {
        const symbol = await resolveNativeSymbol();
        await insertTransfer(
          xcmMsgId, "outbound", null, destParaId,
          sender, recipient, "native", symbol, amount,
          ctx.blockHeight, event.extrinsicId,
        );
        return; // Take the first matching transfer
      }
    }

    // Assets.Transferred for non-native tokens going cross-chain
    if (mod === "Assets" && (evt === "Transferred" || evt === "Burned")) {
      const assetId = String(d.asset_id ?? "");
      const amount = asStr(d.balance ?? d.amount ?? "0");
      const owner = asStr(d.owner ?? d.from ?? "");

      if ((owner === sender || !sender) && BigInt(amount) > 0n) {
        const symbol = await resolveAssetSymbol(assetId);
        await insertTransfer(
          xcmMsgId, "outbound", null, destParaId,
          sender, recipient, assetId, symbol, amount,
          ctx.blockHeight, event.extrinsicId,
        );
        return;
      }
    }
  }
}

/**
 * Resolve the native token symbol from chain config or well-known defaults.
 */
async function resolveNativeSymbol(): Promise<string> {
  // The native token is not in the assets table (that tracks foreign assets).
  // Read from chain-config.json if available, otherwise use fallback.
  try {
    const configPath = path.resolve(__dirname, "..", "..", "..", "chain-config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.token) return String(config.token);
  } catch {
    // chain-config.json may not exist in this context
  }
  return "AJUN";
}

/**
 * XcmpQueue.XcmpMessageSent — emitted for every HRMP message sent.
 * Data: { message_hash }
 * Often paired with PolkadotXcm.Sent or XTokens.TransferredAssets in the same
 * extrinsic, but also fires for system-level XCM (version negotiation etc.)
 */
async function handleXcmpQueueMessageSent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const messageHash = asStr(data.message_hash);

  if (!messageHash) return;

  // Only insert if we don't already have this from PolkadotXcm.Sent
  await query(
    `INSERT INTO xcm_messages
       (message_hash, direction, protocol, block_height, extrinsic_id, success)
     VALUES ($1, 'outbound', 'HRMP', $2, $3, true)
     ON CONFLICT (message_hash, block_height, direction) DO NOTHING`,
    [messageHash, ctx.blockHeight, event.extrinsicId],
  );
}

/**
 * ParachainSystem.UpwardMessageSent — UMP message sent to relay chain.
 * Data: { message_hash: { Some: "0x..." } } (older format) or { message_hash: "0x..." }
 */
async function handleUpwardMessageSent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  let messageHash = "";

  const raw = data.message_hash;
  if (typeof raw === "string") {
    messageHash = raw;
  } else if (raw && typeof raw === "object" && "Some" in (raw as Record<string, unknown>)) {
    messageHash = asStr((raw as Record<string, unknown>).Some);
  }

  if (!messageHash) return;

  await query(
    `INSERT INTO xcm_messages
       (message_hash, direction, protocol, dest_para_id, block_height, extrinsic_id, success)
     VALUES ($1, 'outbound', 'UMP', NULL, $2, $3, true)
     ON CONFLICT (message_hash, block_height, direction) DO NOTHING`,
    [messageHash, ctx.blockHeight, event.extrinsicId],
  );
}

// ============================================================
// Inbound Handlers
// ============================================================

/**
 * MessageQueue.Processed — inbound XCM message processed.
 * Data: { id, origin, success, weight_used }
 *   origin: "Parent" (DMP from relay) | { Sibling: <paraId> } (HRMP)
 */
async function handleMessageQueueProcessed(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const messageId = asStr(data.id);
  const success = data.success === true;

  // Parse origin
  let protocol: "DMP" | "HRMP" = "DMP";
  let originParaId: number | null = null;

  const origin = data.origin;
  if (origin === "Parent") {
    protocol = "DMP";
    originParaId = null;
  } else if (origin && typeof origin === "object") {
    const obj = origin as Record<string, unknown>;
    if (obj.Sibling != null) {
      protocol = "HRMP";
      originParaId = Number(obj.Sibling);
    }
  }

  const msgResult = await query(
    `INSERT INTO xcm_messages
       (message_hash, message_id, direction, protocol, origin_para_id, dest_para_id,
        success, block_height, extrinsic_id)
     VALUES ($1, $1, 'inbound', $2, $3, NULL, $4, $5, $6)
     ON CONFLICT (message_hash, block_height, direction) DO UPDATE SET
       success = EXCLUDED.success,
       origin_para_id = COALESCE(EXCLUDED.origin_para_id, xcm_messages.origin_para_id)
     RETURNING id`,
    [messageId, protocol, originParaId, success, ctx.blockHeight, event.extrinsicId],
  );

  const xcmMsgId = (msgResult.rows[0] as { id: number } | undefined)?.id;

  // Upsert channel stats
  if (originParaId !== null) {
    await upsertChannel(originParaId, null, ctx.blockHeight);
  }

  // Extract inbound transfers by looking at Assets.Issued / Balances.Deposit
  // events in the same block with no extrinsic_id (they are inherent to message execution)
  if (xcmMsgId && success) {
    await extractInboundTransfers(ctx, event, xcmMsgId, originParaId);
  }
}

/**
 * DmpQueue.ExecutedDownward / CumulusXcm.ExecutedDownward — legacy DMP processing.
 * Data: { message_id, outcome } or { message_hash, outcome }
 */
async function handleDmpExecuted(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const messageId = asStr(data.message_id ?? data.message_hash ?? "");
  const outcome = data.outcome;
  const success = outcome != null
    ? typeof outcome === "string"
      ? outcome === "Complete"
      : typeof outcome === "object" && outcome !== null && "Complete" in (outcome as Record<string, unknown>)
    : true;

  if (!messageId) return;

  await query(
    `INSERT INTO xcm_messages
       (message_hash, message_id, direction, protocol, origin_para_id,
        success, block_height, extrinsic_id)
     VALUES ($1, $1, 'inbound', 'DMP', NULL, $2, $3, $4)
     ON CONFLICT (message_hash, block_height, direction) DO UPDATE SET
       success = EXCLUDED.success`,
    [messageId, success, ctx.blockHeight, event.extrinsicId],
  );
}

// ============================================================
// Transfer Extraction
// ============================================================

/**
 * For an outbound XCM send, look at sibling events (same extrinsic) to
 * find Assets.Burned / Balances.Withdraw which indicate the transferred value.
 */
async function extractOutboundTransfers(
  ctx: BlockContext,
  event: ExplorerEvent,
  xcmMsgId: number,
  destParaId: number | null,
  sender: string,
): Promise<void> {
  if (!event.extrinsicId) return;

  // Query sibling events in the same extrinsic
  const siblings = await query(
    `SELECT module, event, data FROM events
     WHERE extrinsic_id = $1 AND block_height = $2
     ORDER BY index ASC`,
    [event.extrinsicId, ctx.blockHeight],
  );

  // Identify the transaction fee amount so we can skip fee-related Withdrawals
  let feeAmount = "";
  for (const r of siblings.rows) {
    if (String(r.module) === "TransactionPayment" && String(r.event) === "TransactionFeePaid") {
      const fd = r.data as Record<string, unknown>;
      feeAmount = asStr(fd.actual_fee ?? "");
      break;
    }
  }

  // Also check for Balances.Rescinded — the rescinded amount is the XCM transfer,
  // while the fee Withdraw gets deposited to treasury.
  const rescindedAmounts = new Set<string>();
  for (const r of siblings.rows) {
    if (String(r.module) === "Balances" && String(r.event) === "Rescinded") {
      const rd = r.data as Record<string, unknown>;
      rescindedAmounts.add(asStr(rd.amount ?? ""));
    }
  }

  for (const row of siblings.rows) {
    const mod = String(row.module);
    const evt = String(row.event);
    const d = row.data as Record<string, unknown>;

    if (mod === "Assets" && evt === "Burned") {
      // Asset transfer: amount burned from sender's reserve
      const assetId = String(d.asset_id ?? "");
      const amount = asStr(d.balance ?? d.amount ?? "0");
      const symbol = await resolveAssetSymbol(assetId);

      await insertTransfer(
        xcmMsgId, "outbound", null, destParaId,
        sender, "", assetId, symbol, amount,
        ctx.blockHeight, event.extrinsicId,
      );
    } else if (mod === "Balances" && evt === "Withdraw") {
      // Native token withdrawn for XCM transfer.
      // We need to distinguish between fee withdrawals and transfer withdrawals.
      // Heuristic: if there's also an Assets.Burned in this extrinsic, the
      // Balances.Withdraw is likely the fee. If there's no Assets.Burned,
      // this is a native token transfer.
      const hasAssetBurned = siblings.rows.some(
        (r: Record<string, unknown>) => r.module === "Assets" && r.event === "Burned",
      );

      if (!hasAssetBurned) {
        const amount = asStr(d.amount ?? "0");
        const who = asStr(d.who ?? "");

        // Skip the fee withdrawal — it matches TransactionFeePaid.actual_fee
        if (amount === feeAmount) continue;

        // Only count withdrawals that have a matching Rescinded event
        // (XCM transfers burn/rescind tokens; fees are deposited to treasury)
        if (rescindedAmounts.size > 0 && !rescindedAmounts.has(amount)) continue;

        if (who === sender || !sender) {
          const symbol = await resolveNativeSymbol();
          await insertTransfer(
            xcmMsgId, "outbound", null, destParaId,
            who, "", "native", symbol, amount,
            ctx.blockHeight, event.extrinsicId,
          );
        }
      }
    }
  }
}

/**
 * For an inbound XCM message, look at sibling events in the same block
 * (with no extrinsic_id, since they're inherent to message execution)
 * to find Assets.Issued / Balances.Deposit which indicate received value.
 */
async function extractInboundTransfers(
  ctx: BlockContext,
  event: ExplorerEvent,
  xcmMsgId: number,
  originParaId: number | null,
): Promise<void> {
  // Inbound XCM events have no extrinsic_id — they fire as inherents.
  // Look for Assets.Issued events adjacent to this MessageQueue.Processed
  // (same block, ordered by index, appearing just before this event).
  const siblings = await query(
    `SELECT module, event, data, index FROM events
     WHERE block_height = $1
       AND extrinsic_id IS NULL
       AND index < $2
       AND module IN ('Assets', 'Balances')
       AND event IN ('Issued', 'Deposit')
     ORDER BY index ASC`,
    [ctx.blockHeight, event.index],
  );

  for (const row of siblings.rows) {
    const mod = String(row.module);
    const evt = String(row.event);
    const d = row.data as Record<string, unknown>;

    if (mod === "Assets" && evt === "Issued") {
      const assetId = String(d.asset_id ?? "");
      const amount = asStr(d.amount ?? "0");
      const owner = asStr(d.owner ?? "");
      const symbol = await resolveAssetSymbol(assetId);

      await insertTransfer(
        xcmMsgId, "inbound", originParaId, null,
        "", owner, assetId, symbol, amount,
        ctx.blockHeight, null,
      );
    } else if (mod === "Balances" && evt === "Deposit") {
      const amount = asStr(d.amount ?? "0");
      const who = asStr(d.who ?? "");

      // Skip tiny deposits that are likely fee refunds
      if (BigInt(amount) > 0n) {
        const symbol = await resolveNativeSymbol();
        await insertTransfer(
          xcmMsgId, "inbound", originParaId, null,
          "", who, "native", symbol, amount,
          ctx.blockHeight, null,
        );
      }
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function asStr(v: unknown): string {
  return v != null ? String(v) : "";
}

/**
 * Resolve a junction value (which may be an array of objects, a single object,
 * or a concatenated hex string) into an array of individual junction values
 * that can be passed to parseJunctionParaId / parseJunctionAccount.
 *
 * Handles:
 *   - Array of objects: [{ Parachain: 2034 }, { AccountId32: { id: "0x..." } }]
 *   - Single hex string: "0x00c91f0100d89ea70e..." (concatenated SCALE junctions)
 *   - Single object: { Parachain: 1000 }
 */
function resolveJunctions(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;

  // Concatenated hex string — split into individual junctions
  if (typeof val === "string" && val.startsWith("0x")) {
    return splitHexJunctions(val.slice(2));
  }

  // Single junction object
  if (typeof val === "object" && val !== null) return [val];

  return [];
}

/**
 * Split a concatenated hex string of SCALE-encoded XCM junctions into
 * individual junction hex strings (each prefixed with "0x").
 *
 * Junction types and their byte lengths:
 *   0x00 Parachain      — 1 (type) + variable (SCALE compact u32)
 *   0x01 AccountId32    — 1 (type) + variable (Option<NetworkId>) + 32 (account)
 *   0x02 AccountIndex64 — 1 (type) + variable (Option<NetworkId>) + 8 (index)
 *   0x03 AccountKey20   — 1 (type) + variable (Option<NetworkId>) + 20 (key)
 *   0x04 PalletInstance — 1 (type) + 1 (index) = 2
 *   0x05 GeneralIndex   — 1 (type) + variable (SCALE compact u128)
 *   0x06 GeneralKey     — 1 (type) + 1 (length) + 32 (data) = 34
 *   0x07 OnlyChild      — 1 (type) = 1
 *   0x08 GlobalConsensus — variable (network enum)
 */
function splitHexJunctions(hex: string): string[] {
  const junctions: string[] = [];
  let pos = 0;

  while (pos < hex.length) {
    const typeByte = parseInt(hex.slice(pos, pos + 2), 16);
    let byteLen = 0;

    switch (typeByte) {
      case 0x00: { // Parachain — type(1) + compact u32
        const compactBytes = scaleCompactLen(hex, pos + 2);
        byteLen = 1 + compactBytes;
        break;
      }
      case 0x01: // AccountId32 — type(1) + Option<NetworkId> + 32 bytes
        byteLen = 1 + networkFieldLen(hex, pos + 2) + 32;
        break;
      case 0x02: // AccountIndex64 — type(1) + Option<NetworkId> + 8 bytes
        byteLen = 1 + networkFieldLen(hex, pos + 2) + 8;
        break;
      case 0x03: // AccountKey20 — type(1) + Option<NetworkId> + 20 bytes
        byteLen = 1 + networkFieldLen(hex, pos + 2) + 20;
        break;
      case 0x04: // PalletInstance — type(1) + 1 byte
        byteLen = 2;
        break;
      case 0x05: { // GeneralIndex — type(1) + compact u128
        const compactBytes = scaleCompactLen(hex, pos + 2);
        byteLen = 1 + compactBytes;
        break;
      }
      case 0x06: // GeneralKey — type(1) + length(1) + 32 bytes data
        byteLen = 34;
        break;
      case 0x07: // OnlyChild — type(1)
        byteLen = 1;
        break;
      default:
        // Unknown, emit the rest as one blob
        junctions.push("0x" + hex.slice(pos));
        return junctions;
    }

    const hexLen = byteLen * 2;
    if (pos + hexLen > hex.length) {
      // Not enough data, emit remainder
      junctions.push("0x" + hex.slice(pos));
      return junctions;
    }

    junctions.push("0x" + hex.slice(pos, pos + hexLen));
    pos += hexLen;
  }

  return junctions;
}

/**
 * Determine the byte-length of an `Option<NetworkId>` field in a SCALE-encoded
 * XCM junction, starting at the given hex position.
 *
 * XCM v3 network: Option<NetworkId>
 *   0x00 = None → 1 byte
 *   0x01 = Some → 1 byte + NetworkId variant:
 *     0x00 ByGenesis(32-byte hash) → 1 + 32 = 33
 *     0x01 ByFork(u64, u32) → 1 + 12 = 13
 *     0x02..0x06 Polkadot/Kusama/Westend/Rococo/Wococo → 1
 *     0x07 Ethereum { chain_id: u64 } → 1 + 8 = 9
 *     0x08..0x09 BitcoinCore/BitcoinCash → 1
 *     0x0a PolkadotBulletin → 1
 */
function networkFieldLen(hex: string, hexPos: number): number {
  if (hexPos + 2 > hex.length) return 1;
  const optionByte = parseInt(hex.slice(hexPos, hexPos + 2), 16);
  if (optionByte === 0x00) return 1; // None

  // Some: 1 byte (0x01) + NetworkId enum variant
  if (hexPos + 4 > hex.length) return 1;
  const variantByte = parseInt(hex.slice(hexPos + 2, hexPos + 4), 16);
  switch (variantByte) {
    case 0x00: return 2 + 32; // ByGenesis(32-byte hash)
    case 0x01: return 2 + 12; // ByFork(u64 + u32)
    case 0x07: return 2 + 8;  // Ethereum { chain_id: u64 }
    default:   return 2;      // Polkadot, Kusama, Westend, etc.
  }
}

/**
 * Determine the byte-length of a SCALE compact-encoded integer starting
 * at a given hex position.
 */
function scaleCompactLen(hex: string, hexPos: number): number {
  if (hexPos + 2 > hex.length) return 1;
  const firstByte = parseInt(hex.slice(hexPos, hexPos + 2), 16);
  const mode = firstByte & 0x03;
  switch (mode) {
    case 0: return 1;
    case 1: return 2;
    case 2: return 4;
    case 3: {
      // Big integer mode: upper 6 bits = number of additional bytes - 4
      const extra = firstByte >> 2;
      return 1 + extra + 4;
    }
    default: return 1;
  }
}

/**
 * Extract an AccountId32 from an XCM multilocation.
 * Looks for X1 interior with AccountId32 junction.
 *
 * Common shapes:
 *   { parents: 0, interior: { X1: "0x010103<accountId32>" } }
 *   { parents: 0, interior: "Here" }
 *   { parents: 0, interior: { X1: { AccountId32: { id: "0x..." } } } }
 */
function extractAccountFromMultilocation(loc: Record<string, unknown> | undefined): string {
  if (!loc) return "";

  const interior = loc.interior;
  if (!interior || interior === "Here") return "";

  // V3/V4 format: interior is { X1: junction } or { X1: [junction] }
  if (typeof interior === "object" && interior !== null) {
    const obj = interior as Record<string, unknown>;

    // Try X1
    const x1 = obj.X1;
    if (x1) {
      return parseJunctionAccount(x1);
    }

    // Try X2 — first junction might be Parachain, second AccountId32
    const x2 = obj.X2;
    if (x2) {
      const junctions = resolveJunctions(x2);
      for (const j of junctions) {
        const acc = parseJunctionAccount(j);
        if (acc) return acc;
      }
    }

    // Try X3
    const x3 = obj.X3;
    if (x3) {
      const junctions = resolveJunctions(x3);
      for (const j of junctions) {
        const acc = parseJunctionAccount(j);
        if (acc) return acc;
      }
    }
  }

  return "";
}

/**
 * Parse a single XCM junction for an AccountId32.
 * Handles both decoded JSON and compact hex forms.
 */
function parseJunctionAccount(junction: unknown): string {
  if (!junction) return "";

  // Decoded form: { AccountId32: { id: "0x...", network: ... } }
  if (typeof junction === "object" && junction !== null) {
    const obj = junction as Record<string, unknown>;
    if (obj.AccountId32 && typeof obj.AccountId32 === "object") {
      const acc = obj.AccountId32 as Record<string, unknown>;
      return asStr(acc.id ?? acc.Id ?? "");
    }
  }

  // Compact hex: "0x01<Option<NetworkId>><32-byte AccountId32>"
  // Junction type 0x01 = AccountId32, followed by variable-length network + 32 bytes.
  // In XCM v3, network is Option<NetworkId>:
  //   0x00 = None (1 byte)
  //   0x01 = Some, followed by a NetworkId enum variant (1+ bytes)
  // The account is always the LAST 32 bytes (64 hex chars).
  if (typeof junction === "string" && junction.startsWith("0x")) {
    const hex = junction.slice(2);
    if (hex.startsWith("01") && hex.length >= 68) {
      const accountHex = hex.slice(-64);
      return "0x" + accountHex;
    }
  }

  return "";
}

/**
 * Extract parachain ID from a destination multilocation.
 *
 * Common shapes:
 *   { parents: 1, interior: "Here" }                         → relay (null)
 *   { parents: 1, interior: { X1: { Parachain: 1000 } } }   → 1000
 *   { parents: 1, interior: { X1: "0x00a10f" } }            → decode compact
 */
function extractParaIdFromMultilocation(loc: Record<string, unknown> | undefined): number | null {
  if (!loc) return null;

  const interior = loc.interior;
  if (!interior || interior === "Here") return null;

  if (typeof interior === "object" && interior !== null) {
    const obj = interior as Record<string, unknown>;

    // X1 junction
    const x1 = obj.X1;
    if (x1) {
      return parseJunctionParaId(x1);
    }

    // X2 — first is usually Parachain
    const x2 = obj.X2;
    if (x2) {
      const junctions = resolveJunctions(x2);
      for (const j of junctions) {
        const pid = parseJunctionParaId(j);
        if (pid !== null) return pid;
      }
    }

    // X3
    const x3 = obj.X3;
    if (x3) {
      const junctions = resolveJunctions(x3);
      for (const j of junctions) {
        const pid = parseJunctionParaId(j);
        if (pid !== null) return pid;
      }
    }
  }

  return null;
}

/**
 * Parse a single junction for a Parachain ID.
 */
function parseJunctionParaId(junction: unknown): number | null {
  if (!junction) return null;

  // Decoded form: { Parachain: 1000 }
  if (typeof junction === "object" && junction !== null) {
    const obj = junction as Record<string, unknown>;
    if (obj.Parachain != null) {
      return Number(obj.Parachain);
    }
  }

  // Compact hex: "0x00<compact SCALE paraId>"
  // Junction type 0x00 = Parachain
  if (typeof junction === "string" && junction.startsWith("0x")) {
    const hex = junction.slice(2);
    if (hex.startsWith("00")) {
      // SCALE compact u32 follows the 00 type byte
      return decodeCompactU32(hex.slice(2));
    }
  }

  return null;
}

/**
 * Decode a SCALE compact-encoded u32 from a hex string.
 * Compact encoding:
 *   - Single byte mode (0..63):     value << 2 | 0b00
 *   - Two byte mode (64..16383):    value << 2 | 0b01
 *   - Four byte mode:               value << 2 | 0b10
 */
function decodeCompactU32(hex: string): number | null {
  if (hex.length < 2) return null;
  const firstByte = parseInt(hex.slice(0, 2), 16);
  const mode = firstByte & 0x03;

  switch (mode) {
    case 0: // single byte
      return firstByte >> 2;
    case 1: { // two bytes
      if (hex.length < 4) return null;
      const val = parseInt(hex.slice(2, 4) + hex.slice(0, 2), 16); // little-endian
      return val >> 2;
    }
    case 2: { // four bytes
      if (hex.length < 8) return null;
      const bytes = hex.slice(0, 8);
      // Convert from little-endian
      const le = bytes.match(/.{2}/g)!.reverse().join("");
      const val = parseInt(le, 16);
      return val >> 2;
    }
    default:
      return null;
  }
}

/**
 * Resolve a local asset ID to its human-readable symbol.
 * Queries the `assets` table from ext-assets extension.
 */
async function resolveAssetSymbol(assetId: string): Promise<string> {
  if (!assetId || assetId === "native") return "";

  try {
    const result = await query(
      `SELECT symbol FROM assets WHERE asset_id = $1`,
      [Number(assetId)],
    );
    if (result.rows.length > 0 && result.rows[0].symbol) {
      return String(result.rows[0].symbol);
    }
  } catch {
    // assets table may not exist if ext-assets isn't loaded
  }

  return "";
}

/**
 * Insert a transfer record.
 */
async function insertTransfer(
  xcmMsgId: number,
  direction: string,
  fromChainId: number | null,
  toChainId: number | null,
  fromAddress: string,
  toAddress: string,
  assetId: string,
  assetSymbol: string,
  amount: string,
  blockHeight: number,
  extrinsicId: string | null,
): Promise<void> {
  await query(
    `INSERT INTO xcm_transfers
       (xcm_message_id, direction, from_chain_id, to_chain_id,
        from_address, to_address, asset_id, asset_symbol,
        amount, block_height, extrinsic_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [xcmMsgId, direction, fromChainId, toChainId,
     fromAddress, toAddress, assetId, assetSymbol,
     amount, blockHeight, extrinsicId],
  );

  // Update channel transfer count
  if (fromChainId !== null || toChainId !== null) {
    const from = fromChainId ?? 0; // 0 = relay
    const to = toChainId ?? 0;
    await query(
      `UPDATE xcm_channels SET transfer_count = transfer_count + 1, updated_at = NOW()
       WHERE from_para_id = $1 AND to_para_id = $2`,
      [from, to],
    );
  }
}

/**
 * Upsert an XCM channel entry. The "self" para ID is derived from context
 * (we are indexing ourselves, so inbound origin = them, outbound dest = them).
 *
 * @param originParaId  - source para for inbound messages (null = relay)
 * @param destParaId    - dest para for outbound messages (null = relay)
 */
async function upsertChannel(
  originParaId: number | null,
  destParaId: number | null,
  blockHeight: number,
): Promise<void> {
  // We don't know our own para ID here, but we can figure direction:
  // - inbound: from originParaId → to "self" (we use 0 as placeholder for self)
  // - outbound: from "self" (0) → to destParaId
  // The API layer will substitute actual para IDs.
  const fromPara = originParaId ?? 0;
  const toPara = destParaId ?? 0;

  await query(
    `INSERT INTO xcm_channels (from_para_id, to_para_id, first_seen_block, last_seen_block, message_count)
     VALUES ($1, $2, $3, $3, 1)
     ON CONFLICT (from_para_id, to_para_id) DO UPDATE SET
       message_count = xcm_channels.message_count + 1,
       last_seen_block = GREATEST(xcm_channels.last_seen_block, $3),
       updated_at = NOW()`,
    [fromPara, toPara, blockHeight],
  );
}
