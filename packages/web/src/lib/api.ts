/**
 * API client for communicating with the indexer backend.
 * Provides typed fetch wrappers for all endpoints.
 */

// Server-side (SSR): use API_URL for direct Docker-internal access.
// Client-side (browser): use /indexer-api proxy through Next.js rewrites.
const API_BASE =
  typeof window === "undefined"
    ? (process.env.API_URL ?? "http://localhost:3001")
    : "/indexer-api";

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

export async function getBlocks(limit = 20, offset = 0): Promise<BlocksResponse> {
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

// ---- Extrinsics List ----

export interface ExtrinsicsResponse {
  data: ExtrinsicSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getExtrinsics(
  limit = 25,
  offset = 0,
  signedOnly = false,
): Promise<ExtrinsicsResponse> {
  const params = `limit=${limit}&offset=${offset}${signedOnly ? "&signed=true" : ""}`;
  return fetchJson(`/api/extrinsics?${params}`);
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

// ---- Events List ----

export interface EventsResponse {
  data: EventSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getEvents(limit = 25, offset = 0, module?: string): Promise<EventsResponse> {
  const params = `limit=${limit}&offset=${offset}${module ? `&module=${encodeURIComponent(module)}` : ""}`;
  return fetchJson(`/api/events?${params}`);
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

// ---- Accounts List ----

export interface AccountListItem {
  address: string;
  publicKey: string;
  identity: { display?: string } | null;
  lastActiveBlock: number;
  createdAtBlock: number;
  balance: {
    free: string;
    reserved: string;
    frozen: string;
    flags: string;
  } | null;
  extrinsicCount: number;
}

export interface AccountsResponse {
  data: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getAccounts(limit = 25, offset = 0): Promise<AccountsResponse> {
  return fetchJson(`/api/accounts?limit=${limit}&offset=${offset}`);
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

// ---- Stats ----

export interface ChainStats {
  latestBlock: number;
  finalizedBlock: number;
  signedExtrinsics: number;
  transfers: number;
  totalAccounts: number;
}

export async function getStats(): Promise<ChainStats> {
  return fetchJson("/api/stats");
}

// ---- Transfers ----

export interface TransferSummary {
  extrinsicId: string;
  blockHeight: number;
  timestamp: number | null;
  amount: string;
  from: string;
  to: string;
}

export async function getTransfers(limit = 10): Promise<TransferSummary[]> {
  const res: TransfersResponse = await fetchJson(`/api/transfers?limit=${limit}`);
  return res.data;
}

export interface TransfersResponse {
  data: TransferSummary[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getTransfersList(limit = 25, offset = 0): Promise<TransfersResponse> {
  return fetchJson(`/api/transfers?limit=${limit}&offset=${offset}`);
}

// ---- Indexer Status ----

export interface IndexerStatusResponse {
  startedAt: number;
  uptimeSeconds: number;
  state: "idle" | "syncing" | "live";
  blocksProcessed: number;
  indexedHeight: number;
  chainTip: number;
  blocksRemaining: number;
  syncPercent: number;
  blocksPerMinute: number;
  blocksPerHour: number;
  etaSeconds: number | null;
  errorCount: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  database: {
    totalSize: string;
    tables: { name: string; rows: number; size: string }[];
  };
  rpc: {
    endpointCount: number;
    endpoints: {
      url: string;
      healthy: boolean;
      successes: number;
      failures: number;
    }[];
  };
}

export async function getIndexerStatus(): Promise<IndexerStatusResponse> {
  return fetchJson("/api/indexer-status");
}

// ---- Runtime ----

export interface SpecVersionInfo {
  specVersion: number;
  fromBlock: number;
  toBlock: number;
  blockCount: number;
}

export interface PalletSummary {
  name: string;
  index: number;
  callCount: number;
  eventCount: number;
  storageCount: number;
  constantCount: number;
  errorCount: number;
}

export interface RuntimeSummary {
  specVersion: number;
  pallets: PalletSummary[];
}

export async function getSpecVersions(): Promise<{ versions: SpecVersionInfo[] }> {
  return fetchJson("/api/runtime");
}

export async function getRuntimeModules(specVersion: number): Promise<RuntimeSummary> {
  return fetchJson(`/api/runtime/${specVersion}`);
}

// ---- Logs ----

export interface DigestLogEntry {
  blockHeight: number;
  logIndex: number;
  type: string;
  engine: string | null;
  data: string;
}

export interface LogsResponse {
  data: DigestLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function getLogs(limit = 25, offset = 0): Promise<LogsResponse> {
  return fetchJson(`/api/logs?limit=${limit}&offset=${offset}`);
}
