import { getDemocracyProposals, type GovernanceProposal } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  proposed: "badge-info",
  tabled: "bg-purple-900/40 text-purple-300 border border-purple-800/40",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status.toLowerCase()] ?? "badge-info";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageStr, status } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const limit = 25;
  const offset = (page - 1) * limit;

  let proposals: GovernanceProposal[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const res = await getDemocracyProposals(limit, offset, status);
    proposals = res.data;
    total = res.total;
  } catch {
    error = "Unable to load proposals.";
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/governance" className="text-xs text-accent hover:underline">
          ← Governance
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Democracy Proposals</h1>
        <p className="text-sm text-zinc-400 mt-0.5">{total} total proposals</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "proposed", "tabled"].map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/governance/proposals" : `/governance/proposals?status=${s}`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              (s === "all" && !status) || status === s
                ? "bg-accent/20 text-accent border border-accent/40"
                : "bg-zinc-800/40 text-zinc-400 hover:text-zinc-100 border border-zinc-700/40"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500 border-b border-zinc-800">
              <th className="pb-2 pr-4">#</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Deposit</th>
              <th className="pb-2 pr-4">Referendum</th>
              <th className="pb-2 text-right">Block</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.proposal_index} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-2 pr-4 font-mono text-zinc-100">{p.proposal_index}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={p.status} />
                </td>
                <td className="py-2 pr-4 text-zinc-300 font-mono text-xs">
                  {BigInt(p.deposit).toLocaleString()}
                </td>
                <td className="py-2 pr-4">
                  {p.referendum_index !== null ? (
                    <Link
                      href={`/governance/referenda/${p.referendum_index}`}
                      className="text-accent hover:underline font-mono"
                    >
                      #{p.referendum_index}
                    </Link>
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </td>
                <td className="py-2 text-right text-zinc-400 font-mono text-xs">
                  {p.block_height.toLocaleString()}
                </td>
              </tr>
            ))}
            {proposals.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-zinc-500">
                  No proposals found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/governance/proposals?page=${page - 1}${status ? `&status=${status}` : ""}`}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
            >
              ← Prev
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-zinc-400">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/governance/proposals?page=${page + 1}${status ? `&status=${status}` : ""}`}
              className="px-3 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 text-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
