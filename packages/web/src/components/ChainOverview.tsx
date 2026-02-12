import Image from "next/image";
import type { ChainStats } from "@/lib/api";
import type { ThemeConfig } from "@/lib/theme";
import type { ChainSocialLinks } from "@polka-xplo/shared";
import { formatNumber, formatBalance } from "@/lib/format";

/**
 * SVG icon component for chain data entries.
 */
function ChainDataIcon({ d }: { d: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-accent shrink-0"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  finalized:
    "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  extrinsics:
    "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  transfers: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  accounts:
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  paraId:
    "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  relay:
    "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  deposit:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  decimals:
    "M7 20l4-16m2 16l4-16M6 9h14M4 15h14",
};

/**
 * Social / external link icons.
 * Used in the Basic Info panel for chain links.
 */
function SocialLinks({ socialLinks }: { socialLinks: ChainSocialLinks }) {
  const links: { icon: string; href: string; label: string }[] = [];

  if (socialLinks.website) links.push({ icon: "web", href: socialLinks.website, label: "Website" });
  if (socialLinks.twitter) links.push({ icon: "x", href: socialLinks.twitter, label: "X" });
  if (socialLinks.telegram) links.push({ icon: "telegram", href: socialLinks.telegram, label: "Telegram" });
  if (socialLinks.github) links.push({ icon: "github", href: socialLinks.github, label: "GitHub" });
  if (socialLinks.discord) links.push({ icon: "discord", href: socialLinks.discord, label: "Discord" });

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-3 mt-3">
      {links.map((link) => (
        <a
          key={link.icon}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          title={link.label}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <SocialIcon type={link.icon} />
        </a>
      ))}
    </div>
  );
}

function SocialIcon({ type }: { type: string }) {
  const size = 16;
  switch (type) {
    case "web":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    case "x":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "telegram":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      );
    case "github":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      );
    case "discord":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1569 2.4189z" />
        </svg>
      );
    default:
      return null;
  }
}

interface ChainOverviewProps {
  theme: ThemeConfig;
  stats: ChainStats;
  specVersion: number | null;
}

/**
 * Chain overview panel for the home page — Subscan-style two-section layout:
 *   Left:  Basic Info (spec version, logo, token, social links)
 *   Right: Chain Data (finalized blocks, extrinsics, transfers, accounts, parachain info)
 */
export function ChainOverview({ theme, stats, specVersion }: ChainOverviewProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Basic Info ─────────────────────────────────────── */}
      <div className="card p-5 lg:col-span-1 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-400 tracking-wide uppercase flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Basic Info
        </h3>

        {specVersion !== null && (
          <div className="text-xs text-zinc-400">
            Spec Version: <span className="text-accent font-mono font-semibold">{specVersion}</span>
          </div>
        )}

        {/* Logo + token info */}
        <div className="flex items-center gap-3 mt-2">
          {theme.logo && (
            <Image
              src={theme.logo}
              alt={theme.name}
              width={40}
              height={40}
              className="rounded-full"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-zinc-100">{theme.name}</p>
            <p className="text-xs text-zinc-400">{theme.tokenSymbol}</p>
          </div>
        </div>

        {/* Social / external links */}
        <SocialLinks socialLinks={theme.socialLinks} />
      </div>

      {/* ── Chain Data ─────────────────────────────────────── */}
      <div className="card p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold text-zinc-400 tracking-wide uppercase flex items-center gap-2 mb-5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Chain Data
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
          <DataItem
            icon={ICONS.finalized}
            label="Finalized Blocks"
            value={formatNumber(stats.finalizedBlock)}
          />
          <DataItem
            icon={ICONS.extrinsics}
            label="Signed Extrinsics"
            value={formatNumber(stats.signedExtrinsics)}
          />
          <DataItem
            icon={ICONS.transfers}
            label="Transfers"
            value={formatNumber(stats.transfers)}
          />
          <DataItem
            icon={ICONS.accounts}
            label="Total Accounts"
            value={formatNumber(stats.totalAccounts)}
          />
          <DataItem
            icon={ICONS.deposit}
            label="Existential Deposit"
            value={formatBalance(stats.existentialDeposit, stats.tokenDecimals, theme.tokenSymbol)}
          />
          <DataItem
            icon={ICONS.decimals}
            label="Token Decimals"
            value={String(stats.tokenDecimals)}
          />
          <DataItem
            icon={ICONS.relay}
            label="Relay Chain"
            value={theme.relayChain ? theme.relayChain.charAt(0).toUpperCase() + theme.relayChain.slice(1) : "\u2014"}
          />
          <DataItem
            icon={ICONS.paraId}
            label="Para ID"
            value={stats.paraId !== null ? formatNumber(stats.paraId) : "\u2014"}
          />
        </div>
      </div>
    </div>
  );
}

function DataItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <ChainDataIcon d={icon} />
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 leading-tight">{label}</p>
        <p className="text-sm font-semibold text-zinc-100 tabular-nums">{value}</p>
      </div>
    </div>
  );
}
