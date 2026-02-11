"use client";

import { useEffect, useState, useCallback } from "react";
import type { IndexerStatusResponse } from "@/lib/api";

// Use the Next.js rewrite proxy — works from any machine without knowing the indexer IP.
const API_BASE = "/indexer-api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h ${m}m`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function IndexerDashboard() {
  const [status, setStatus] = useState<IndexerStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/indexer-status`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: IndexerStatusResponse = await res.json();
      setStatus(data);
      setError(null);
      setLastUpdated(Date.now());
    } catch {
      setError("Unable to reach indexer API");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (error && !status) {
    return (
      <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-4 text-sm text-yellow-300">
        {error}
      </div>
    );
  }

  if (!status) {
    return <div className="text-center py-12 text-zinc-500">Loading indexer status...</div>;
  }

  const stateColor =
    status.state === "live"
      ? "text-green-400"
      : status.state === "syncing"
        ? "text-yellow-400"
        : "text-zinc-500";

  const stateBg =
    status.state === "live"
      ? "bg-green-900/40"
      : status.state === "syncing"
        ? "bg-yellow-900/40"
        : "bg-zinc-800";

  return (
    <div className="space-y-6">
      {/* Sync Progress */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Sync Progress</h2>
          <span className={`px-2.5 py-1 rounded text-xs font-medium ${stateBg} ${stateColor}`}>
            {status.state.toUpperCase()}
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
            <span>Block #{formatNumber(status.indexedHeight)}</span>
            <span>{status.syncPercent.toFixed(2)}%</span>
            <span>Chain tip #{formatNumber(status.chainTip)}</span>
          </div>
          <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${Math.min(status.syncPercent, 100)}%` }}
            />
          </div>
          {status.blocksRemaining > 0 && (
            <p className="text-xs text-zinc-500 mt-1.5">
              {formatNumber(status.blocksRemaining)} blocks remaining
              {status.etaSeconds != null && (
                <>
                  {" "}
                  &middot; ETA:{" "}
                  <span className="text-zinc-300">{formatDuration(status.etaSeconds)}</span>
                </>
              )}
            </p>
          )}
        </div>

        {/* Throughput stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Blocks / min" value={formatNumber(status.blocksPerMinute)} />
          <StatCard label="Blocks / hour" value={formatNumber(status.blocksPerHour)} />
          <StatCard label="Total processed" value={formatNumber(status.blocksProcessed)} />
          <StatCard
            label="Errors"
            value={formatNumber(status.errorCount)}
            alert={status.errorCount > 0}
          />
        </div>
      </section>

      {/* Memory & Uptime */}
      <section className="card space-y-4">
        <h2 className="text-base font-semibold text-zinc-100">Process</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Uptime" value={formatDuration(status.uptimeSeconds)} />
          <StatCard label="RSS Memory" value={formatBytes(status.memory.rss)} />
          <StatCard label="Heap Used" value={formatBytes(status.memory.heapUsed)} />
          <StatCard label="Heap Total" value={formatBytes(status.memory.heapTotal)} />
        </div>
      </section>

      {/* Database */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Database</h2>
          <span className="text-sm text-zinc-400">{status.database.totalSize}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">Table</th>
                <th className="pb-2 pr-4 text-right">Rows (est.)</th>
                <th className="pb-2 text-right">Size</th>
              </tr>
            </thead>
            <tbody>
              {status.database.tables.map((t) => (
                <tr key={t.name} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-300">{t.name}</td>
                  <td className="py-2 pr-4 text-right text-zinc-400">{formatNumber(t.rows)}</td>
                  <td className="py-2 text-right text-zinc-400">{t.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* RPC Endpoints */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">RPC Endpoints</h2>
          <span className="text-sm text-zinc-400">{status.rpc.endpointCount} endpoint(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">URL</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4 text-right">Successes</th>
                <th className="pb-2 text-right">Failures</th>
              </tr>
            </thead>
            <tbody>
              {status.rpc.endpoints.map((ep) => (
                <tr key={ep.url} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-300 break-all">{ep.url}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ep.healthy ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"
                      }`}
                    >
                      {ep.healthy ? "Healthy" : "Down"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-400">
                    {formatNumber(ep.successes)}
                  </td>
                  <td className="py-2 text-right text-zinc-400">{formatNumber(ep.failures)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <p className="text-xs text-zinc-600 text-right">
        Auto-refreshes every 5s &middot; Last update:{" "}
        {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "—"}
      </p>
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="bg-zinc-900/60 rounded-lg p-3">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-lg font-semibold ${alert ? "text-red-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}
