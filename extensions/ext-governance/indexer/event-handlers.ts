import type { BlockContext, ExplorerEvent, Extrinsic } from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Allowed governance table names — prevents SQL injection from string interpolation */
type GovMotionTable = "gov_council_motions" | "gov_techcomm_proposals";
type GovVoteTable = "gov_council_votes" | "gov_techcomm_votes";

/**
 * Governance Extension — Event Handler
 *
 * Processes events from Democracy, Council, TechnicalCommittee,
 * and Preimage pallets into dedicated governance tables.
 */
export async function onEvent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const key = `${event.module}.${event.event}`;

  switch (key) {
    // ---- Democracy ----
    case "Democracy.Proposed":
      await handleDemocracyProposed(ctx, event);
      break;
    case "Democracy.Tabled":
      await handleDemocracyTabled(ctx, event);
      break;
    case "Democracy.Started":
      await handleDemocracyStarted(ctx, event);
      break;
    case "Democracy.Passed":
      await handleDemocracyOutcome(ctx, event, "passed");
      break;
    case "Democracy.NotPassed":
      await handleDemocracyOutcome(ctx, event, "notpassed");
      break;
    case "Democracy.Voted":
      await handleDemocracyVoted(ctx, event);
      break;

    // ---- Council ----
    case "Council.Proposed":
      await handleCollectiveProposed(ctx, event, "gov_council_motions");
      break;
    case "Council.Voted":
      await handleCollectiveVoted(ctx, event, "gov_council_motions", "gov_council_votes");
      break;
    case "Council.Approved":
      await handleCollectiveStatusUpdate(event, "gov_council_motions", "approved");
      break;
    case "Council.Closed":
      await handleCollectiveClosed(event, "gov_council_motions");
      break;
    case "Council.Executed":
      await handleCollectiveStatusUpdate(event, "gov_council_motions", "executed");
      break;

    // ---- TechnicalCommittee ----
    case "TechnicalCommittee.Proposed":
      await handleCollectiveProposed(ctx, event, "gov_techcomm_proposals");
      break;
    case "TechnicalCommittee.Voted":
      await handleCollectiveVoted(ctx, event, "gov_techcomm_proposals", "gov_techcomm_votes");
      break;
    case "TechnicalCommittee.Approved":
      await handleCollectiveStatusUpdate(event, "gov_techcomm_proposals", "approved");
      break;
    case "TechnicalCommittee.Disapproved":
      await handleCollectiveStatusUpdate(event, "gov_techcomm_proposals", "disapproved");
      break;
    case "TechnicalCommittee.Closed":
      await handleCollectiveClosed(event, "gov_techcomm_proposals");
      break;
    case "TechnicalCommittee.Executed":
      await handleCollectiveStatusUpdate(event, "gov_techcomm_proposals", "executed");
      break;

    // ---- Preimage ----
    case "Preimage.Noted":
      await handlePreimage(ctx, event, "noted");
      break;
    case "Preimage.Requested":
      await handlePreimage(ctx, event, "requested");
      break;
    case "Preimage.Cleared":
      await handlePreimage(ctx, event, "cleared");
      break;
  }
}

export async function onExtrinsic(_ctx: BlockContext, _extrinsic: Extrinsic): Promise<void> {
  // Governance extrinsic tracking is handled via events for accuracy.
  // The extrinsic handler is reserved for future enrichment (e.g. decode call args).
}

/** Return the SQL for this extension's migrations */
export function getMigrationSQL(): string {
  // When compiled, __dirname = <ext>/dist/indexer, so go up two levels to ext root
  const extRoot = path.join(__dirname, "..", "..");
  const migrationPath = path.join(extRoot, "migrations", "001_governance.sql");
  return fs.readFileSync(migrationPath, "utf-8");
}

// ============================================================
// Democracy Handlers
// ============================================================

async function handleDemocracyProposed(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const proposalIndex = Number(event.data.proposal_index ?? 0);
  const deposit = String(event.data.deposit ?? "0");

  await query(
    `INSERT INTO gov_democracy_proposals (proposal_index, block_height, deposit, status)
     VALUES ($1, $2, $3, 'proposed')
     ON CONFLICT (proposal_index) DO UPDATE SET
       deposit = EXCLUDED.deposit,
       updated_at = NOW()`,
    [proposalIndex, ctx.blockHeight, deposit],
  );
}

async function handleDemocracyTabled(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const proposalIndex = Number(event.data.proposal_index ?? 0);
  const deposit = String(event.data.deposit ?? "0");

  await query(
    `INSERT INTO gov_democracy_proposals (proposal_index, block_height, deposit, status)
     VALUES ($1, $2, $3, 'tabled')
     ON CONFLICT (proposal_index) DO UPDATE SET
       status = 'tabled',
       deposit = EXCLUDED.deposit,
       updated_at = NOW()`,
    [proposalIndex, ctx.blockHeight, deposit],
  );
}

async function handleDemocracyStarted(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const refIndex = Number(event.data.ref_index ?? 0);
  const threshold = String(event.data.threshold ?? "");

  await query(
    `INSERT INTO gov_democracy_referenda (ref_index, block_height, threshold, status)
     VALUES ($1, $2, $3, 'started')
     ON CONFLICT (ref_index) DO UPDATE SET
       threshold = EXCLUDED.threshold,
       updated_at = NOW()`,
    [refIndex, ctx.blockHeight, threshold],
  );
}

