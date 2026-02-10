import type { ChainStats } from "@/lib/api";
import { formatNumber } from "@/lib/format";

const ICON_PATHS: Record<string, string> = {
  blocks:
    "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
  finalized:
    "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  signed:
    "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  transfers:
    "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  issuance:
    "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  accounts:
    "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
};

function StatIcon({ name }: { name: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-zinc-500"
    >
      <path d={ICON_PATHS[name] ?? ICON_PATHS.blocks} />
    </svg>
  );
}

export function StatsBar({ stats }: { stats: ChainStats }) {
  const items = [
    { key: "blocks", label: "Latest Blocks", value: formatNumber(stats.latestBlock) },
    { key: "finalized", label: "Finalized Block", value: formatNumber(stats.finalizedBlock) },
    { key: "signed", label: "Signed Extrinsics", value: formatNumber(stats.signedExtrinsics) },
    { key: "transfers", label: "Transfers", value: formatNumber(stats.transfers) },
    { key: "accounts", label: "Accounts", value: formatNumber(stats.totalAccounts) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="card flex items-center gap-3"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-800">
            <StatIcon name={item.key} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-zinc-500 leading-tight truncate">
              {item.label}
            </p>
            <p className="text-sm font-semibold text-zinc-100 tabular-nums">
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
