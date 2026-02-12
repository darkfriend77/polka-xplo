import type {
  Block,
  Extrinsic,
  ExplorerEvent,
  Account,
  AccountBalance,
  IndexerStatus,
} from "@polka-xplo/shared";
import { query, transaction, type DbClient } from "./client.js";

// ============================================================
// Block Queries
// ============================================================

/** Queryable interface: either the pool or a transaction client */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> };

function exec(sql: string, params: unknown[], client?: Queryable): Promise<unknown> {
  return client ? client.query(sql, params) : query(sql, params);
}

export async function insertBlock(block: Block, client?: DbClient): Promise<void> {
  await exec(
    `INSERT INTO blocks (height, hash, parent_hash, state_root, extrinsics_root, timestamp, validator_id, status, spec_version, event_count, extrinsic_count, digest_logs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (height) DO UPDATE SET
       hash = EXCLUDED.hash,
       parent_hash = EXCLUDED.parent_hash,
       status = EXCLUDED.status,
       event_count = EXCLUDED.event_count,
       extrinsic_count = EXCLUDED.extrinsic_count,
       digest_logs = EXCLUDED.digest_logs`,
    [
      block.height,
      block.hash,
      block.parentHash,
      block.stateRoot,
      block.extrinsicsRoot,
      block.timestamp,
      block.validatorId,
      block.status,
      block.specVersion,
      block.eventCount,
      block.extrinsicCount,
      JSON.stringify(block.digestLogs ?? []),
    ],
    client,
  );
}

export async function finalizeBlock(height: number): Promise<void> {
  await query(`UPDATE blocks SET status = 'finalized' WHERE height = $1`, [height]);
}

export async function getBlockByHeight(height: number): Promise<Block | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT height, hash, parent_hash, state_root, extrinsics_root, timestamp, validator_id, status, spec_version, event_count, extrinsic_count, digest_logs
     FROM blocks WHERE height = $1`,
    [height],
  );
  return result.rows.length > 0 ? mapBlock(result.rows[0]) : null;
}

export async function getBlockByHash(hash: string): Promise<Block | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT height, hash, parent_hash, state_root, extrinsics_root, timestamp, validator_id, status, spec_version, event_count, extrinsic_count, digest_logs
     FROM blocks WHERE hash = $1`,
    [hash],
  );
  return result.rows.length > 0 ? mapBlock(result.rows[0]) : null;
}

export async function getLatestBlocks(
  limit: number = 20,
  offset: number = 0,
): Promise<{ blocks: Block[]; total: number }> {
  const [dataResult, countResult] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT height, hash, parent_hash, state_root, extrinsics_root, timestamp, validator_id, status, spec_version, event_count, extrinsic_count, digest_logs
       FROM blocks ORDER BY height DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM blocks`),
  ]);

  return {
    blocks: dataResult.rows.map(mapBlock),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

export async function getLastFinalizedHeight(): Promise<number> {
  const result = await query<{ height: string | null }>(
    `SELECT MAX(height) as height FROM blocks WHERE status = 'finalized'`,
  );
  return result.rows[0]?.height ? parseInt(String(result.rows[0].height), 10) : 0;
}

/** Remove best-only blocks from an abandoned fork */
export async function pruneForkedBlocks(fromHeight: number): Promise<void> {
  await transaction(async (client: DbClient) => {
    await client.query(
      `DELETE FROM events WHERE block_height > $1 AND block_height IN (SELECT height FROM blocks WHERE height > $1 AND status = 'best')`,
      [fromHeight],
    );
    await client.query(
      `DELETE FROM extrinsics WHERE block_height > $1 AND block_height IN (SELECT height FROM blocks WHERE height > $1 AND status = 'best')`,
      [fromHeight],
    );
    await client.query(`DELETE FROM blocks WHERE height > $1 AND status = 'best'`, [fromHeight]);
  });
}

// ============================================================
// Extrinsic Queries
// ============================================================

export async function insertExtrinsic(ext: Extrinsic, client?: DbClient): Promise<void> {
  await exec(
    `INSERT INTO extrinsics (id, block_height, tx_hash, index, signer, module, call, args, success, fee, tip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       success = EXCLUDED.success,
       fee = EXCLUDED.fee,
       args = EXCLUDED.args`,
    [
      ext.id,
      ext.blockHeight,
      ext.txHash,
      ext.index,
      ext.signer,
      ext.module,
      ext.call,
      JSON.stringify(ext.args),
      ext.success,
      ext.fee,
      ext.tip,
    ],
    client,
  );
}

export async function getExtrinsicsByBlock(blockHeight: number): Promise<Extrinsic[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT id, block_height, tx_hash, index, signer, module, call, args, success, fee, tip
     FROM extrinsics WHERE block_height = $1 ORDER BY index`,
    [blockHeight],
  );
  return result.rows.map(mapExtrinsic);
}

