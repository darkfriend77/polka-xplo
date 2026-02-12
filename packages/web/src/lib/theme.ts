import { DEFAULT_CHAINS, type ChainConfig, type ChainSocialLinks } from "@polka-xplo/shared";

/**
 * Theme / branding configuration for the explorer.
 *
 * Resolved at build-time from the NEXT_PUBLIC_CHAIN_ID env var
 * (or CHAIN_ID for server components). Falls back to "ajuna".
 */

export interface ThemeConfig {
  /** Chain identifier */
  chainId: string;
  /** Display name shown in header, footer, page titles */
  name: string;
  /** Primary accent colour (hex) */
  accentColor: string;
  /** Path to logo image (relative to /public or absolute URL) */
  logo: string | null;
  /** Native token symbol */
  tokenSymbol: string;
  /** Native token decimals */
  tokenDecimals: number;
  /** SS58 address prefix */
  addressPrefix: number;
  /** Optional banner image shown behind the header navigation */
  banner: string | null;
  /** Optional brand wordmark image used in place of logo + chain name */
  brand: string | null;
  /** Social / external links (website, twitter, discord, telegram, github) */
  socialLinks: ChainSocialLinks;
  /** Whether this chain is a parachain */
  isParachain: boolean;
  /** Name of the relay chain (e.g. "polkadot", "kusama") */
  relayChain: string | null;
}

/** Derive a ThemeConfig from a ChainConfig */
function fromChain(chain: ChainConfig): ThemeConfig {
  return {
    chainId: chain.id,
    name: chain.name,
    accentColor: chain.colorTheme,
    logo: chain.logo ?? null,
    banner: chain.banner ?? null,
    brand: chain.brand ?? null,
    socialLinks: chain.socialLinks ?? {},
    tokenSymbol: chain.tokenSymbol,
    tokenDecimals: chain.tokenDecimals,
    addressPrefix: chain.addressPrefix,
    isParachain: chain.isParachain ?? false,
    relayChain: chain.relayChain ?? null,
  };
}

/** Fallback theme when no chain is matched */
const FALLBACK_THEME: ThemeConfig = {
  chainId: "explorer",
  name: "Block Explorer",
  accentColor: "#E6007A",
  logo: null,
  banner: null,
  brand: null,
  socialLinks: {},
  tokenSymbol: "UNIT",
  tokenDecimals: 12,
  addressPrefix: 42,
  isParachain: false,
  relayChain: null,
};

/**
 * Resolve the active theme.
 *
 * Reads NEXT_PUBLIC_CHAIN_ID (client & server) or CHAIN_ID (server only).
 * Looks up the matching chain in DEFAULT_CHAINS; falls back to a generic theme.
 */
export function getTheme(): ThemeConfig {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID ?? process.env.CHAIN_ID ?? "";

  if (!chainId) return FALLBACK_THEME;

  const chain = DEFAULT_CHAINS.find((c) => c.id === chainId);
  return chain ? fromChain(chain) : FALLBACK_THEME;
}

/** Singleton so we only resolve once per request / module load */
export const theme = getTheme();
