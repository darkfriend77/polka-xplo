import type { BlockContext, ExplorerEvent, Extrinsic } from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Staking Extension — Event Handler
 *
 * Processes staking-specific events and stores them in
 * dedicated tables for rich querying and analytics.
 */
export async function onEvent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const key = `${event.module}.${event.event}`;

  switch (key) {
    case "Staking.Rewarded":
      await handleReward(ctx, event);
      break;
    case "Staking.Slashed":
      await handleSlash(ctx, event);
      break;
    case "Staking.Bonded":
      await handleBond(ctx, event, "bond");
      break;
    case "Staking.Unbonded":
      await handleBond(ctx, event, "unbond");
      break;
    case "Staking.Withdrawn":
      await handleBond(ctx, event, "withdrawn");
      break;
    case "Staking.EraPaid":
      await handleEraPaid(ctx, event);
      break;
  }
}

export async function onExtrinsic(ctx: BlockContext, extrinsic: Extrinsic): Promise<void> {
  // Track bond_extra as a bond action
  if (extrinsic.module === "Staking" && extrinsic.call === "bond_extra") {
    const amount = String(extrinsic.args.max_additional ?? "0");
    await query(
      `INSERT INTO staking_bonds (block_height, stash, amount, action) VALUES ($1, $2, $3, $4)`,
      [ctx.blockHeight, extrinsic.signer ?? "", amount, "bond_extra"],
    );
  }
}

/** Return the SQL for this extension's migrations */
export function getMigrationSQL(): string {
  // When compiled, __dirname = <ext>/dist/indexer, so go up two levels to ext root
  const extRoot = path.join(__dirname, "..", "..");
  const migrationPath = path.join(extRoot, "migrations", "001_staking.sql");
  return fs.readFileSync(migrationPath, "utf-8");
}

// ---- Handler implementations ----

async function handleReward(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const stash = String(event.data.stash ?? event.data.who ?? "");
  const amount = String(event.data.amount ?? "0");

  await query(`INSERT INTO staking_rewards (block_height, validator, amount) VALUES ($1, $2, $3)`, [
    ctx.blockHeight,
    stash,
    amount,
  ]);
}

async function handleSlash(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const validator = String(event.data.validator ?? event.data.staker ?? "");
  const amount = String(event.data.amount ?? "0");

  await query(`INSERT INTO staking_slashes (block_height, validator, amount) VALUES ($1, $2, $3)`, [
    ctx.blockHeight,
    validator,
    amount,
  ]);
}

async function handleBond(ctx: BlockContext, event: ExplorerEvent, action: string): Promise<void> {
  const stash = String(event.data.stash ?? event.data.who ?? "");
  const amount = String(event.data.amount ?? "0");

  await query(
    `INSERT INTO staking_bonds (block_height, stash, amount, action) VALUES ($1, $2, $3, $4)`,
    [ctx.blockHeight, stash, amount, action],
  );
}

async function handleEraPaid(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  const era = Number(event.data.era_index ?? event.data.era ?? 0);
  const totalReward = String(event.data.validator_payout ?? "0");

  await query(
    `INSERT INTO staking_stats (era, total_reward)
     VALUES ($1, $2)
     ON CONFLICT (era) DO UPDATE SET
       total_reward = EXCLUDED.total_reward,
       updated_at = NOW()`,
    [era, totalReward],
  );
}
