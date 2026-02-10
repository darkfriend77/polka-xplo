import type { BlockSummary } from "@/lib/api";
import { truncateHash, timeAgo, formatNumber } from "@/lib/format";

/**
 * Compact block list card matching statescan homepage layout.
 * Shows block icon, height, time, validator, extrinsic + event counts.
 */
export function LatestBlocksCard({ blocks }: { blocks: BlockSummary[] }) {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">No blocks indexed yet.</div>
    );
  }

  return (
    <div className="divide-y divide-zinc-800">
      {blocks.map((block) => (
        <div
          key={block.height}
          className="flex items-center gap-3 py-3 px-1 hover:bg-zinc-800/30 transition-colors"
        >
          {/* Block icon */}
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
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </div>

          {/* Block info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={`/block/${block.height}`}
                className="text-polkadot-pink hover:underline font-mono text-sm font-medium"
              >
                {formatNumber(block.height)}
              </a>
              {block.status === "finalized" && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="text-green-500 shrink-0"
                >
                  <path
                    d="M3 7l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <p className="text-xs text-zinc-500 truncate">
              {timeAgo(block.timestamp)}
              {block.validatorId && (
                <> &middot; {truncateHash(block.validatorId)}</>
              )}
            </p>
          </div>

          {/* Extrinsics & Events counts */}
          <div className="text-right shrink-0 space-y-0.5">
            <p className="text-xs text-zinc-400">
              <span className="text-zinc-500">Extrinsics</span>{" "}
              <span className="text-zinc-200">{block.extrinsicCount}</span>
            </p>
            <p className="text-xs text-zinc-400">
              <span className="text-zinc-500">Events</span>{" "}
              <span className="text-zinc-200">{block.eventCount}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
