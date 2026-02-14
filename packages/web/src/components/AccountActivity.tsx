"use client";

import { useState, useEffect, useCallback } from "react";
import { ExtrinsicList } from "./ExtrinsicList";
import { TransfersTable } from "./TransfersTable";
import Link from "next/link";
import type { ExtrinsicSummary, TransferSummary, AssetBalance, XcmTransfer } from "@/lib/api";
import { theme } from "@/lib/theme";
import { formatBalance, truncateHash } from "@/lib/format";

const API_BASE = "/indexer-api";

type Tab = "extrinsics" | "transfers" | "assets" | "xcm";

function paraName(id: number | null): string {
  if (id === null) return "Relay";
  const names: Record<number, string> = {
    0: "This Chain", 1000: "AssetHub", 2000: "Acala", 2004: "Moonbeam",
    2006: "Astar", 2030: "Bifrost", 2034: "Hydration", 2051: "Ajuna",
  };
  return names[id] ?? `Para #${id}`;
}

function formatXcmAmount(amount: string, symbol: string | null): string {
  const sym = symbol ?? "";
  const num = BigInt(amount);
  if (num === 0n) return `0 ${sym}`.trim();
  const decMap: Record<string, number> = { DOT: 10, AJUN: 12, USDC: 6, USDT: 6, USDt: 6 };
  const dec = sym ? (decMap[sym] ?? 12) : 12;
  const divisor = 10n ** BigInt(dec);
  const whole = num / divisor;
  const frac = num % divisor;
  if (frac === 0n) return `${whole.toLocaleString()} ${sym}`.trim();
  const fracStr = frac.toString().padStart(dec, "0").replace(/0+$/, "");
  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)} ${sym}`.trim();
}

/**
 * Tabbed activity panel for the account detail page.
 * Extrinsics are passed server-side; transfers/xcm are fetched client-side on demand.
 */
export function AccountActivity({
  address,
  extrinsics,
  assetBalances,
}: {
  address: string;
  extrinsics: ExtrinsicSummary[];
  assetBalances?: AssetBalance[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("extrinsics");

  // Transfer state — lazy-loaded on first tab switch
  const [transfers, setTransfers] = useState<TransferSummary[] | null>(null);
  const [transferTotal, setTransferTotal] = useState(0);
  const [transferPage, setTransferPage] = useState(1);
  const [transferLoading, setTransferLoading] = useState(false);

  // XCM state — lazy-loaded on first tab switch
  const [xcmTransfers, setXcmTransfers] = useState<XcmTransfer[] | null>(null);
  const [xcmTotal, setXcmTotal] = useState(0);
  const [xcmPage, setXcmPage] = useState(1);
  const [xcmLoading, setXcmLoading] = useState(false);

  const pageSize = 25;

  const fetchTransfers = useCallback(
    async (page: number) => {
      setTransferLoading(true);
      try {
        const offset = (page - 1) * pageSize;
        const res = await fetch(
          `${API_BASE}/api/accounts/${encodeURIComponent(address)}/transfers?limit=${pageSize}&offset=${offset}`,
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        setTransfers(json.data ?? []);
        setTransferTotal(json.total ?? 0);
        setTransferPage(page);
      } catch {
        setTransfers([]);
        setTransferTotal(0);
      } finally {
        setTransferLoading(false);
      }
    },
    [address],
  );

  const fetchXcmTransfers = useCallback(
    async (page: number) => {
      setXcmLoading(true);
      try {
        const offset = (page - 1) * pageSize;
        const res = await fetch(
          `${API_BASE}/api/xcm/transfers?address=${encodeURIComponent(address)}&limit=${pageSize}&offset=${offset}`,
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        setXcmTransfers(json.data ?? []);
        setXcmTotal(json.total ?? 0);
        setXcmPage(page);
      } catch {
        setXcmTransfers([]);
        setXcmTotal(0);
      } finally {
        setXcmLoading(false);
      }
    },
    [address],
  );

  // Fetch transfers when tab is first activated
  useEffect(() => {
    if (activeTab === "transfers" && transfers === null) {
      fetchTransfers(1);
    }
  }, [activeTab, transfers, fetchTransfers]);

  // Fetch XCM transfers when tab is first activated
  useEffect(() => {
    if (activeTab === "xcm" && xcmTransfers === null) {
      fetchXcmTransfers(1);
    }
  }, [activeTab, xcmTransfers, fetchXcmTransfers]);

  const totalTransferPages = Math.ceil(transferTotal / pageSize);
  const totalXcmPages = Math.ceil(xcmTotal / pageSize);

  const tabClass = (tab: Tab) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
      activeTab === tab
        ? "text-zinc-100 border-b-2 border-[var(--color-accent)] -mb-px"
        : "text-zinc-500 hover:text-zinc-300"
    }`;

  return (
    <section>
      <div className="flex gap-1 mb-4 border-b border-zinc-800">
        <button className={tabClass("extrinsics")} onClick={() => setActiveTab("extrinsics")}>
          Extrinsics
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-zinc-700 text-zinc-200">
            {extrinsics.length}
          </span>
        </button>
        <button className={tabClass("transfers")} onClick={() => setActiveTab("transfers")}>
          Transfers
          {transferTotal > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-zinc-700 text-zinc-200">
              {transferTotal.toLocaleString()}
            </span>
          )}
        </button>
        <button className={tabClass("assets")} onClick={() => setActiveTab("assets")}>
          Assets
          {assetBalances && assetBalances.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-zinc-700 text-zinc-200">
              {assetBalances.length}
            </span>
          )}
        </button>
        <button className={tabClass("xcm")} onClick={() => setActiveTab("xcm")}>
          XCM
          {xcmTotal > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-medium bg-zinc-700 text-zinc-200">
              {xcmTotal.toLocaleString()}
            </span>
          )}
        </button>
      </div>

      {activeTab === "extrinsics" && (
        <div className="card">
          {extrinsics.length > 0 ? (
            <ExtrinsicList extrinsics={extrinsics} />
          ) : (
            <p className="text-center py-8 text-zinc-500 text-sm">No extrinsics found.</p>
          )}
        </div>
      )}

      {activeTab === "transfers" && (
        <div className="card">
          {transferLoading && transfers === null ? (
            <p className="text-center py-8 text-zinc-500 text-sm">Loading transfers...</p>
          ) : transfers && transfers.length > 0 ? (
            <>
              <TransfersTable
                transfers={transfers}
                tokenSymbol={theme.tokenSymbol}
                tokenDecimals={theme.tokenDecimals}
              />
              {/* Pagination */}
              {totalTransferPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => fetchTransfers(transferPage - 1)}
                    disabled={transferPage <= 1 || transferLoading}
                    className="px-3 py-1.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-zinc-400">
                    Page {transferPage} of {totalTransferPages}
                  </span>
                  <button
                    onClick={() => fetchTransfers(transferPage + 1)}
                    disabled={transferPage >= totalTransferPages || transferLoading}
                    className="px-3 py-1.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-center py-8 text-zinc-500 text-sm">No transfers found.</p>
          )}
        </div>
      )}

      {activeTab === "assets" && (
        <div className="card">
          {assetBalances && assetBalances.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-800">
                    <th className="pb-2 pr-4">Asset</th>
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4 text-right">Balance</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {assetBalances.map((asset) => (
                    <tr key={asset.assetId} className="hover:bg-zinc-800/30">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200">{asset.symbol}</span>
                          {asset.name && asset.name !== asset.symbol && (
                            <span className="text-xs text-zinc-500">{asset.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">
                        <Link href={`/assets/${asset.assetId}`} className="text-accent hover:underline">
                          #{asset.assetId}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-sm tabular-nums text-zinc-200">
                        {formatBalance(asset.balance, asset.decimals, asset.symbol)}
                      </td>
                      <td className="py-2.5">
                        {asset.status === "Liquid" ? (
                          <span className="text-xs text-green-400">Liquid</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                            {asset.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-zinc-500 text-sm">No asset holdings found.</p>
          )}
        </div>
      )}

      {activeTab === "xcm" && (
        <div className="card">
          {xcmLoading && xcmTransfers === null ? (
            <p className="text-center py-8 text-zinc-500 text-sm">Loading XCM transfers...</p>
          ) : xcmTransfers && xcmTransfers.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-500 border-b border-zinc-800">
                      <th className="pb-2 pr-4">Direction</th>
                      <th className="pb-2 pr-4">Chain</th>
                      <th className="pb-2 pr-4">Counterparty</th>
                      <th className="pb-2 pr-4 text-right">Value</th>
                      <th className="pb-2 pr-4">Block</th>
                      <th className="pb-2">Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {xcmTransfers.map((t) => {
                      const isInbound = t.direction === "inbound";
                      const chain = isInbound ? t.from_chain_id : t.to_chain_id;
                      const counterparty = isInbound ? t.from_address : t.to_address;
                      return (
                        <tr key={t.id} className="hover:bg-zinc-800/30">
                          <td className="py-2 pr-4">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              isInbound ? "text-blue-400 bg-blue-950/50" : "text-orange-400 bg-orange-950/50"
                            }`}>
                              {isInbound ? "\u2193 IN" : "\u2191 OUT"}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-xs text-zinc-300">
                            {chain != null ? paraName(chain) : "\u2014"}
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs">
                            {counterparty ? (
                              <Link href={`/account/${counterparty}`} className="text-accent hover:underline">
                                {truncateHash(counterparty)}
                              </Link>
                            ) : (
                              <span className="text-zinc-600">\u2014</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs text-zinc-200">
                            {formatXcmAmount(t.amount, t.asset_symbol)}
                          </td>
                          <td className="py-2 pr-4">
                            <Link href={`/block/${t.block_height}`} className="text-accent hover:underline font-mono text-xs">
                              #{t.block_height.toLocaleString()}
                            </Link>
                          </td>
                          <td className="py-2 text-xs text-zinc-500">
                            {t.protocol ?? "\u2014"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* XCM Pagination */}
              {totalXcmPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-zinc-800">
                  <button
                    onClick={() => fetchXcmTransfers(xcmPage - 1)}
                    disabled={xcmPage <= 1 || xcmLoading}
                    className="px-3 py-1.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    \u2190 Prev
                  </button>
                  <span className="text-xs text-zinc-400">
                    Page {xcmPage} of {totalXcmPages}
                  </span>
                  <button
                    onClick={() => fetchXcmTransfers(xcmPage + 1)}
                    disabled={xcmPage >= totalXcmPages || xcmLoading}
                    className="px-3 py-1.5 text-xs rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next \u2192
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-center py-8 text-zinc-500 text-sm">No XCM transfers found for this account.</p>
          )}
        </div>
      )}
    </section>
  );
}