export async function getExtrinsicsList(
  limit = 25,
  offset = 0,
  signedOnly = false,
  module?: string,
  calls?: string[],
): Promise<{ data: Extrinsic[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (signedOnly) conditions.push(`signer IS NOT NULL`);
  if (module) { conditions.push(`module = $${idx++}`); params.push(module); }
  if (calls && calls.length > 0) {
    const placeholders = calls.map(() => `$${idx++}`);
    conditions.push(`call IN (${placeholders.join(",")})`);
    params.push(...calls);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ``;

  const [dataRes, countRes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id, block_height, tx_hash, index, signer, module, call, args, success, fee, tip
       FROM extrinsics ${where} ORDER BY block_height DESC, index DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM extrinsics ${where}`, params),
  ]);
  return {
    data: dataRes.rows.map(mapExtrinsic),
    total: parseInt(countRes.rows[0].count, 10),
  };
}

export async function getExtrinsicByHash(txHash: string): Promise<Extrinsic | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT id, block_height, tx_hash, index, signer, module, call, args, success, fee, tip
     FROM extrinsics WHERE tx_hash = $1 LIMIT 1`,
    [txHash],
  );
  return result.rows.length > 0 ? mapExtrinsic(result.rows[0]) : null;
}

export async function getExtrinsicById(id: string): Promise<Extrinsic | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT id, block_height, tx_hash, index, signer, module, call, args, success, fee, tip
     FROM extrinsics WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows.length > 0 ? mapExtrinsic(result.rows[0]) : null;
}

export async function getExtrinsicsBySigner(
  signer: string,
  limit: number = 20,
  offset: number = 0,
): Promise<Extrinsic[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT id, block_height, tx_hash, index, signer, module, call, args, success, fee, tip
     FROM extrinsics WHERE signer = $1 ORDER BY block_height DESC, index LIMIT $2 OFFSET $3`,
    [signer, limit, offset],
  );
  return result.rows.map(mapExtrinsic);
}

// ============================================================
// Event Queries
// ============================================================

export async function insertEvent(evt: ExplorerEvent, client?: DbClient): Promise<void> {
  const phaseType = evt.phase.type;
  const phaseIndex = evt.phase.type === "ApplyExtrinsic" ? evt.phase.index : null;

  await exec(
    `INSERT INTO events (id, block_height, extrinsic_id, index, module, event, data, phase_type, phase_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING`,
    [
      evt.id,
      evt.blockHeight,
      evt.extrinsicId,
      evt.index,
      evt.module,
      evt.event,
      JSON.stringify(evt.data),
      phaseType,
      phaseIndex,
    ],
    client,
  );
}

export async function getEventsByBlock(blockHeight: number): Promise<ExplorerEvent[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT id, block_height, extrinsic_id, index, module, event, data, phase_type, phase_index
     FROM events WHERE block_height = $1 ORDER BY index`,
    [blockHeight],
  );
  return result.rows.map(mapEvent);
}

export async function getEventsByExtrinsic(extrinsicId: string): Promise<ExplorerEvent[]> {
  const result = await query<Record<string, unknown>>(
    `SELECT id, block_height, extrinsic_id, index, module, event, data, phase_type, phase_index
     FROM events WHERE extrinsic_id = $1 ORDER BY index`,
    [extrinsicId],
  );
  return result.rows.map(mapEvent);
}

export async function getEventsList(
  limit = 25,
  offset = 0,
  module?: string,
  eventNames?: string[],
): Promise<{ data: ExplorerEvent[]; total: number }> {
  const conditions: string[] = [];
  const dataParams: unknown[] = [limit, offset];
  const countParams: unknown[] = [];

  if (module) {
    dataParams.push(module);
    countParams.push(module);
    conditions.push(`module = $${dataParams.length}`);
  }
  if (eventNames && eventNames.length > 0) {
    const placeholders = eventNames.map((e) => {
      dataParams.push(e);
      countParams.push(e);
      return `$${dataParams.length}`;
    });
    conditions.push(`event IN (${placeholders.join(", ")})`);
  }

  const whereData = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ``;
  // Count params use 1-based indexing
  const countConditions: string[] = [];
  let ci = 0;
  if (module) countConditions.push(`module = $${++ci}`);
  if (eventNames && eventNames.length > 0) {
    const cp = eventNames.map(() => `$${++ci}`);
    countConditions.push(`event IN (${cp.join(", ")})`);
  }
  const whereCount = countConditions.length > 0 ? `WHERE ${countConditions.join(" AND ")}` : ``;

  const [dataRes, countRes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id, block_height, extrinsic_id, index, module, event, data, phase_type, phase_index
       FROM events ${whereData} ORDER BY block_height DESC, index DESC LIMIT $1 OFFSET $2`,
      dataParams,
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM events ${whereCount}`,
      countParams,
    ),
  ]);
  return {
    data: dataRes.rows.map(mapEvent),
    total: parseInt(countRes.rows[0].count, 10),
  };
}

