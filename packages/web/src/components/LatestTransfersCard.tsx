import type { TransferSummary } from "@/lib/api";
import { truncateHash, timeAgo, formatBalance } from "@/lib/format";

/**
 * Compact transfer list card matching statescan homepage layout.
 * Shows transfer icon, extrinsic ID, time, amount, from → to.
 */
export function LatestTransfersCard({
  transfers,
  tokenDecimals = 12,
  tokenSymbol = "AJUN",
}: {
  transfers: TransferSummary[];
  tokenDecimals?: number;
  tokenSymbol?: string;
}) {
  if (transfers.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">No transfers found.</div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800">
      {transfers.map((tx, i) => (
        <div
          key={`${tx.extrinsicId}-${i}`}
          className="flex items-center gap-3 py-3 px-1 hover:bg-zinc-800/30 transition-colors"
        >
          {/* Transfer icon */}
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800/60 shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-400"
            >
              <path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>

          {/* Transfer info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={`/extrinsic/${tx.extrinsicId}`}
                className="text-polkadot-pink hover:underline font-mono text-sm font-medium"
              >
                {tx.extrinsicId}
              </a>
            </div>
            <p className="text-xs text-zinc-500 truncate">
              {timeAgo(tx.timestamp)}
            </p>
          </div>

          {/* Amount + destination */}
          <div className="text-right shrink-0 space-y-0.5 max-w-[180px]">
            <p className="text-sm text-zinc-200 font-medium tabular-nums">
              ≈ {formatBalance(tx.amount, tokenDecimals, tokenSymbol)}
            </p>
            {tx.to && (
              <p className="text-xs text-zinc-500 truncate">
                <a
                  href={`/account/${tx.to}`}
                  className="text-polkadot-pink hover:underline"
                >
                  {truncateHash(tx.to)}
                </a>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
