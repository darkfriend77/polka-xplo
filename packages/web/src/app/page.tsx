import {
  getBlocks,
  getStats,
  getTransfers,
  type BlockSummary,
  type ChainStats,
  type TransferSummary,
} from "@/lib/api";
import { OmniSearch } from "@/components/OmniSearch";
import { StatsBar } from "@/components/StatsBar";
import { LatestBlocksCard } from "@/components/LatestBlocksCard";
import { LatestTransfersCard } from "@/components/LatestTransfersCard";

/**
 * Home page: statescan-style dashboard with stats bar,
 * latest blocks, and latest signed transfers.
 */
export default async function HomePage() {
  let blocks: BlockSummary[] = [];
  let stats: ChainStats | null = null;
  let transfers: TransferSummary[] = [];
  let error: string | null = null;

  try {
    const [blocksRes, statsRes, transfersRes] = await Promise.all([
      getBlocks(10, 0),
      getStats(),
      getTransfers(10),
    ]);
    blocks = blocksRes.data;
    stats = statsRes;
    transfers = transfersRes;
  } catch {
    error = "Unable to connect to the indexer. Is the backend running?";
  }

  return (
    <div className="space-y-6">
      {/* Hero search */}
      <section className="py-6 text-center space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100">
          Polka-Xplo Explorer
        </h1>
        <p className="text-sm text-zinc-400">
          Search blocks, extrinsics, accounts, and transfers
        </p>
        <OmniSearch />
      </section>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {/* Stats bar */}
      {stats && <StatsBar stats={stats} />}

      {/* Two-column: Latest Blocks + Latest Transfers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Blocks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-100">
              Latest Blocks
            </h2>
            <a
              href="/block/latest"
              className="text-xs text-polkadot-pink hover:underline"
            >
              View All
            </a>
          </div>
          <div className="card">
            <LatestBlocksCard blocks={blocks} />
          </div>
        </section>

        {/* Signed Transfers */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-100">
              Signed Transfers
            </h2>
          </div>
          <div className="card">
            <LatestTransfersCard transfers={transfers} />
          </div>
        </section>
      </div>
    </div>
  );
}
