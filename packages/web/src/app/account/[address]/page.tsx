import { getAccount } from "@/lib/api";
import { ExtrinsicList } from "@/components/ExtrinsicList";
import { AddressDisplay } from "@/components/AddressDisplay";
import { formatNumber, formatBalance } from "@/lib/format";
import { theme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * Account Detail Page — Server Component
 * Matches statescan account view: address header, balance breakdown,
 * and tabbed transaction history. Addresses display in SS58 format
 * using the client-side prefix selector.
 */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
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

  const { account, balance, recentExtrinsics } = data;

  // Balance computations
  const free = BigInt(balance?.free || "0");
  const reserved = BigInt(balance?.reserved || "0");
  const frozen = BigInt(balance?.frozen || "0");
  const transferable = free > frozen ? free - frozen : BigInt(0);
  const total = free + reserved;

  // Token config from theme
  const decimals = theme.tokenDecimals;
  const symbol = theme.tokenSymbol;

  return (
    <div className="space-y-6">
      {/* Address header */}
      <div className="flex items-center gap-3">
        {/* Identicon placeholder */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-polkadot-purple flex items-center justify-center text-white text-sm font-bold shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div className="min-w-0">
          {account.identity?.display && (
            <h1 className="text-lg font-bold text-zinc-100">
              {account.identity.display}
            </h1>
          )}
        </div>
      </div>

      {/* Account detail card */}
      <div className="card space-y-3">
        <DetailRow label="Address">
          <AddressDisplay
            address={account.address}
            className="text-sm font-mono text-zinc-200 break-all"
          />
        </DetailRow>
      </div>

      {/* Balance breakdown — statescan style */}
      <div className="card space-y-3">
        <BalanceRow
          label="Total Balance"
          value={total.toString()}
          decimals={decimals}
          symbol={symbol}
          primary
        />
        <BalanceRow
          label="Transferrable"
          value={transferable.toString()}
          decimals={decimals}
          symbol={symbol}
        />
        <BalanceRow
          label="Locked"
          value={frozen.toString()}
          decimals={decimals}
          symbol={symbol}
        />
        <BalanceRow
          label="Reserved"
          value={reserved.toString()}
          decimals={decimals}
          symbol={symbol}
        />
      </div>

      {/* Transactions tab */}
      <section>
        <div className="flex gap-1 mb-4 border-b border-zinc-800">
          <span className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-zinc-100 border-b-2 border-[var(--color-accent)] -mb-px">
            Extrinsics
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-zinc-700 text-zinc-200">
              {recentExtrinsics.length}
            </span>
          </span>
        </div>
        <div className="card">
          <ExtrinsicList extrinsics={recentExtrinsics} />
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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