/** Get distinct modules and their calls from the extrinsics table */
export async function getExtrinsicModules(): Promise<{ module: string; calls: string[] }[]> {
  const result = await query<{ module: string; call: string }>(
    `SELECT DISTINCT module, call FROM extrinsics ORDER BY module, call`,
  );
  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const existing = map.get(row.module) ?? [];
    existing.push(row.call);
    map.set(row.module, existing);
  }
  return Array.from(map.entries()).map(([module, calls]) => ({ module, calls }));
}

/** Get distinct modules and their event types from the events table */
export async function getEventModules(): Promise<{ module: string; events: string[] }[]> {
  const result = await query<{ module: string; event: string }>(
    `SELECT DISTINCT module, event FROM events ORDER BY module, event`,
  );
  const map = new Map<string, string[]>();
  for (const row of result.rows) {
    const existing = map.get(row.module) ?? [];
    existing.push(row.event);
    map.set(row.module, existing);
  }
  return Array.from(map.entries()).map(([module, events]) => ({ module, events }));
}

export async function getTransfersList(
  limit = 25,
  offset = 0,
): Promise<{
  data: {
    extrinsicId: string;
    blockHeight: number;
    timestamp: number | null;
    amount: string;
    from: string;
    to: string;
  }[];
  total: number;
}> {
  const [dataRes, countRes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT e.id as event_id, e.extrinsic_id, e.block_height, e.data,
              b.timestamp
       FROM events e
       LEFT JOIN blocks b ON b.height = e.block_height
       WHERE e.module = 'Balances' AND e.event IN ('Transfer', 'transfer')
       ORDER BY e.block_height DESC, e.index DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM events WHERE module = 'Balances' AND event IN ('Transfer', 'transfer')`,
    ),
  ]);
  const data = dataRes.rows.map((row) => {
    const d =
      typeof row.data === "string" ? JSON.parse(row.data) : (row.data as Record<string, unknown>);
    return {
      extrinsicId: (row.extrinsic_id as string) ?? (row.event_id as string),
      blockHeight: Number(row.block_height),
      timestamp: row.timestamp ? Number(row.timestamp) : null,
      amount: String(d.amount ?? d.value ?? "0"),
      from: String(d.from ?? d.who ?? ""),
      to: String(d.to ?? d.dest ?? ""),
    };
  });
  return { data, total: parseInt(countRes.rows[0].count, 10) };
}

// ============================================================
// Account Queries
// ============================================================

export interface AccountListItem {
  address: string;
  publicKey: string;
  identity: Account["identity"];
  lastActiveBlock: number;
  createdAtBlock: number;
  balance: AccountBalance | null;
  extrinsicCount: number;
}

export async function getAccounts(
  limit = 25,
  offset = 0,
): Promise<{ data: AccountListItem[]; total: number }> {
  const [dataRes, countRes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT a.address, a.public_key, a.identity, a.last_active_block, a.created_at_block,
              b.free, b.reserved, b.frozen, b.flags,
              COALESCE(ec.cnt, 0) AS extrinsic_count
       FROM accounts a
       LEFT JOIN account_balances b ON a.address = b.address
       LEFT JOIN (
         SELECT signer, COUNT(*) AS cnt FROM extrinsics WHERE signer IS NOT NULL GROUP BY signer
       ) ec ON ec.signer = a.address
       ORDER BY b.free::numeric DESC NULLS LAST, a.last_active_block DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM accounts`),
  ]);

  const total = parseInt(countRes.rows[0].count, 10);
  const data: AccountListItem[] = dataRes.rows.map((row) => ({
    address: row.address as string,
    publicKey: row.public_key as string,
    identity: row.identity as Account["identity"],
    lastActiveBlock: Number(row.last_active_block),
    createdAtBlock: Number(row.created_at_block),
    balance: row.free
      ? {
          free: row.free as string,
          reserved: row.reserved as string,
          frozen: row.frozen as string,
          flags: row.flags as string,
        }
      : null,
    extrinsicCount: Number(row.extrinsic_count),
  }));

  return { data, total };
}

