import type { ChainConfig, ExplorerConfig } from "./types.js";

/** Default chain configurations */
export const DEFAULT_CHAINS: ChainConfig[] = [
  {
    id: "polkadot",
    name: "Polkadot",
    rpc: ["wss://rpc.polkadot.io"],
    addressPrefix: 0,
    tokenSymbol: "DOT",
    tokenDecimals: 10,
    colorTheme: "#E6007A",
  },
  {
    id: "kusama",
    name: "Kusama",
    rpc: ["wss://kusama-rpc.polkadot.io"],
    addressPrefix: 2,
    tokenSymbol: "KSM",
    tokenDecimals: 12,
    colorTheme: "#000000",
  },
  {
    id: "assethub",
    name: "Asset Hub",
    rpc: ["wss://polkadot-asset-hub-rpc.polkadot.io"],
    addressPrefix: 0,
    tokenSymbol: "DOT",
    tokenDecimals: 10,
    colorTheme: "#48CC81",
    isParachain: true,
    relayChain: "polkadot",
  },
  {
    id: "ajuna",
    name: "Ajuna Network",
    rpc: ["wss://rpc-para.ajuna.network"],
    addressPrefix: 1328,
    tokenSymbol: "AJUN",
    tokenDecimals: 12,
    colorTheme: "#F0388B",
    isParachain: true,
    relayChain: "polkadot",
  },
];

export const DEFAULT_CONFIG: ExplorerConfig = {
  chains: DEFAULT_CHAINS,
  defaultChain: "polkadot",
};

/** Get chain config by ID */
export function getChainConfig(
  config: ExplorerConfig,
  chainId: string
): ChainConfig | undefined {
  return config.chains.find((c) => c.id === chainId);
}

/** Format a token amount with proper decimals */
export function formatTokenAmount(
  raw: string | bigint,
  decimals: number,
  symbol: string
): string {
  const value = typeof raw === "string" ? BigInt(raw) : raw;
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const remainder = value % divisor;
  const decimal = remainder.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole}.${decimal} ${symbol}`;
}

/** Detect search input type heuristically */
export function detectSearchType(
  input: string
): "hash" | "blockNumber" | "address" | "unknown" {
  const trimmed = input.trim();

  // Block hash: starts with 0x and is 66 chars (32 bytes)
  if (trimmed.startsWith("0x") && trimmed.length === 66) {
    return "hash";
  }

  // Block number: purely numeric
  if (/^\d+$/.test(trimmed)) {
    return "blockNumber";
  }

  // SS58 address: starts with a character and is 46-48 chars
  if (/^[1-9A-HJ-NP-Za-km-z]{46,48}$/.test(trimmed)) {
    return "address";
  }

  // Ethereum-style address (for EVM parachains)
  if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return "address";
  }

  return "unknown";
}

/** Truncate a hash for display: 0x1234...abcd */
export function truncateHash(hash: string, chars: number = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

/** Format a Unix timestamp to human-readable relative time */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
