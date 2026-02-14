import { getXcmTransfers, type XcmTransfer } from "@/lib/api";
import { truncateHash } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

function paraName(id: number | null): string {
  if (id === null) return "Relay Chain";
  const names: Record<number, string> = {
    0: "This Chain",
    1000: "AssetHub",
    2000: "Acala",
    2004: "Moonbeam",
    2006: "Astar",
    2030: "Bifrost",
    2034: "Hydration",
    2051: "Ajuna",
  };
  return names[id] ?? `Para #${id}`;
}

function formatAmount(amount: string, symbol: string | null): string {
  // Try to format nicely if we know the decimals
  const sym = symbol ?? "";
  const num = BigInt(amount);
  if (num === 0n) return `0 ${sym}`.trim();

  // Common decimals by symbol
  const decMap: Record<string, number> = {
    DOT: 10,
    AJUN: 12,
    USDC: 6,
    USDT: 6,
    USDt: 6,
  };
  const dec = sym ? (decMap[sym] ?? 12) : 12;

  const divisor = 10n ** BigInt(dec);
  const whole = num / divisor;
  const frac = num % divisor;

  if (frac === 0n) return `${whole.toLocaleString()} ${sym}`.trim();

  const fracStr = frac.toString().padStart(dec, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)} ${sym}`.trim();
}

export default async function XcmTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; direction?: string; asset?: string }>;
}) {
  const { page: pageStr, direction, asset } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  let transfers: XcmTransfer[] = [];
  let total = 0;
  let error: string | null = null;

  // Known asset symbols for filter buttons
  const knownAssets = ["AJUN", "DOT", "USDt", "USDC"];

  try {
    const res = await getXcmTransfers(limit, offset, { direction, asset });
    transfers = res.data;
    total = res.total;
  } catch {
    error = "Unable to load XCM transfers. Is the ext-xcm extension active?";
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/xcm" className="text-xs text-accent hover:underline">
          ← XCM
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Transfers</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          {total.toLocaleString()} cross-chain transfer{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Direction Filters */}
      <div className="flex gap-2 flex-wrap">
        <FilterLink label="All" href={`/xcm/transfers${asset ? `?asset=${asset}` : ""}`} active={!direction} />
        <FilterLink label="Received" href={`/xcm/transfers?direction=inbound${asset ? `&asset=${asset}` : ""}`} active={direction === "inbound"} />
        <FilterLink label="Sent" href={`/xcm/transfers?direction=outbound${asset ? `&asset=${asset}` : ""}`} active={direction === "outbound"} />
      </div>

      {/* Asset Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs text-zinc-500">Asset:</span>
        <FilterLink label="All" href={`/xcm/transfers${direction ? `?direction=${direction}` : ""}`} active={!asset} />
        {knownAssets.map((sym) => (
          <FilterLink
            key={sym}
            label={sym}
            href={`/xcm/transfers?asset=${sym}${direction ? `&direction=${direction}` : ""}`}
            active={asset === sym}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {transfers.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">Message</th>
                <th className="pb-2 pr-4">Direction</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4 text-right">Value</th>
                <th className="pb-2 pr-4">Block</th>
                <th className="pb-2">Protocol</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-800/30">
                  <td className="py-2 pr-4 font-mono text-xs text-accent">
                    {t.message_hash ? truncateHash(t.message_hash) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <DirectionBadge direction={t.direction} />
                  </td>
                  <td className="py-2 pr-4 text-zinc-300 text-xs">
                    <div>
                      {t.from_chain_id != null && (
                        <span className="text-zinc-500 text-[10px] block">{paraName(t.from_chain_id)}</span>
                      )}
                      {t.from_address ? (
                        <Link href={`/account/${t.from_address}`} className="text-accent hover:underline font-mono">
                          {truncateHash(t.from_address)}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-zinc-300 text-xs">
                    <div>
                      {t.to_chain_id != null && (
                        <span className="text-zinc-500 text-[10px] block">{paraName(t.to_chain_id)}</span>
                      )}
                      {t.to_address ? (
                        <Link href={`/account/${t.to_address}`} className="text-accent hover:underline font-mono">
                          {truncateHash(t.to_address)}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-xs text-zinc-200">
                    {formatAmount(t.amount, t.asset_symbol)}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/block/${t.block_height}`} className="text-accent hover:underline font-mono text-xs">
                      #{t.block_height.toLocaleString()}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span className="text-xs text-zinc-500">{t.protocol ?? "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/xcm/transfers?page=${page - 1}${direction ? `&direction=${direction}` : ""}${asset ? `&asset=${asset}` : ""}`}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700"
            >
              ← Prev
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/xcm/transfers?page=${page + 1}${direction ? `&direction=${direction}` : ""}${asset ? `&asset=${asset}` : ""}`}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const color = direction === "inbound" ? "text-blue-400 bg-blue-950/50" : "text-orange-400 bg-orange-950/50";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
      {direction === "inbound" ? "↓ IN" : "↑ OUT"}
    </span>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        active
          ? "bg-accent/20 text-accent border border-accent/30"
          : "text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-600"
      }`}
    >
      {label}
    </Link>
  );
}