export async function upsertAccount(
  address: string,
  publicKey: string,
  blockHeight: number,
  client?: DbClient,
): Promise<void> {
  await exec(
    `INSERT INTO accounts (address, public_key, last_active_block, created_at_block)
     VALUES ($1, $2, $3, $3)
     ON CONFLICT (address) DO UPDATE SET
       last_active_block = GREATEST(accounts.last_active_block, EXCLUDED.last_active_block),
       updated_at = NOW()`,
    [address, publicKey, blockHeight],
    client,
  );
}

export async function upsertBalance(
  address: string,
  balance: AccountBalance,
  blockHeight: number,
): Promise<void> {
  await query(
    `INSERT INTO account_balances (address, free, reserved, frozen, flags, updated_at_block)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (address) DO UPDATE SET
       free = EXCLUDED.free,
       reserved = EXCLUDED.reserved,
       frozen = EXCLUDED.frozen,
       flags = EXCLUDED.flags,
       updated_at_block = EXCLUDED.updated_at_block,
       updated_at = NOW()`,
    [address, balance.free, balance.reserved, balance.frozen, balance.flags, blockHeight],
  );
}

export async function getAccount(
  address: string,
): Promise<(Account & { balance: AccountBalance | null }) | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT a.address, a.public_key, a.identity, a.last_active_block, a.created_at_block,
            b.free, b.reserved, b.frozen, b.flags
     FROM accounts a
     LEFT JOIN account_balances b ON a.address = b.address
     WHERE a.address = $1`,
    [address],
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    address: row.address as string,
    publicKey: row.public_key as string,
    identity: row.identity as Account["identity"],
    lastActiveBlock: Number(row.last_active_block),
    createdAtBlock: Number(row.created_at_block),
    balance: row.free
      ? {
          free: row.free as string,
          reserved: row.reserved as string,
          frozen: row.frozen as string,
          flags: row.flags as string,
        }
      : null,
  };
}

// ============================================================
// Indexer State Queries
// ============================================================

export async function getIndexerState(chainId: string): Promise<IndexerStatus | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT chain_id, last_finalized_block, last_best_block, state FROM indexer_state WHERE chain_id = $1`,
    [chainId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    chainId: row.chain_id as string,
    lastFinalizedBlock: Number(row.last_finalized_block),
    lastBestBlock: Number(row.last_best_block),
    state: row.state as IndexerStatus["state"],
    chainTip: 0,
    syncProgress: 0,
    startedAt: 0,
    errors: [],
  };
}

export async function upsertIndexerState(
  chainId: string,
  finalizedBlock: number,
  bestBlock: number,
  state: string,
): Promise<void> {
  await query(
    `INSERT INTO indexer_state (chain_id, last_finalized_block, last_best_block, state)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (chain_id) DO UPDATE SET
       last_finalized_block = EXCLUDED.last_finalized_block,
       last_best_block = EXCLUDED.last_best_block,
       state = EXCLUDED.state,
       updated_at = NOW()`,
    [chainId, finalizedBlock, bestBlock, state],
  );
}

// ============================================================
// Search Queries
// ============================================================

