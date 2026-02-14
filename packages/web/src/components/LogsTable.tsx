import React from "react";
import Link from "next/link";
import type { DigestLogEntry } from "@/lib/api";
import { truncateHash } from "@/lib/format";

/**
 * LogsTable — paginated table of block digest logs.
 * Columns: Log Index, Block, Type, Engine, Data
 */
export function LogsTable({ logs }: { logs: DigestLogEntry[] }) {
  if (logs.length === 0) {
    return <div className="text-center py-12 text-zinc-500">No digest logs found yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
            <th className="pb-2 pr-4">Log Index</th>
            <th className="pb-2 pr-4">Block</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Engine</th>
            <th className="pb-2">Data</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, i) => (
            <tr key={`${log.blockHeight}-${log.logIndex}-${i}`} className="table-row">
              <td className="py-2.5 pr-4 font-mono text-xs text-zinc-300">
                <Link href={`/block/${log.blockHeight}`} className="text-accent hover:underline">
                  {log.blockHeight}-{log.logIndex}
                </Link>
              </td>
              <td className="py-2.5 pr-4">
                <a
                  href={`/block/${log.blockHeight}`}
                  className="text-accent hover:underline font-mono"
                >
                  #{log.blockHeight.toLocaleString("en-US")}
                </a>
              </td>
              <td className="py-2.5 pr-4">
                <TypeBadge type={log.type} />
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-zinc-300">
                {log.engine ?? <span className="text-zinc-600">—</span>}
              </td>
              <td className="py-2.5 font-mono text-xs text-zinc-500 break-all max-w-[300px] truncate">
                {log.data ? truncateHash(log.data, 16) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  preRuntime: "bg-blue-900/40 text-blue-400",
  seal: "bg-purple-900/40 text-purple-400",
  consensus: "bg-green-900/40 text-green-400",
  runtimeEnvironmentUpdated: "bg-yellow-900/40 text-yellow-400",
  other: "bg-zinc-800 text-zinc-400",
};

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.other;
  // Capitalize first letter
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
  );
}
