import { getXcmMessages, type XcmMessage } from "@/lib/api";
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

export default async function XcmMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; direction?: string; protocol?: string }>;
}) {
  const { page: pageStr, direction, protocol } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  let messages: XcmMessage[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const res = await getXcmMessages(limit, offset, { direction, protocol });
    messages = res.data;
    total = res.total;
  } catch {
    error = "Unable to load XCM messages. Is the ext-xcm extension active?";
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/xcm" className="text-xs text-accent hover:underline">
          ← XCM
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Messages</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          {total.toLocaleString()} XCM message{total !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <FilterLink label="All" href="/xcm/messages" active={!direction && !protocol} />
        <FilterLink label="Inbound" href="/xcm/messages?direction=inbound" active={direction === "inbound"} />
        <FilterLink label="Outbound" href="/xcm/messages?direction=outbound" active={direction === "outbound"} />
        <span className="text-zinc-700">|</span>
        <FilterLink label="HRMP" href="/xcm/messages?protocol=HRMP" active={protocol === "HRMP"} />
        <FilterLink label="UMP" href="/xcm/messages?protocol=UMP" active={protocol === "UMP"} />
        <FilterLink label="DMP" href="/xcm/messages?protocol=DMP" active={protocol === "DMP"} />
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {messages.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">Message Hash</th>
                <th className="pb-2 pr-4">Direction</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2 pr-4">Block</th>
                <th className="pb-2 pr-4">Protocol</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {messages.map((msg) => (
                <tr key={msg.id} className="hover:bg-zinc-800/30">
                  <td className="py-2 pr-4 font-mono text-xs text-accent">
                    {msg.message_hash ? truncateHash(msg.message_hash) : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    <DirectionBadge direction={msg.direction} />
                  </td>
                  <td className="py-2 pr-4 text-zinc-300 text-xs">
                    {msg.direction === "inbound"
                      ? paraName(msg.origin_para_id)
                      : msg.sender
                        ? truncateHash(msg.sender)
                        : "This Chain"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-300 text-xs">
                    {msg.direction === "outbound"
                      ? paraName(msg.dest_para_id)
                      : "This Chain"}
                  </td>
                  <td className="py-2 pr-4">
                    <Link href={`/block/${msg.block_height}`} className="text-accent hover:underline font-mono text-xs">
                      #{msg.block_height.toLocaleString()}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <ProtocolBadge protocol={msg.protocol} />
                  </td>
                  <td className="py-2 text-right">
                    {msg.success === true && (
                      <span className="text-xs text-green-400">✓</span>
                    )}
                    {msg.success === false && (
                      <span className="text-xs text-red-400">✗</span>
                    )}
                    {msg.success === null && (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/xcm/messages?page=${page - 1}${direction ? `&direction=${direction}` : ""}${protocol ? `&protocol=${protocol}` : ""}`}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700"
            >
              ← Prev
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/xcm/messages?page=${page + 1}${direction ? `&direction=${direction}` : ""}${protocol ? `&protocol=${protocol}` : ""}`}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const color = direction === "inbound" ? "text-blue-400 bg-blue-950/50" : "text-orange-400 bg-orange-950/50";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
      {direction === "inbound" ? "↓ IN" : "↑ OUT"}
    </span>
  );
}

function ProtocolBadge({ protocol }: { protocol: string }) {
  const colors: Record<string, string> = {
    HRMP: "text-purple-400 bg-purple-950/50",
    UMP: "text-cyan-400 bg-cyan-950/50",
    DMP: "text-emerald-400 bg-emerald-950/50",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[protocol] ?? "text-zinc-400 bg-zinc-800"}`}>
      {protocol}
    </span>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs px-2 py-1 rounded transition-colors ${
        active
          ? "bg-accent/20 text-accent border border-accent/30"
          : "text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-600"
      }`}
    >
      {label}
    </Link>
  );
}
