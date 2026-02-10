import React from "react";
import type { ExtrinsicSummary } from "@/lib/api";
import { truncateHash } from "@/lib/format";

/** Convert PascalCase to camelCase (e.g. "ParachainSystem" → "parachainSystem") */
function toCamelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function ExtrinsicList({
  extrinsics,
}: {
  extrinsics: ExtrinsicSummary[];
}) {
  if (extrinsics.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-500">No extrinsics found.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
            <th className="pb-2 pr-4">ID</th>
            <th className="pb-2 pr-4">Hash</th>
            <th className="pb-2 pr-4">Result</th>
            <th className="pb-2 pr-4">Call</th>
            <th className="pb-2">Signer</th>
          </tr>
        </thead>
        <tbody>
          {extrinsics.map((ext) => (
            <tr key={ext.id} className="table-row">
              <td className="py-2.5 pr-4 font-mono text-xs">
                <a
                  href={`/extrinsic/${ext.id}`}
                  className="text-polkadot-pink hover:underline"
                >
                  {ext.id}
                </a>
              </td>
              <td className="py-2.5 pr-4">
                {ext.txHash ? (
                  <a
                    href={`/extrinsic/${ext.txHash}`}
                    className="text-polkadot-pink hover:underline font-mono text-xs"
                  >
                    {truncateHash(ext.txHash)}
                  </a>
                ) : (
                  <span className="text-zinc-500 text-xs">—</span>
                )}
              </td>
              <td className="py-2.5 pr-4">
                {ext.success ? (
                  <span className="badge-success">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mr-1">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Success
                  </span>
                ) : (
                  <span className="badge-error">Failed</span>
                )}
              </td>
              <td className="py-2.5 pr-4">
                <span className="badge-info">
                  {toCamelCase(ext.module)}({ext.call})
                </span>
              </td>
              <td className="py-2.5 font-mono text-xs text-zinc-400">
                {ext.signer ? truncateHash(ext.signer) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