export async function getChainStats(): Promise<{
  latestBlock: number;
  finalizedBlock: number;
  signedExtrinsics: number;
  transfers: number;
  totalAccounts: number;
}> {
  const [blockRes, finRes, signedRes, transferRes, accountRes] = await Promise.all([
    query<{ height: string | null }>(`SELECT MAX(height) as height FROM blocks`),
    query<{ height: string | null }>(
      `SELECT MAX(height) as height FROM blocks WHERE status = 'finalized'`,
    ),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM extrinsics WHERE signer IS NOT NULL`),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM events WHERE module = 'Balances' AND event IN ('Transfer', 'transfer')`,
    ),
    query<{ count: string }>(`SELECT COUNT(*) as count FROM accounts`),
  ]);
  return {
    latestBlock: blockRes.rows[0]?.height ? parseInt(String(blockRes.rows[0].height), 10) : 0,
    finalizedBlock: finRes.rows[0]?.height ? parseInt(String(finRes.rows[0].height), 10) : 0,
    signedExtrinsics: parseInt(signedRes.rows[0].count, 10),
    transfers: parseInt(transferRes.rows[0].count, 10),
    totalAccounts: parseInt(accountRes.rows[0].count, 10),
  };
}

export async function getLatestTransfers(limit: number = 5): Promise<
  {
    extrinsicId: string;
    blockHeight: number;
    timestamp: number | null;
    amount: string;
    from: string;
    to: string;
  }[]
> {
  const result = await query<Record<string, unknown>>(
    `SELECT e.id as event_id, e.extrinsic_id, e.block_height, e.data,
            b.timestamp
     FROM events e
     LEFT JOIN blocks b ON b.height = e.block_height
     WHERE e.module = 'Balances' AND e.event IN ('Transfer', 'transfer')
     ORDER BY e.block_height DESC, e.index DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => {
    const data =
      typeof row.data === "string" ? JSON.parse(row.data) : (row.data as Record<string, unknown>);
    return {
      extrinsicId: (row.extrinsic_id as string) ?? (row.event_id as string),
      blockHeight: Number(row.block_height),
      timestamp: row.timestamp ? Number(row.timestamp) : null,
      amount: String(data.amount ?? data.value ?? "0"),
      from: String(data.from ?? data.who ?? ""),
      to: String(data.to ?? data.dest ?? ""),
    };
  });
}

/**
 * Get transfers (Balances.Transfer events) where the given address
 * is either the sender or the receiver.
 * Uses data->>from / data->>to JSON extraction on the events table.
 */
export async function getAccountTransfers(
  address: string,
  limit = 25,
  offset = 0,
): Promise<{
  data: {
    extrinsicId: string;
    blockHeight: number;
    timestamp: number | null;
    amount: string;
    from: string;
    to: string;
  }[];
  total: number;
}> {
  const [dataRes, countRes] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT e.id as event_id, e.extrinsic_id, e.block_height, e.data,
              b.timestamp
       FROM events e
       LEFT JOIN blocks b ON b.height = e.block_height
       WHERE e.module = 'Balances' AND e.event IN ('Transfer', 'transfer')
         AND (e.data->>'from' = $1 OR e.data->>'to' = $1)
       ORDER BY e.block_height DESC, e.index DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM events
       WHERE module = 'Balances' AND event IN ('Transfer', 'transfer')
         AND (data->>'from' = $1 OR data->>'to' = $1)`,
      [address],
    ),
  ]);
  const data = dataRes.rows.map((row) => {
    const d =
      typeof row.data === "string" ? JSON.parse(row.data) : (row.data as Record<string, unknown>);
    return {
      extrinsicId: (row.extrinsic_id as string) ?? (row.event_id as string),
      blockHeight: Number(row.block_height),
      timestamp: row.timestamp ? Number(row.timestamp) : null,
      amount: String(d.amount ?? d.value ?? "0"),
      from: String(d.from ?? d.who ?? ""),
      to: String(d.to ?? d.dest ?? ""),
    };
  });
  return { data, total: parseInt(countRes.rows[0].count, 10) };
}

export async function searchByHash(
  hash: string,
): Promise<{ type: "block" | "extrinsic"; data: Block | Extrinsic } | null> {
  // Check blocks first
  const block = await getBlockByHash(hash);
  if (block) return { type: "block", data: block };

  // Check extrinsics
  const ext = await getExtrinsicByHash(hash);
  if (ext) return { type: "extrinsic", data: ext };

  return null;
}

// ============================================================
// Row Mapping Helpers
// ============================================================

