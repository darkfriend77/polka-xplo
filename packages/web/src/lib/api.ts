/**
 * API client for communicating with the indexer backend.
 * Provides typed fetch wrappers for all endpoints.
 */

// Use non-NEXT_PUBLIC_ env var for server-side fetches (Server Components / ISR),
// falling back to NEXT_PUBLIC_ for client-side fetches and localhost for dev.
const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: 6 }, // Revalidate every ~1 block (6s)
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---- Blocks ----

export interface BlocksResponse {
  data: BlockSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface BlockSummary {
  height: number;
  hash: string;
  parentHash: string;
  timestamp: number | null;
  status: string;
  extrinsicCount: number;
  eventCount: number;
  validatorId: string | null;
}

export interface BlockDetail {
  block: BlockSummary & {
    stateRoot: string;
    extrinsicsRoot: string;
    specVersion: number;
    digestLogs: { type: string; engine: string | null; data: string }[];
  };
  extrinsics: ExtrinsicSummary[];
  events: EventSummary[];
}

export async function getBlocks(
  limit = 20,
  offset = 0
): Promise<BlocksResponse> {
  return fetchJson(`/api/blocks?limit=${limit}&offset=${offset}`);
}

export async function getBlock(id: string): Promise<BlockDetail> {
  return fetchJson(`/api/blocks/${id}`);
}

// ---- Extrinsics ----

export interface ExtrinsicSummary {
  id: string;
  blockHeight: number;
  txHash: string | null;
  index: number;
  signer: string | null;
  module: string;
  call: string;
  args: Record<string, unknown>;
  success: boolean;
  fee: string | null;
}

export interface ExtrinsicDetail {
  extrinsic: ExtrinsicSummary;
  events: EventSummary[];
  blockTimestamp: number | null;
  blockHash: string | null;
}

export async function getExtrinsic(id: string): Promise<ExtrinsicDetail> {
  return fetchJson(`/api/extrinsics/${encodeURIComponent(id)}`);
}

// ---- Events ----

export interface EventSummary {
  id: string;
  blockHeight: number;
  extrinsicId: string | null;
  index: number;
  module: string;
  event: string;
  data: Record<string, unknown>;
}

// ---- Accounts ----

export interface AccountDetail {
  account: {
    address: string;
    publicKey: string;
    identity: { display?: string } | null;
    lastActiveBlock: number;
    createdAtBlock: number;
  };
  balance: {
    free: string;
    reserved: string;
    frozen: string;
    flags: string;
  } | null;
  recentExtrinsics: ExtrinsicSummary[];
}

export async function getAccount(address: string): Promise<AccountDetail> {
  return fetchJson(`/api/accounts/${address}`);
}

// ---- Search ----

export interface SearchResponse {
  results: Array<{
    type: string;
    id: string;
    label: string;
    url: string;
  }>;
}

export async function search(query: string): Promise<SearchResponse> {
  return fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
}

// ---- Health ----

export interface HealthStatus {
  status: string;
  nodeConnected: boolean;
  syncLag: number;
  dbConnected: boolean;
  chainTip: number;
  indexedTip: number;
  timestamp: number;
}

export async function getHealth(): Promise<HealthStatus> {
  return fetchJson("/health");
}
