// ============================================================
// Core Domain Types for the Polkadot Explorer
// ============================================================

/** Block status representing finality */
export type BlockStatus = "best" | "finalized";

/** Parsed digest log from a block header */
export interface DigestLog {
  type: string; // "preRuntime" | "consensus" | "seal" | "other" | "runtimeEnvironmentUpdated"
  engine: string | null; // 4-byte ASCII engine id, e.g. "aura", "FRNK"
  data: string; // hex-encoded payload
}

/** Core block record stored in the database */
export interface Block {
  height: number;
  hash: string;
  parentHash: string;
  stateRoot: string;
  extrinsicsRoot: string;
  timestamp: number | null;
  validatorId: string | null;
  status: BlockStatus;
  specVersion: number;
  eventCount: number;
  extrinsicCount: number;
  digestLogs: DigestLog[];
}

/** Decoded extrinsic record */
export interface Extrinsic {
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
  tip: string | null;
}

/** Decoded event record */
export interface ExplorerEvent {
  id: string;
  blockHeight: number;
  extrinsicId: string | null;
  index: number;
  module: string;
  event: string;
  data: Record<string, unknown>;
  phase: EventPhase;
}

export type EventPhase =
  | { type: "ApplyExtrinsic"; index: number }
  | { type: "Finalization" }
  | { type: "Initialization" };

/** Account record with balance breakdown */
export interface Account {
  address: string;
  publicKey: string;
  identity: AccountIdentity | null;
  lastActiveBlock: number;
  createdAtBlock: number;
}

export interface AccountIdentity {
  display: string | null;
  email: string | null;
  web: string | null;
  twitter: string | null;
  riot: string | null;
}

/** Balance breakdown matching Substrate's Account data */
export interface AccountBalance {
  free: string;
  reserved: string;
  frozen: string;
  flags: string;
}

// ============================================================
// Chain Configuration Types
// ============================================================

/** Social / external links for a chain */
export interface ChainSocialLinks {
  website?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;
  github?: string;
}

export interface ChainConfig {
  id: string;
  name: string;
  rpc: string[];
  addressPrefix: number;
  tokenSymbol: string;
  tokenDecimals: number;
  colorTheme: string;
  /** Optional path to a logo image (relative to /public or absolute URL) */
  logo?: string;
  /** Optional path to a banner image shown behind the header (relative to /public or absolute URL) */
  banner?: string;
  /** Optional path to a brand wordmark image used in place of logo + name text */
  brand?: string;
  /** Optional social / external links shown on the homepage */
  socialLinks?: ChainSocialLinks;
  isParachain?: boolean;
  relayChain?: string;
  addressType?: "SS58" | "H160";
}

export interface ExplorerConfig {
  chains: ChainConfig[];
  defaultChain: string;
}

// ============================================================
// Search Types
// ============================================================

export type SearchInputType = "hash" | "blockNumber" | "address" | "unknown";

export interface SearchResult {
  type: "block" | "extrinsic" | "account";
  id: string;
  label: string;
  url: string;
}

// ============================================================
// Plugin/Extension Types
// ============================================================

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  palletId: string;
  supportedEvents: string[];
  supportedCalls: string[];
  dependencies?: string[];
}

export interface BlockContext {
  blockHeight: number;
  blockHash: string;
  timestamp: number | null;
  specVersion: number;
}

export type EventHandler = (ctx: BlockContext, event: ExplorerEvent) => Promise<void>;

export type ExtrinsicHandler = (ctx: BlockContext, extrinsic: Extrinsic) => Promise<void>;

export type BlockHandler = (ctx: BlockContext, block: Block) => Promise<void>;

export interface PalletExtension {
  manifest: ExtensionManifest;
  onEvent?: EventHandler;
  onExtrinsic?: ExtrinsicHandler;
  onBlock?: BlockHandler;
  getMigrationSQL?: () => string;
}

// ============================================================
// API Response Types
// ============================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface BlockDetailResponse {
  block: Block;
  extrinsics: Extrinsic[];
  events: ExplorerEvent[];
}

export interface AccountDetailResponse {
  account: Account;
  balance: AccountBalance;
  recentExtrinsics: Extrinsic[];
  recentEvents: ExplorerEvent[];
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  nodeConnected: boolean;
  syncLag: number;
  dbConnected: boolean;
  chainTip: number;
  indexedTip: number;
  timestamp: number;
}

// ============================================================
// Indexer State Types
// ============================================================

export type IndexerState = "idle" | "syncing" | "live" | "error";

export interface IndexerStatus {
  state: IndexerState;
  chainId: string;
  lastFinalizedBlock: number;
  lastBestBlock: number;
  chainTip: number;
  syncProgress: number;
  startedAt: number;
  errors: string[];
}
