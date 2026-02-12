import { getAccount, type OnChainIdentity } from "@/lib/api";
import { AccountActivity } from "@/components/AccountActivity";
import { AddressDisplay } from "@/components/AddressDisplay";
import { Identicon } from "@/components/Identicon";
import { formatBalance } from "@/lib/format";
import { theme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * Account Detail Page — Server Component
 * Shows address header with on-chain identity, balance breakdown,
 * asset balances, and tabbed transaction history.
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

  return (
    <div className="space-y-6">
      {/* Address header with identity */}
      <div className="flex items-center gap-3">
        {/* Polkadot Identicon */}
        <Identicon address={account.address} size={48} className="shrink-0" />
        <div className="min-w-0 flex-1">
          {identity?.display ? (
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-100">{identity.display}</h1>
              {hasVerification && (
                <span title="Verified identity" className="flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  Verified
                </span>
              )}
            </div>
          ) : null}
          <AddressDisplay
            address={account.address}
            className="text-sm font-mono text-zinc-400 break-all"
          />
          {/* Identity quick icons */}
          {identity && <IdentityIcons identity={identity} />}
        </div>
      </div>

      {/* On-chain Identity card */}
      {identity && <IdentityCard identity={identity} />}

      {/* Account detail card */}
      <div className="card space-y-3">
        <DetailRow label="Address">
          <AddressDisplay
            address={account.address}
            className="text-sm font-mono text-zinc-200 break-all"
          />
        </DetailRow>
      </div>

      {/* Native balance breakdown */}
      <div className="card space-y-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Native Balance ({symbol})
        </h2>
        <BalanceRow label="Total Balance" value={total.toString()} decimals={decimals} symbol={symbol} primary />
        <BalanceRow label="Transferrable" value={transferable.toString()} decimals={decimals} symbol={symbol} />
        <BalanceRow label="Locked" value={frozen.toString()} decimals={decimals} symbol={symbol} />
        <BalanceRow label="Reserved" value={reserved.toString()} decimals={decimals} symbol={symbol} />
      </div>

      {/* Non-native asset balances */}
      {assetBalances && assetBalances.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Assets</h2>
          <div className="divide-y divide-zinc-800">
            {assetBalances.map((asset) => (
              <div key={asset.assetId} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-200">{asset.symbol}</span>
                  {asset.name && asset.name !== asset.symbol && (
                    <span className="text-xs text-zinc-500">{asset.name}</span>
                  )}
                  {asset.status !== "Liquid" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                      {asset.status}
                    </span>
                  )}
                </div>
                <span className="text-sm font-mono tabular-nums text-zinc-200">
                  {formatBalance(asset.balance, asset.decimals, asset.symbol)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity tabs: Extrinsics + Transfers */}
      <AccountActivity address={address} extrinsics={recentExtrinsics} />
    </div>
  );
}

// ---- Identity Icons (quick row of icons showing which fields are set) ----

function IdentityIcons({ identity }: { identity: OnChainIdentity }) {
  const icons: Array<{ label: string; icon: React.ReactNode; set: boolean }> = [
    { label: "Email", set: !!identity.email, icon: <EmailIcon /> },
    { label: "Web", set: !!identity.web, icon: <WebIcon /> },
    { label: "Twitter / X", set: !!identity.twitter, icon: <TwitterIcon /> },
    { label: "Riot / Matrix", set: !!identity.riot, icon: <RiotIcon /> },
    {
      label: "Discord",
      set: identity.additional.some((a) => a.key.toLowerCase() === "discord"),
      icon: <DiscordIcon />,
    },
  ];

  const active = icons.filter((i) => i.set);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {active.map((i) => (
        <span key={i.label} title={i.label} className="text-zinc-400 hover:text-zinc-200 transition-colors">
          {i.icon}
        </span>
      ))}
    </div>
  );
}

// ---- Identity Card (full details) ----

function IdentityCard({ identity }: { identity: OnChainIdentity }) {
  const fields: Array<{ label: string; value: string | null; href?: string; icon: React.ReactNode }> = [];

  if (identity.display) fields.push({ label: "Display Name", value: identity.display, icon: <NameIcon /> });
  if (identity.legal) fields.push({ label: "Legal Name", value: identity.legal, icon: <LegalIcon /> });
  if (identity.email)
    fields.push({
      label: "Email",
      value: identity.email,
      href: `mailto:${identity.email}`,
      icon: <EmailIcon />,
    });
  if (identity.web)
    fields.push({
      label: "Web",
      value: identity.web,
      href: identity.web.startsWith("http") ? identity.web : `https://${identity.web}`,
      icon: <WebIcon />,
    });
  if (identity.twitter)
    fields.push({
      label: "Twitter / X",
      value: identity.twitter.startsWith("@") ? identity.twitter : `@${identity.twitter}`,
      href: `https://x.com/${identity.twitter.replace(/^@/, "")}`,
      icon: <TwitterIcon />,
    });
  if (identity.riot)
    fields.push({ label: "Riot / Matrix", value: identity.riot, icon: <RiotIcon /> });

  // Additional fields (e.g. discord)
  for (const { key, value } of identity.additional) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "discord") {
      fields.push({ label: "Discord", value, icon: <DiscordIcon /> });
    } else {
      fields.push({ label: key, value, icon: <AdditionalIcon /> });
    }
  }

  if (identity.image) fields.push({ label: "Image", value: identity.image, icon: <ImageIcon /> });

  // Judgements
  const judgements = identity.judgements.filter((j) => j.judgement !== "Unknown");

  if (fields.length === 0 && judgements.length === 0) return null;

  return (
    <div className="card space-y-3">
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        On-chain Identity
      </h2>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-zinc-500 shrink-0 mt-0.5 w-4 h-4">{f.icon}</span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 min-w-0">
              <span className="text-xs text-zinc-500 sm:w-28 shrink-0">{f.label}</span>
              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline break-all"
                >
                  {f.value}
                </a>
              ) : (
                <span className="text-sm text-zinc-200 break-all">{f.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Judgements */}
      {judgements.length > 0 && (
        <div className="pt-2 border-t border-zinc-800">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500">Judgements:</span>
            {judgements.map((j, i) => (
              <span
                key={i}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  j.judgement === "KnownGood"
                    ? "bg-green-500/15 text-green-400 border border-green-500/25"
                    : j.judgement === "Reasonable"
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/25"
                      : j.judgement === "Erroneous" || j.judgement === "LowQuality"
                        ? "bg-red-500/15 text-red-400 border border-red-500/25"
                        : "bg-zinc-700/50 text-zinc-400 border border-zinc-600/50"
                }`}
              >
                #{j.registrarIndex}: {j.judgement}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- SVG Icons for identity fields ----

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

function NameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function LegalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
    </svg>
  );
}

function AdditionalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  );
}

// ---- Shared layout helpers ----

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs text-zinc-500 sm:w-32 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function BalanceRow({
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="text-xs text-zinc-500 sm:w-32 shrink-0">{label}</span>
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