async function handleDemocracyOutcome(
  ctx: BlockContext,
  event: ExplorerEvent,
  status: string,
): Promise<void> {
  const refIndex = Number(event.data.ref_index ?? 0);

  await query(
    `INSERT INTO gov_democracy_referenda (ref_index, block_height, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (ref_index) DO UPDATE SET
       status = EXCLUDED.status,
       end_block = EXCLUDED.block_height,
       updated_at = NOW()`,
    [refIndex, ctx.blockHeight, status],
  );
}

async function handleDemocracyVoted(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const refIndex = Number(event.data.ref_index ?? 0);
  const voter = String(event.data.voter ?? "");

  // Parse vote structure: { Standard: { vote: 129, balance: "..." } }
  // vote is a bitmask: bit 7 = aye/nay, bits 0-6 = conviction (0-6)
  const voteData = event.data.vote as Record<string, unknown> | undefined;
  let isAye = true;
  let conviction = 0;
  let balance = "0";

  if (voteData?.Standard) {
    const standard = voteData.Standard as { vote: number; balance: string };
    const voteByte = standard.vote ?? 0;
    isAye = (voteByte & 0x80) !== 0;
    conviction = voteByte & 0x7f;
    balance = String(standard.balance ?? "0");
  } else if (voteData?.Split) {
    const split = voteData.Split as { aye: string; nay: string };
    balance = String(split.aye ?? "0");
    isAye = BigInt(split.aye ?? "0") > BigInt(split.nay ?? "0");
  }

  await query(
    `INSERT INTO gov_democracy_votes (ref_index, block_height, voter, is_aye, conviction, balance)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [refIndex, ctx.blockHeight, voter, isAye, conviction, balance],
  );
}

// ============================================================
// Collective Handlers (shared by Council + TechnicalCommittee)
// ============================================================

async function handleCollectiveProposed(
  ctx: BlockContext,
  event: ExplorerEvent,
  table: GovMotionTable,
): Promise<void> {
  const proposalIndex = Number(event.data.proposal_index ?? 0);
  const proposalHash = String(event.data.proposal_hash ?? "");
  const proposer = String(event.data.account ?? "");
  const threshold = Number(event.data.threshold ?? 0);

  await query(
    `INSERT INTO ${table} (proposal_index, proposal_hash, block_height, proposer, threshold, status)
     VALUES ($1, $2, $3, $4, $5, 'proposed')
     ON CONFLICT (proposal_index) DO UPDATE SET
       proposal_hash = EXCLUDED.proposal_hash,
       proposer = EXCLUDED.proposer,
       threshold = EXCLUDED.threshold,
       updated_at = NOW()`,
    [proposalIndex, proposalHash, ctx.blockHeight, proposer, threshold],
  );
}

async function handleCollectiveVoted(
  ctx: BlockContext,
  event: ExplorerEvent,
  motionTable: GovMotionTable,
  voteTable: GovVoteTable,
): Promise<void> {
  const proposalHash = String(event.data.proposal_hash ?? "");
  const voter = String(event.data.account ?? "");
  const isAye = Boolean(event.data.voted);
  const yesCount = Number(event.data.yes ?? 0);
  const noCount = Number(event.data.no ?? 0);

  // Insert the individual vote
  await query(
    `INSERT INTO ${voteTable} (proposal_hash, block_height, voter, is_aye) VALUES ($1, $2, $3, $4)`,
    [proposalHash, ctx.blockHeight, voter, isAye],
  );

  // Update running tally on the motion
  await query(
    `UPDATE ${motionTable} SET aye_count = $1, nay_count = $2, updated_at = NOW()
     WHERE proposal_hash = $3`,
    [yesCount, noCount, proposalHash],
  );
}

async function handleCollectiveStatusUpdate(
  event: ExplorerEvent,
  table: GovMotionTable,
  status: string,
): Promise<void> {
  const proposalHash = String(event.data.proposal_hash ?? "");

  await query(`UPDATE ${table} SET status = $1, updated_at = NOW() WHERE proposal_hash = $2`, [
    status,
    proposalHash,
  ]);
}

async function handleCollectiveClosed(event: ExplorerEvent, table: GovMotionTable): Promise<void> {
  const proposalHash = String(event.data.proposal_hash ?? "");
  const yesCount = Number(event.data.yes ?? 0);
  const noCount = Number(event.data.no ?? 0);

  await query(
    `UPDATE ${table} SET aye_count = $1, nay_count = $2, status = 'closed', updated_at = NOW()
     WHERE proposal_hash = $3`,
    [yesCount, noCount, proposalHash],
  );
}

// ============================================================
// Preimage Handlers
// ============================================================

async function handlePreimage(
  ctx: BlockContext,
  event: ExplorerEvent,
  status: string,
): Promise<void> {
  const hash = String(event.data.hash ?? "");

  await query(
    `INSERT INTO gov_preimages (hash, block_height, status)
     VALUES ($1, $2, $3)
     ON CONFLICT (hash) DO UPDATE SET
       status = EXCLUDED.status,
       updated_at = NOW()`,
    [hash, ctx.blockHeight, status],
  );
}
