import { getTechCommProposal, type GovernanceMotion, type GovernanceVote } from "@/lib/api";
import { truncateHash } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TechCommProposalDetailPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const { index } = await params;
  let proposal: GovernanceMotion | null = null;
  let votes: GovernanceVote[] = [];
  let error: string | null = null;

  try {
    const res = await getTechCommProposal(parseInt(index, 10));
    proposal = res.proposal;
    votes = res.votes;
  } catch {
    error = "Technical committee proposal not found.";
  }

  if (error || !proposal) {
    return (
      <div className="text-center py-20 text-zinc-500">
        {error ?? "Proposal not found."}
      </div>
    );
  }

  const ayes = votes.filter((v) => v.is_aye);
  const nays = votes.filter((v) => !v.is_aye);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/governance/techcomm" className="text-xs text-accent hover:underline">
          ← Technical Committee
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Tech Committee Proposal #{proposal.proposal_index}
        </h1>
      </div>

      {/* Details Card */}
      <div className="card space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-500">Status</p>
            <p className="text-sm text-zinc-100 font-medium capitalize">{proposal.status}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Threshold</p>
            <p className="text-sm text-zinc-300">{proposal.threshold}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Block</p>
            <p className="text-sm text-zinc-300 font-mono">
              {proposal.block_height.toLocaleString()}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Proposer</p>
          <Link
            href={`/account/${proposal.proposer}`}
            className="text-accent hover:underline font-mono text-sm"
          >
            {proposal.proposer}
          </Link>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Proposal Hash</p>
          <p className="font-mono text-sm text-zinc-300 break-all">{proposal.proposal_hash}</p>
        </div>
      </div>

      {/* Vote Tally */}
      <div className="card">
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          Votes ({votes.length} / {proposal.threshold} threshold)
        </h2>

        {/* Visual bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span className="text-green-400">Aye: {ayes.length}</span>
            <span className="text-red-400">Nay: {nays.length}</span>
          </div>
          {votes.length > 0 && (
            <div className="h-3 rounded-full bg-zinc-800 overflow-hidden flex">
              <div
                className="h-full bg-green-500"
                style={{ width: `${(ayes.length / votes.length) * 100}%` }}
              />
              <div className="h-full bg-red-500 flex-1" />
            </div>
          )}
        </div>

        {votes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Voter</th>
                  <th className="pb-2 pr-4">Vote</th>
                  <th className="pb-2 text-right">Block</th>
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => (
                  <tr
                    key={`${v.voter}-${v.block_height}`}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                  >
                    <td className="py-2 pr-4">
                      <Link
                        href={`/account/${v.voter}`}
                        className="text-accent hover:underline font-mono text-xs"
                      >
                        {truncateHash(v.voter, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          v.is_aye
                            ? "bg-green-900/40 text-green-300 border border-green-800/40"
                            : "bg-red-900/40 text-red-300 border border-red-800/40"
                        }`}
                      >
                        {v.is_aye ? "Aye" : "Nay"}
                      </span>
                    </td>
                    <td className="py-2 text-right text-zinc-400 font-mono text-xs">
                      {v.block_height.toLocaleString()}
                    </td>
                  </tr>
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
