import { getReferendum, type GovernanceReferendum, type GovernanceVote } from "@/lib/api";
import { truncateHash } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CONVICTION_LABELS = [
  "None (0.1x)",
  "Locked1x",
  "Locked2x",
  "Locked3x",
  "Locked4x",
  "Locked5x",
  "Locked6x",
];

function VoteRow({ vote }: { vote: GovernanceVote }) {
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
      <td className="py-2 pr-4">
        <Link href={`/account/${vote.voter}`} className="text-accent hover:underline font-mono text-xs">
          {truncateHash(vote.voter, 8)}
        </Link>
      </td>
      <td className="py-2 pr-4">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
            vote.is_aye
              ? "bg-green-900/40 text-green-300 border border-green-800/40"
              : "bg-red-900/40 text-red-300 border border-red-800/40"
          }`}
        >
          {vote.is_aye ? "Aye" : "Nay"}
        </span>
      </td>
      <td className="py-2 pr-4 text-zinc-300 text-xs">
        {vote.conviction !== undefined && vote.conviction !== null
          ? CONVICTION_LABELS[vote.conviction] ?? `x${vote.conviction}`
          : "—"}
      </td>
      <td className="py-2 pr-4 text-zinc-300 font-mono text-xs text-right">
        {vote.balance ? BigInt(vote.balance).toLocaleString() : "—"}
      </td>
      <td className="py-2 text-zinc-400 font-mono text-xs text-right">
        {vote.block_height.toLocaleString()}
      </td>
    </tr>
  );
}

export default async function ReferendumDetailPage({
  params,
}: {
  params: Promise<{ refIndex: string }>;
}) {
  const { refIndex } = await params;
  let referendum: GovernanceReferendum | null = null;
  let votes: GovernanceVote[] = [];
  let error: string | null = null;

  try {
    const res = await getReferendum(parseInt(refIndex, 10));
    referendum = res.referendum;
    votes = res.votes;
  } catch {
    error = "Referendum not found.";
  }

  if (error || !referendum) {
    return (
      <div className="text-center py-20 text-zinc-500">
        {error ?? "Referendum not found."}
      </div>
    );
  }

  const ayes = votes.filter((v) => v.is_aye);
  const nays = votes.filter((v) => !v.is_aye);
  const ayePct = votes.length > 0 ? ((ayes.length / votes.length) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/governance/referenda" className="text-xs text-accent hover:underline">
          ← Referenda
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Referendum #{referendum.ref_index}</h1>
      </div>

      {/* Details Card */}
      <div className="card space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-zinc-500">Status</p>
            <p className="text-sm text-zinc-100 font-medium capitalize">{referendum.status}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Threshold</p>
            <p className="text-sm text-zinc-300">{referendum.threshold ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">End Block</p>
            <p className="text-sm text-zinc-300 font-mono">
              {referendum.end_block ? referendum.end_block.toLocaleString() : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Created</p>
            <p className="text-sm text-zinc-300 font-mono">
              Block {referendum.block_height.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Vote Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          Votes ({votes.length})
        </h2>

        {/* Bar chart */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span className="text-green-400">Aye: {ayes.length} ({ayePct}%)</span>
            <span className="text-red-400">
              Nay: {nays.length} ({(100 - parseFloat(ayePct)).toFixed(1)}%)
            </span>
          </div>
          <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${ayePct}%` }}
            />
            <div className="h-full bg-red-500 flex-1" />
          </div>
        </div>

        {votes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Voter</th>
                  <th className="pb-2 pr-4">Vote</th>
                  <th className="pb-2 pr-4">Conviction</th>
                  <th className="pb-2 pr-4 text-right">Balance (planck)</th>
                  <th className="pb-2 text-right">Block</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => (
                  <VoteRow key={`${v.voter}-${v.block_height}`} vote={v} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No votes recorded.</p>
        )}
      </div>
    </div>
  );
}
