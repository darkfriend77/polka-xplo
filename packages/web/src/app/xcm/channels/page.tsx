import { getXcmChannels, type XcmChannel } from "@/lib/api";
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

export default async function XcmChannelsPage() {
  let channels: XcmChannel[] = [];
  let error: string | null = null;

  try {
    const res = await getXcmChannels();
    channels = res.data;
  } catch {
    error = "Unable to load XCM channels. Is the ext-xcm extension active?";
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Link href="/xcm" className="text-xs text-accent hover:underline">
            XCM
          </Link>
          <span className="text-xs text-zinc-600">/</span>
          <h1 className="text-2xl font-bold text-zinc-100">Channels</h1>
        </div>
        <p className="text-sm text-zinc-400 mt-1">
          {channels.length} active cross-chain channel{channels.length !== 1 ? "s" : ""}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {channels.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4 text-right">Messages</th>
                <th className="pb-2 pr-4 text-right">Transfers</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">First Seen</th>
                <th className="pb-2">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {channels.map((ch) => (
                <tr key={ch.id} className="hover:bg-zinc-800/30">
                  <td className="py-2 pr-4 text-zinc-200">
                    <Link
                      href={`/xcm/channels/${ch.from_para_id}-${ch.to_para_id}`}
                      className="text-accent hover:underline"
                    >
                      {paraName(ch.from_para_id)}
                    </Link>
                    <span className="text-zinc-600 text-xs ml-1">#{ch.from_para_id}</span>
                  </td>
                  <td className="py-2 pr-4 text-zinc-200">
                    <Link
                      href={`/xcm/channels/${ch.from_para_id}-${ch.to_para_id}`}
                      className="text-accent hover:underline"
                    >
                      {paraName(ch.to_para_id)}
                    </Link>
                    <span className="text-zinc-600 text-xs ml-1">#{ch.to_para_id}</span>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-zinc-300">
                    {ch.message_count.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-zinc-300">
                    {ch.transfer_count.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={ch.status} />
                  </td>
                  <td className="py-2 pr-4">
                    {ch.first_seen_block != null ? (
                      <Link
                        href={`/block/${ch.first_seen_block}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        #{ch.first_seen_block.toLocaleString()}
                      </Link>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-2">
                    {ch.last_seen_block != null ? (
                      <Link
                        href={`/block/${ch.last_seen_block}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        #{ch.last_seen_block.toLocaleString()}
                      </Link>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {channels.length === 0 && !error && (
        <div className="text-center py-12 text-zinc-500">
          No XCM channels detected yet. Channels are populated as cross-chain messages flow through.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "text-green-400 bg-green-950/50",
    closed: "text-red-400 bg-red-950/50",
  };
  const c = colors[status] ?? "text-zinc-400 bg-zinc-800/50";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c}`}>{status}</span>;
}
