import { getXcmChannelDetail, type XcmChannel, type XcmMessage, type XcmTransfer } from "@/lib/api";
import { truncateHash } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

function paraName(id: number | null): string {
  if (id === null) return "Relay Chain";
  const names: Record<number, string> = {
    0: "This Chain",
    1000: "AssetHub",
    2000: "Acala",
    2004: "Moonbeam",
    2006: "Astar",
    2030: "Bifrost",
    2034: "Hydration",
    2051: "Ajuna",
  };
  return names[id] ?? `Para #${id}`;
}

export default async function XcmChannelDetailPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  const parts = channelId.split("-");
  if (parts.length !== 2) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Invalid channel format. Expected: from_para_id-to_para_id
      </div>
    );
  }

  const fromParaId = parseInt(parts[0] ?? "0", 10);
  const toParaId = parseInt(parts[1] ?? "0", 10);

  let channel: XcmChannel | null = null;
  let recentMessages: XcmMessage[] = [];
  let recentTransfers: XcmTransfer[] = [];
  let error: string | null = null;

  try {
    const res = await getXcmChannelDetail(fromParaId, toParaId);
    channel = res.channel;
    recentMessages = res.recentMessages;
    recentTransfers = res.recentTransfers;
  } catch {
    error = "Unable to load channel detail.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs">
        <Link href="/xcm" className="text-accent hover:underline">XCM</Link>
        <span className="text-zinc-600">/</span>
        <Link href="/xcm/channels" className="text-accent hover:underline">Channels</Link>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-400">{paraName(fromParaId)} → {paraName(toParaId)}</span>
      </div>

      <h1 className="text-2xl font-bold text-zinc-100">
        {paraName(fromParaId)} → {paraName(toParaId)}
      </h1>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {channel && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Messages" value={channel.message_count.toLocaleString()} />
          <StatCard label="Transfers" value={channel.transfer_count.toLocaleString()} />
          <StatCard
            label="First Seen"
            value={channel.first_seen_block != null ? `#${channel.first_seen_block.toLocaleString()}` : "—"}
            link={channel.first_seen_block != null ? `/block/${channel.first_seen_block}` : undefined}
          />
          <StatCard
            label="Last Seen"
            value={channel.last_seen_block != null ? `#${channel.last_seen_block.toLocaleString()}` : "—"}
            link={channel.last_seen_block != null ? `/block/${channel.last_seen_block}` : undefined}
          />
        </div>
      )}

      {/* Recent Messages */}
      {recentMessages.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-200">Recent Messages</h2>
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Hash</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2 pr-4">Protocol</th>
                  <th className="pb-2 pr-4">Block</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentMessages.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-800/30">
                    <td className="py-2 pr-4 font-mono text-xs text-accent">
                      {m.message_hash ? truncateHash(m.message_hash) : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          m.direction === "inbound" ? "text-blue-400 bg-blue-950/50" : "text-orange-400 bg-orange-950/50"
                        }`}
                      >
                        {m.direction === "inbound" ? "↓ IN" : "↑ OUT"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-zinc-400">{m.protocol}</td>
                    <td className="py-2 pr-4">
                      <Link href={`/block/${m.block_height}`} className="text-accent hover:underline font-mono text-xs">
                        #{m.block_height.toLocaleString()}
                      </Link>
                    </td>
                    <td className="py-2">
                      {m.success ? (
                        <span className="text-green-400 text-xs">✓</span>
                      ) : m.success === false ? (
                        <span className="text-red-400 text-xs">✗</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Transfers */}
      {recentTransfers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-zinc-200">Recent Transfers</h2>
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4 text-right">Value</th>
                  <th className="pb-2">Block</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-800/30">
                    <td className="py-2 pr-4 text-xs">
                      {t.from_address ? (
                        <Link href={`/account/${t.from_address}`} className="text-accent hover:underline font-mono">
                          {truncateHash(t.from_address)}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {t.to_address ? (
                        <Link href={`/account/${t.to_address}`} className="text-accent hover:underline font-mono">
                          {truncateHash(t.to_address)}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono text-xs text-zinc-200">
                      {t.amount} {t.asset_symbol ?? ""}
                    </td>
                    <td className="py-2">
                      <Link href={`/block/${t.block_height}`} className="text-accent hover:underline font-mono text-xs">
                        #{t.block_height.toLocaleString()}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      {link ? (
        <Link href={link} className="text-lg font-bold text-accent hover:underline">
          {value}
        </Link>
      ) : (
        <p className="text-lg font-bold text-zinc-100">{value}</p>
      )}
    </div>
  );
}
