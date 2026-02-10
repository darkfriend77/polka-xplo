import React from "react";
import type { BlockSummary } from "@/lib/api";
import { truncateHash, timeAgo } from "@/lib/format";

/**
 * BlocksTable — full-width paginated block table for the /blocks list page.
 * Columns: Block, Status, Time, Extrinsics, Events, Collator, Block Hash
 */
export function BlocksTable({ blocks }: { blocks: BlockSummary[] }) {
  if (blocks.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        No blocks indexed yet. The indexer may still be syncing.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
            <th className="pb-2 pr-4">Block</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4">Time</th>
            <th className="pb-2 pr-4 text-right">Extrinsics</th>
            <th className="pb-2 pr-4 text-right">Events</th>
            <th className="pb-2 pr-4">Collator</th>
            <th className="pb-2">Block Hash</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map((block) => (
            <tr key={block.height} className="table-row">
              <td className="py-2.5 pr-4">
                <a
                  href={`/block/${block.height}`}
                  className="text-accent hover:underline font-mono"
                >
                  #{block.height.toLocaleString("en-US")}
                </a>
              </td>
              <td className="py-2.5 pr-4">
                <StatusBadge status={block.status} />
              </td>
              <td className="py-2.5 pr-4 text-zinc-400">
                {timeAgo(block.timestamp)}
              </td>
              <td className="py-2.5 pr-4 text-right text-zinc-300">
                {block.extrinsicCount}
              </td>
              <td className="py-2.5 pr-4 text-right text-zinc-300">
                {block.eventCount}
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs">
                {block.validatorId ? (
                  <a
                    href={`/account/${block.validatorId}`}
                    className="text-accent hover:underline"
                  >
                    {truncateHash(block.validatorId)}
                  </a>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
              <td className="py-2.5 font-mono text-xs text-zinc-400">
                {truncateHash(block.hash)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isFinalized = status === "finalized";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        isFinalized
          ? "bg-green-900/40 text-green-400"
          : "bg-yellow-900/40 text-yellow-400"
      }`}
    >
      {isFinalized ? "Finalized" : "Best"}
    </span>
  );
}