function mapBlock(row: Record<string, unknown>): Block {
  const rawLogs = row.digest_logs;
  let digestLogs: Block["digestLogs"] = [];
  if (typeof rawLogs === "string") {
    try {
      digestLogs = JSON.parse(rawLogs);
    } catch {
      /* empty */
    }
  } else if (Array.isArray(rawLogs)) {
    digestLogs = rawLogs as Block["digestLogs"];
  }
  return {
    height: Number(row.height),
    hash: row.hash as string,
    parentHash: row.parent_hash as string,
    stateRoot: row.state_root as string,
    extrinsicsRoot: row.extrinsics_root as string,
    timestamp: row.timestamp ? Number(row.timestamp) : null,
    validatorId: row.validator_id as string | null,
    status: row.status as Block["status"],
    specVersion: Number(row.spec_version),
    eventCount: Number(row.event_count),
    extrinsicCount: Number(row.extrinsic_count),
    digestLogs,
  };
}

function mapExtrinsic(row: Record<string, unknown>): Extrinsic {
  return {
    id: row.id as string,
    blockHeight: Number(row.block_height),
    txHash: row.tx_hash as string,
    index: Number(row.index),
    signer: row.signer as string | null,
    module: row.module as string,
    call: row.call as string,
    args: (typeof row.args === "string" ? JSON.parse(row.args) : row.args) as Record<
      string,
      unknown
    >,
    success: row.success as boolean,
    fee: row.fee as string | null,
    tip: row.tip as string | null,
  };
}

