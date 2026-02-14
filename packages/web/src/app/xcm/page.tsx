import { getXcmSummary } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function XcmPage() {
  let summary = { messages: {} as Record<string, Record<string, number>>, transfers: {} as Record<string, { count: number; assets: number }>, channelCount: 0 };
  let error: string | null = null;

  try {
    summary = await getXcmSummary();
  } catch {
    error = "Unable to load XCM data. Is the ext-xcm extension active?";
  }

  const totalInbound = Object.values(summary.messages.inbound ?? {}).reduce((a, b) => a + b, 0);
  const totalOutbound = Object.values(summary.messages.outbound ?? {}).reduce((a, b) => a + b, 0);
  const totalMessages = totalInbound + totalOutbound;

  const inTransfers = summary.transfers.inbound?.count ?? 0;
  const outTransfers = summary.transfers.outbound?.count ?? 0;
  const totalTransfers = inTransfers + outTransfers;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Cross-Chain (XCM)</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Cross-consensus messaging — messages, transfers, and channels
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          title="Messages"
          value={totalMessages}
          sub={`${totalInbound} inbound · ${totalOutbound} outbound`}
          href="/xcm/messages"
        />
        <SummaryCard
          title="Transfers"
          value={totalTransfers}
          sub={`${inTransfers} received · ${outTransfers} sent`}
          href="/xcm/transfers"
        />
        <SummaryCard
          title="Channels"
          value={summary.channelCount}
          sub="Active HRMP/DMP channels"
          href="/xcm/channels"
        />
      </div>

      {/* Protocol Breakdown */}
      {totalMessages > 0 && (
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Protocol Breakdown</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-2">Inbound</p>
              {Object.entries(summary.messages.inbound ?? {}).map(([proto, count]) => (
                <div key={proto} className="flex justify-between text-sm py-1">
                  <span className="text-zinc-400">{proto}</span>
                  <span className="text-zinc-200 font-mono">{count.toLocaleString()}</span>
                </div>
              ))}
              {!summary.messages.inbound && <p className="text-xs text-zinc-600">No inbound messages</p>}
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-2">Outbound</p>
              {Object.entries(summary.messages.outbound ?? {}).map(([proto, count]) => (
                <div key={proto} className="flex justify-between text-sm py-1">
                  <span className="text-zinc-400">{proto}</span>
                  <span className="text-zinc-200 font-mono">{count.toLocaleString()}</span>
                </div>
              ))}
              {!summary.messages.outbound && <p className="text-xs text-zinc-600">No outbound messages</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, sub, href }: { title: string; value: number; sub: string; href: string }) {
  return (
    <Link href={href} className="card p-4 hover:bg-zinc-800/60 transition-colors block">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-zinc-100 mt-1">{value.toLocaleString()}</p>
      <p className="text-xs text-zinc-500 mt-1">{sub}</p>
    </Link>
  );
}
