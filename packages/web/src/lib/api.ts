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

/** Default timeout for API requests (ms) */
const API_TIMEOUT_MS = 15_000;

/** Maximum number of retry attempts for failed requests */
const MAX_RETRIES = 2;

async function fetchJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const res = await fetch(`${API_BASE}${path}`, {
        next: { revalidate: 6 }, // Revalidate every ~1 block (6s)
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on 4xx errors (client errors)
      if (lastError.message.startsWith("API error: 4")) throw lastError;

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 200ms, 400ms
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt));
      }
    }
  }

  throw lastError ?? new Error(`API request failed: ${path}`);
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
  module?: string,
  call?: string,
): Promise<ExtrinsicsResponse> {
  let params = `limit=${limit}&offset=${offset}`;
  if (signedOnly) params += "&signed=true";
  if (module) params += `&module=${encodeURIComponent(module)}`;
  if (call) params += `&call=${encodeURIComponent(call)}`;
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

export async function getEvents(
  limit = 25,
  offset = 0,
  module?: string,
  eventNames?: string[],
): Promise<EventsResponse> {
  let params = `limit=${limit}&offset=${offset}`;
  if (module) params += `&module=${encodeURIComponent(module)}`;
  if (eventNames && eventNames.length > 0) params += `&event=${encodeURIComponent(eventNames.join(","))}`;
  return fetchJson(`/api/events?${params}`);
}

export interface EventModuleInfo {
  module: string;
  events: string[];
}

export interface ExtrinsicModuleInfo {
  module: string;
  calls: string[];
}

export async function getEventModules(): Promise<{ modules: EventModuleInfo[] }> {
  return fetchJson("/api/events/modules");
}

export async function getExtrinsicModules(): Promise<{ modules: ExtrinsicModuleInfo[] }> {
  return fetchJson("/api/extrinsics/modules");
}

// ---- Accounts ----

export interface AssetBalance {
  assetId: number;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  status: "Liquid" | "Frozen" | "Blocked";
}

export interface OnChainIdentity {
  display: string | null;
  legal: string | null;
  web: string | null;
  riot: string | null;
  email: string | null;
  pgpFingerprint: string | null;
  image: string | null;
  twitter: string | null;
  additional: Array<{ key: string; value: string }>;
  judgements: Array<{ registrarIndex: number; judgement: string }>;
  deposit: string;
}

export interface AccountDetail {
  account: {
    address: string;
    publicKey: string;
    lastActiveBlock: number;
    createdAtBlock: number;
  };
  balance: {
    free: string;
    reserved: string;
    frozen: string;
    flags: string;
  } | null;
  identity: OnChainIdentity | null;
  assetBalances: AssetBalance[];
  recentExtrinsics: ExtrinsicSummary[];
}

export async function getAccount(address: string): Promise<AccountDetail> {
  return fetchJson(`/api/accounts/${address}`);
}

export async function getAccountTransfers(
  address: string,
  limit = 25,
  offset = 0,
): Promise<TransfersResponse> {
  return fetchJson(`/api/accounts/${address}/transfers?limit=${limit}&offset=${offset}`);
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
  existentialDeposit: string;
  tokenDecimals: number;
  /** Parachain ID from ParachainInfo pallet, or null for relay chains */
  paraId: number | null;
}

export async function getStats(): Promise<ChainStats> {
  return fetchJson("/api/stats");
}

// ---- Activity (time-series) ----

export type ActivityPeriod = "hour" | "day" | "week" | "month";

export interface ActivityBucket {
  timestamp: number;
  label: string;
  extrinsics: number;
  events: number;
  blocks: number;
  transfers: number;
}

export interface ActivityResponse {
  period: string;
  count: number;
  data: ActivityBucket[];
}

export async function getActivity(
  period: ActivityPeriod = "day",
  limit = 30,
): Promise<ActivityResponse> {
  return fetchJson(`/api/stats/activity?period=${period}&limit=${limit}`);
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

export interface LatencyStats {
  avg: number;
  p50: number;
  p95: number;
  max: number;
  count?: number;
}

export interface IndexerStatusResponse {
  startedAt: number;
  uptimeSeconds: number;
  state: "initializing" | "idle" | "syncing" | "live";
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
  blockProcessingTime: LatencyStats & { count: number };
  initInfo?: {
    elapsedSeconds: number;
    statsCacheReady: boolean;
    chainPropsReady: boolean;
  };
  database: {
    totalSize: string;
    tables: { name: string; rows: number; size: string }[];
    cacheHitRatio: number;
    pool: { total: number; idle: number; waiting: number };
    queryLatency: LatencyStats & { count: number };
    writeLatency: LatencyStats & { count: number };
    readLatency: LatencyStats & { count: number };
    totalQueries: number;
    slowQueries: number;
  };
  rpc: {
    endpointCount: number;
    endpoints: {
      url: string;
      healthy: boolean;
      successes: number;
      failures: number;
      latency: LatencyStats;
      weight: number;
    }[];
  };
  caches?: {
    stats: {
      refreshIntervalMs: number;
      nextRefreshMs: number;
      expiresAt: number;
    } | null;
    activity: {
      key: string;
      nextRefreshMs: number;
      expiresAt: number;
    }[];
    queryCache: {
      size: number;
      entries: {
        key: string;
        nextRefreshMs: number;
        expiresAt: number;
      }[];
    };
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

// ---- Governance ----

export interface GovernanceReferendum {
  ref_index: number;
  block_height: number;
  threshold: string | null;
  status: string;
  end_block: number | null;
  vote_count: string;
  aye_count: string;
  nay_count: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceVote {
  id: number;
  ref_index?: number;
  proposal_hash?: string;
  block_height: number;
  voter: string;
  is_aye: boolean;
  conviction?: number;
  balance?: string;
  created_at: string;
}

export interface GovernanceProposal {
  proposal_index: number;
  block_height: number;
  deposit: string;
  status: string;
  referendum_index: number | null;
  created_at: string;
  updated_at: string;
}

export interface GovernanceMotion {
  proposal_index: number;
  proposal_hash: string;
  block_height: number;
  proposer: string;
  threshold: number;
  aye_count: number;
  nay_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface GovernanceSummary {
  referenda: Record<string, number>;
  proposals: Record<string, number>;
  council: Record<string, number>;
  techcomm: Record<string, number>;
}

export async function getGovernanceSummary(): Promise<GovernanceSummary> {
  return fetchJson("/api/governance/summary");
}

export async function getReferenda(
  limit = 25,
  offset = 0,
  status?: string,
): Promise<{ data: GovernanceReferendum[]; total: number }> {
  const params = `limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`;
  return fetchJson(`/api/governance/referenda?${params}`);
}

export async function getReferendum(
  refIndex: number,
): Promise<{ referendum: GovernanceReferendum; votes: GovernanceVote[] }> {
  return fetchJson(`/api/governance/referenda/${refIndex}`);
}

export async function getDemocracyProposals(
  limit = 25,
  offset = 0,
  status?: string,
): Promise<{ data: GovernanceProposal[]; total: number }> {
  const params = `limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`;
  return fetchJson(`/api/governance/proposals?${params}`);
}

export async function getCouncilMotions(
  limit = 25,
  offset = 0,
  status?: string,
): Promise<{ data: GovernanceMotion[]; total: number }> {
  const params = `limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`;
  return fetchJson(`/api/governance/council/motions?${params}`);
}

export async function getCouncilMotion(
  index: number,
): Promise<{ motion: GovernanceMotion; votes: GovernanceVote[] }> {
  return fetchJson(`/api/governance/council/motions/${index}`);
}

export async function getTechCommProposals(
  limit = 25,
  offset = 0,
  status?: string,
): Promise<{ data: GovernanceMotion[]; total: number }> {
  const params = `limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`;
  return fetchJson(`/api/governance/techcomm/proposals?${params}`);
}

export async function getTechCommProposal(
  index: number,
): Promise<{ proposal: GovernanceMotion; votes: GovernanceVote[] }> {
  return fetchJson(`/api/governance/techcomm/proposals/${index}`);
}

// ---- Assets ----

export interface Asset {
  asset_id: number;
  owner: string | null;
  admin: string | null;
  issuer: string | null;
  freezer: string | null;
  name: string | null;
  symbol: string | null;
  decimals: number;
  is_frozen: boolean;
  supply: string;
  status: string;
  created_block: number;
  updated_block: number;
  created_at: string;
  updated_at: string;
}

export interface AssetTransfer {
  id: number;
  asset_id: number;
  block_height: number;
  extrinsic_id: string | null;
  from_address: string;
  to_address: string;
  amount: string;
  created_at: string;
}

export async function getAssets(
  limit = 25,
  offset = 0,
  status?: string,
): Promise<{ data: Asset[]; total: number }> {
  const params = `limit=${limit}&offset=${offset}${status ? `&status=${status}` : ""}`;
  return fetchJson(`/api/assets?${params}`);
}

export async function getAsset(
  assetId: number,
): Promise<{ asset: Asset; recentTransfers: AssetTransfer[] }> {
  return fetchJson(`/api/assets/${assetId}`);
}

export async function getAssetTransfers(
  assetId: number,
  limit = 25,
  offset = 0,
): Promise<{ data: AssetTransfer[]; total: number }> {
  return fetchJson(`/api/assets/${assetId}/transfers?limit=${limit}&offset=${offset}`);
}

// ---- XCM ----

export interface XcmMessage {
  id: number;
  message_hash: string | null;
  message_id: string | null;
  direction: "inbound" | "outbound";
  protocol: "HRMP" | "UMP" | "DMP";
  origin_para_id: number | null;
  dest_para_id: number | null;
  sender: string | null;
  success: boolean | null;
  block_height: number;
  extrinsic_id: string | null;
  created_at: string;
}

export interface XcmTransfer {
  id: number;
  xcm_message_id: number;
  direction: "inbound" | "outbound";
  from_chain_id: number | null;
  to_chain_id: number | null;
  from_address: string | null;
  to_address: string | null;
  asset_id: string | null;
  asset_symbol: string | null;
  amount: string;
  block_height: number;
  extrinsic_id: string | null;
  created_at: string;
  message_hash: string | null;
  protocol: string | null;
}

export interface XcmChannel {
  id: number;
  from_para_id: number;
  to_para_id: number;
  status: string;
  message_count: number;
  transfer_count: number;
  first_seen_block: number | null;
  last_seen_block: number | null;
}

export interface XcmSummary {
  messages: Record<string, Record<string, number>>;
  transfers: Record<string, { count: number; assets: number }>;
  channelCount: number;
}

export async function getXcmMessages(
  limit = 25,
  offset = 0,
  opts?: { direction?: string; protocol?: string; chain_id?: number },
): Promise<{ data: XcmMessage[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (opts?.direction) params.set("direction", opts.direction);
  if (opts?.protocol) params.set("protocol", opts.protocol);
  if (opts?.chain_id != null) params.set("chain_id", String(opts.chain_id));
  return fetchJson(`/api/xcm/messages?${params}`);
}

export async function getXcmTransfers(
  limit = 25,
  offset = 0,
  opts?: { direction?: string; asset?: string; from_chain?: number; to_chain?: number; address?: string },
): Promise<{ data: XcmTransfer[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (opts?.direction) params.set("direction", opts.direction);
  if (opts?.asset) params.set("asset", opts.asset);
  if (opts?.from_chain != null) params.set("from_chain", String(opts.from_chain));
  if (opts?.to_chain != null) params.set("to_chain", String(opts.to_chain));
  if (opts?.address) params.set("address", opts.address);
  return fetchJson(`/api/xcm/transfers?${params}`);
}

export async function getXcmChannels(): Promise<{ data: XcmChannel[] }> {
  return fetchJson(`/api/xcm/channels`);
}

export async function getXcmChannelDetail(
  fromParaId: number,
  toParaId: number,
): Promise<{ channel: XcmChannel; recentMessages: XcmMessage[]; recentTransfers: XcmTransfer[] }> {
  return fetchJson(`/api/xcm/channels/${fromParaId}-${toParaId}`);
}

export async function getXcmSummary(): Promise<XcmSummary> {
  return fetchJson(`/api/xcm/summary`);
}
