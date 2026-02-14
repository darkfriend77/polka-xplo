import { getAccount, type OnChainIdentity } from "@/lib/api";
import { AccountActivity } from "@/components/AccountActivity";
import { AddressDisplay } from "@/components/AddressDisplay";
import { Identicon } from "@/components/Identicon";
import { formatBalance, formatNumber } from "@/lib/format";
import { theme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * Account Detail Page — Server Component
 * Three-panel overview (identity, stats, balance) plus activity tabs.
 */
export default async function AccountPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  let data;

  try {
    data = await getAccount(address);
  } catch {
    return (
      <div className="text-center py-20 text-zinc-500">
        Account not found or indexer unavailable.
      </div>
    );
  }

  const { account, balance, identity, assetBalances, recentExtrinsics } = data;

  // Balance computations
  const free = BigInt(balance?.free || "0");
  const reserved = BigInt(balance?.reserved || "0");
  const frozen = BigInt(balance?.frozen || "0");
  const transferable = free > frozen ? free - frozen : BigInt(0);
  const total = free + reserved;

  // Token config from theme
  const decimals = theme.tokenDecimals;
  const symbol = theme.tokenSymbol;

  // Best judgement level
  const hasVerification = identity?.judgements?.some(
    (j) => j.judgement === "Reasonable" || j.judgement === "KnownGood",
  );

  // Compute stats
  const extrinsicCount = recentExtrinsics?.length ?? 0;
  const assetCount = assetBalances?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Three-panel overview row ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Panel 1 — Basic Info / Identity */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-zinc-400 tracking-wide uppercase flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            Basic Info
          </h3>

          {/* Identicon + identity display */}
          <div className="flex items-center gap-3">
            <Identicon address={account.address} size={44} className="shrink-0" />
            <div className="min-w-0">
              {identity?.display ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-zinc-100">{identity.display}</p>
                  {hasVerification && (
                    <span title="Verified identity" className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      Verified
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No on-chain identity</p>
              )}
              {identity?.legal && (
                <p className="text-xs text-zinc-500">{identity.legal}</p>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="text-[11px] text-zinc-500">
            <AddressDisplay
              address={account.address}
              className="text-xs font-mono text-zinc-400 break-all"
            />
          </div>

          {/* Identity links */}
          {identity && <IdentityLinks identity={identity} />}
        </div>

        {/* Panel 2 — Account Stats */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-zinc-400 tracking-wide uppercase flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            Account Stats
          </h3>

          <div className="space-y-3">
            <StatItem
              icon="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"
              label="Created at Block"
              value={`#${formatNumber(account.createdAtBlock)}`}
            />
            <StatItem
              icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              label="Last Active Block"
              value={`#${formatNumber(account.lastActiveBlock)}`}
            />
            <StatItem
              icon="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              label="Recent Extrinsics"
              value={extrinsicCount.toString()}
            />
            <StatItem
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              label="Asset Types Held"
              value={assetCount.toString()}
            />
            <StatItem
              icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              label="Identity"
              value={identity ? "Set" : "None"}
            />
            {identity?.judgements && identity.judgements.length > 0 && (
              <StatItem
                icon="M5 13l4 4L19 7"
                label="Judgements"
                value={identity.judgements.map((j) => j.judgement).join(", ")}
              />
            )}
          </div>
        </div>

        {/* Panel 3 — Native Balance */}
        <div className="card p-5 space-y-4">
          <h3 className="text-xs font-semibold text-zinc-400 tracking-wide uppercase flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Native Balance ({symbol})
          </h3>

          <div className="space-y-3">
            <BalanceItem label="Total Balance" value={total.toString()} decimals={decimals} symbol={symbol} primary />
            <BalanceItem label="Transferrable" value={transferable.toString()} decimals={decimals} symbol={symbol} />
            <BalanceItem label="Locked" value={frozen.toString()} decimals={decimals} symbol={symbol} />
            <BalanceItem label="Reserved" value={reserved.toString()} decimals={decimals} symbol={symbol} />
          </div>
        </div>
      </div>

      {/* Activity tabs: Extrinsics, Transfers, Assets, XCM */}
      <AccountActivity address={address} extrinsics={recentExtrinsics} assetBalances={assetBalances} />
    </div>
  );
}

// ---- Identity Links (row of clickable social icons) ----

function IdentityLinks({ identity }: { identity: OnChainIdentity }) {
  const links: Array<{ label: string; href: string; icon: React.ReactNode }> = [];

  if (identity.web) {
    const href = identity.web.startsWith("http") ? identity.web : `https://${identity.web}`;
    links.push({ label: "Website", href, icon: <WebIcon /> });
  }
  if (identity.email) {
    links.push({ label: "Email", href: `mailto:${identity.email}`, icon: <EmailIcon /> });
  }
  if (identity.twitter) {
    links.push({
      label: "Twitter / X",
      href: `https://x.com/${identity.twitter.replace(/^@/, "")}`,
      icon: <TwitterIcon />,
    });
  }
  if (identity.riot) {
    links.push({ label: "Riot / Matrix", href: "#", icon: <RiotIcon /> });
  }
  for (const { key, value } of identity.additional) {
    if (key.toLowerCase() === "discord") {
      links.push({ label: "Discord", href: "#", icon: <DiscordIcon /> });
    }
  }

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-3 pt-1">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          title={link.label}
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}

// ---- SVG Icons for identity links ----

function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
    </svg>
  );
}

function WebIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

function RiotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
    </svg>
  );
}

// ---- Stat item for Panel 2 ----

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent shrink-0 mt-0.5"
      >
        <path d={icon} />
      </svg>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500 leading-tight">{label}</p>
        <p className="text-sm font-semibold text-zinc-100 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

// ---- Balance item for Panel 3 ----

function BalanceItem({
  label,
  value,
  decimals,
  symbol,
  primary,
}: {
  label: string;
  value: string;
  decimals: number;
  symbol: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span
        className={`text-sm font-mono tabular-nums ${
          primary ? "text-zinc-100 font-semibold" : "text-zinc-300"
        }`}
      >
        {formatBalance(value, decimals, symbol)}
      </span>
    </div>
  );
}
