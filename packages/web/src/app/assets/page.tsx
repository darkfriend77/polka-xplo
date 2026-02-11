import { getAssets, type Asset } from "@/lib/api";
import { formatBalance, truncateHash } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageStr, status } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  let assets: Asset[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const res = await getAssets(limit, offset, status);
    assets = res.data;
    total = res.total;
  } catch {
    error = "Unable to load assets. Is the ext-assets extension active?";
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Assets</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {total} registered asset{total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {assets.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Symbol</th>
                <th className="pb-2 pr-4">Decimals</th>
                <th className="pb-2 pr-4">Owner</th>
                <th className="pb-2 pr-4 text-right">Supply</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr
                  key={a.asset_id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/assets/${a.asset_id}`}
                      className="text-accent hover:underline font-mono"
                    >
                      {a.asset_id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-zinc-200">{a.name ?? "—"}</td>
                  <td className="py-2 pr-4 text-zinc-300 font-mono">{a.symbol ?? "—"}</td>
                  <td className="py-2 pr-4 text-zinc-400">{a.decimals}</td>
                  <td className="py-2 pr-4">
                    {a.owner ? (
                      <Link
                        href={`/account/${a.owner}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        {truncateHash(a.owner)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-200 font-mono">
                    {formatBalance(a.supply, a.decimals, a.symbol ?? "")}
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assets.length === 0 && !error && (
        <div className="text-center py-12 text-zinc-500">
          No assets found. The ext-assets extension may still be syncing.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/assets?page=${page - 1}${status ? `&status=${status}` : ""}`}
              className="px-3 py-1 rounded-lg bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 text-sm"
            >
              ← Prev
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/assets?page=${page + 1}${status ? `&status=${status}` : ""}`}
              className="px-3 py-1 rounded-lg bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 text-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "badge-success"
      : status === "destroyed"
        ? "bg-red-900/40 text-red-300 border border-red-800/40"
        : "badge-info";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
