"use client";

import React, { useState } from "react";

/**
 * Generic JSON viewer component.
 * Used as the fallback when no extension-specific viewer exists.
 * Detects oversized args markers left by the indexer.
 */
export function JsonView({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  // Detect truncated/oversized marker from the indexer
  if (data?._oversized === true) {
    const sizeKb = typeof data._originalBytes === "number"
      ? (data._originalBytes / 1024).toFixed(1)
      : "?";
    return (
      <div className="rounded-md bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="p-3 flex items-center gap-2 text-xs text-zinc-400">
          <span className="inline-flex items-center rounded bg-amber-900/40 px-2 py-0.5 text-amber-400 font-medium">
            Oversized
          </span>
          <span>
            Original args were {sizeKb} KB — too large to store.
            The full data is available on-chain.
          </span>
        </div>
      </div>
    );
  }

  const json = JSON.stringify(data, null, 2);
  const isLong = json.length > 200;

  return (
    <div className="rounded-md bg-zinc-900 border border-zinc-800 overflow-hidden">
      <pre className="p-3 text-xs text-zinc-300 font-mono overflow-x-auto whitespace-pre-wrap">
        {expanded || !isLong ? json : json.slice(0, 200) + "..."}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-300 border-t border-zinc-800 transition-colors"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  );
}