function mapEvent(row: Record<string, unknown>): ExplorerEvent {
  const phaseType = row.phase_type as string;
  const phaseIndex = row.phase_index as number | null;

  return {
    id: row.id as string,
    blockHeight: Number(row.block_height),
    extrinsicId: row.extrinsic_id as string | null,
    index: Number(row.index),
    module: row.module as string,
    event: row.event as string,
    data: (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as Record<
      string,
      unknown
    >,
    phase:
      phaseType === "ApplyExtrinsic"
        ? { type: "ApplyExtrinsic", index: phaseIndex! }
        : phaseType === "Finalization"
          ? { type: "Finalization" }
          : { type: "Initialization" },
  };
}

// ============================================================
// Database Size / Table Stats
// ============================================================

/** Get all spec versions with their block ranges */
export async function getSpecVersions(): Promise<
  { specVersion: number; fromBlock: number; toBlock: number; blockCount: number }[]
> {
  const result = await query<{
    spec_version: string;
    from_block: string;
    to_block: string;
    block_count: string;
  }>(
    `SELECT spec_version, MIN(height) as from_block, MAX(height) as to_block, COUNT(*) as block_count
     FROM blocks GROUP BY spec_version ORDER BY spec_version DESC`,
  );
  return result.rows.map((r) => ({
    specVersion: parseInt(r.spec_version, 10),
    fromBlock: parseInt(r.from_block, 10),
    toBlock: parseInt(r.to_block, 10),
    blockCount: parseInt(r.block_count, 10),
  }));
}

/** Get a block hash for a given spec version (to use for metadata lookup) */
export async function getBlockHashForSpecVersion(specVersion: number): Promise<string | null> {
  const result = await query<{ hash: string }>(
    `SELECT hash FROM blocks WHERE spec_version = $1 LIMIT 1`,
    [specVersion],
  );
  return result.rows[0]?.hash ?? null;
}

/** Get paginated digest logs, unnested from blocks */
export async function getDigestLogs(
  limit: number = 25,
  offset: number = 0,
): Promise<{
  data: {
    blockHeight: number;
    logIndex: number;
    type: string;
    engine: string | null;
    data: string;
  }[];
  total: number;
}> {
  const [dataResult, countResult] = await Promise.all([
    query<{
      block_height: string;
      log_index: string;
      log_type: string;
      engine: string | null;
      log_data: string;
    }>(
      `SELECT b.height as block_height,
              (row_number() OVER (PARTITION BY b.height ORDER BY idx.ordinality)) as log_index,
              idx.elem->>'type' as log_type,
              idx.elem->>'engine' as engine,
              idx.elem->>'data' as log_data
       FROM blocks b,
            LATERAL jsonb_array_elements(b.digest_logs) WITH ORDINALITY AS idx(elem, ordinality)
       WHERE b.digest_logs IS NOT NULL AND jsonb_array_length(b.digest_logs) > 0
       ORDER BY b.height DESC, idx.ordinality
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query<{ count: string }>(
      `SELECT SUM(jsonb_array_length(digest_logs))::text as count
       FROM blocks
       WHERE digest_logs IS NOT NULL AND jsonb_array_length(digest_logs) > 0`,
    ),
  ]);

  return {
    data: dataResult.rows.map((r) => ({
      blockHeight: parseInt(r.block_height, 10),
      logIndex: parseInt(r.log_index, 10),
      type: r.log_type,
      engine: r.engine,
      data: r.log_data,
    })),
    total: parseInt(countResult.rows[0]?.count ?? "0", 10),
  };
}

export async function getDatabaseSize(): Promise<{
  totalSize: string;
  tables: { name: string; rows: number; size: string }[];
}> {
  const [sizeResult, tableResult] = await Promise.all([
    query<{ size: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`),
    query<{ table_name: string; row_estimate: string; total_size: string }>(
      `SELECT
         relname as table_name,
         n_live_tup as row_estimate,
         pg_size_pretty(pg_total_relation_size(quote_ident(relname))) as total_size
       FROM pg_stat_user_tables
       ORDER BY pg_total_relation_size(quote_ident(relname)) DESC`,
    ),
  ]);
  return {
    totalSize: sizeResult.rows[0]?.size ?? "0",
    tables: tableResult.rows.map((r) => ({
      name: r.table_name,
      rows: parseInt(String(r.row_estimate), 10),
      size: r.total_size,
    })),
  };
}

// ============================================================
// Repair Queries — fix mis-decoded extrinsics
// ============================================================

/**
 * Find extrinsics whose module or call contains the placeholder pattern
 * (e.g. "Pallet(217)", "call(56)") indicating a decoding failure.
 * Returns the block heights that need re-processing.
 */
export async function getBrokenExtrinsicBlocks(limit = 1000): Promise<number[]> {
  const result = await query<{ block_height: number }>(
    `SELECT DISTINCT block_height FROM extrinsics
     WHERE module ~ '^[Pp]allet\\(' OR call ~ '^call\\('
        OR module = 'Unknown'
     ORDER BY block_height
     LIMIT $1`,
    [limit],
  );
  return result.rows.map((r) => Number(r.block_height));
}

/**
 * Delete extrinsics for a specific block so they can be re-inserted
 * with corrected module/call names.
 */
export async function deleteExtrinsicsForBlock(
  blockHeight: number,
  client?: DbClient,
): Promise<void> {
  const exec = client ? client.query.bind(client) : query;
  await exec(`DELETE FROM extrinsics WHERE block_height = $1`, [blockHeight]);
}

/**
 * Truncate oversized extrinsic args in batches.
 * Targets known oversized extrinsics by module/call (uses index)
 * plus a fallback for any other large args.
 * Returns number of rows updated per batch call.
 */
export async function truncateOversizedArgs(
  thresholdBytes: number = 4096,
  batchSize: number = 500,
): Promise<{ updated: number }> {
  // First pass: target known oversized module/call combos via index (fast)
  let result = await query<{ cnt: number }>(
    `WITH targets AS (
       SELECT id, length(args::text) AS sz FROM extrinsics
       WHERE module = 'ParachainSystem' AND call = 'set_validation_data'
         AND (args->>'_oversized') IS NULL
       LIMIT $1
     )
     UPDATE extrinsics e
     SET args = jsonb_build_object('_oversized', true, '_originalBytes', t.sz)
     FROM targets t
     WHERE e.id = t.id
     RETURNING 1 AS cnt`,
    [batchSize],
  );

  if (result.rows.length > 0) return { updated: result.rows.length };

  // Second pass: catch any other oversized args (slower, full scan)
  result = await query<{ cnt: number }>(
    `WITH targets AS (
       SELECT id, length(args::text) AS sz FROM extrinsics
       WHERE length(args::text) > $1
         AND (args->>'_oversized') IS NULL
       LIMIT $2
     )
     UPDATE extrinsics e
     SET args = jsonb_build_object('_oversized', true, '_originalBytes', t.sz)
     FROM targets t
     WHERE e.id = t.id
     RETURNING 1 AS cnt`,
    [thresholdBytes, batchSize],
  );
  return { updated: result.rows.length };
}
