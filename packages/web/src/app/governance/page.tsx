import { getGovernanceSummary, type GovernanceSummary } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

function SummaryCard({
  title,
  href,
  counts,
}: {
  title: string;
  href: string;
  counts: Record<string, number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Link href={href} className="card hover:border-accent/40 transition-colors group">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-accent transition-colors">
          {title}
        </h3>
        <span className="text-2xl font-bold text-accent">{total}</span>
      </div>
      <div className="space-y-1">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="flex justify-between text-sm">
            <span className="text-zinc-400 capitalize">{status}</span>
            <span className="text-zinc-300">{count}</span>
          </div>
        ))}
        {Object.keys(counts).length === 0 && (
          <p className="text-sm text-zinc-500">No items yet</p>
        )}
      </div>
    </Link>
  );
}

export default async function GovernancePage() {
  let summary: GovernanceSummary | null = null;
  let error: string | null = null;

  try {
    summary = await getGovernanceSummary();
  } catch {
    error = "Unable to load governance data. Is the ext-governance extension active?";
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-accent hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Governance</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Democracy, Council &amp; Technical Committee overview
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard title="Referenda" href="/governance/referenda" counts={summary.referenda} />
          <SummaryCard title="Proposals" href="/governance/proposals" counts={summary.proposals} />
          <SummaryCard
            title="Council Motions"
            href="/governance/council"
            counts={summary.council}
          />
          <SummaryCard
            title="Tech Committee"
            href="/governance/techcomm"
            counts={summary.techcomm}
          />
        </div>
      )}

      {/* Quick links */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link
            href="/governance/referenda"
            className="rounded-lg bg-zinc-800/40 p-3 text-sm text-zinc-300 hover:bg-zinc-700/40 hover:text-zinc-100 transition-colors"
          >
            All Referenda
          </Link>
          <Link
            href="/governance/proposals"
            className="rounded-lg bg-zinc-800/40 p-3 text-sm text-zinc-300 hover:bg-zinc-700/40 hover:text-zinc-100 transition-colors"
          >
            Democracy Proposals
          </Link>
          <Link
            href="/governance/council"
            className="rounded-lg bg-zinc-800/40 p-3 text-sm text-zinc-300 hover:bg-zinc-700/40 hover:text-zinc-100 transition-colors"
          >
            Council Motions
          </Link>
          <Link
            href="/governance/techcomm"
            className="rounded-lg bg-zinc-800/40 p-3 text-sm text-zinc-300 hover:bg-zinc-700/40 hover:text-zinc-100 transition-colors"
          >
            Tech Committee
          </Link>
        </div>
      </div>
    </div>
  );
}
