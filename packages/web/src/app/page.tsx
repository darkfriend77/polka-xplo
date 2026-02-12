import {
  getBlocks,
  getStats,
  getTransfers,
  getSpecVersions,
  type BlockSummary,
  type ChainStats,
  type TransferSummary,
} from "@/lib/api";
import { ChainOverview } from "@/components/ChainOverview";
import { StatsBar } from "@/components/StatsBar";
import { LatestBlocksCard } from "@/components/LatestBlocksCard";
import { LatestTransfersCard } from "@/components/LatestTransfersCard";
import { theme } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * Home page: chain overview panel, stats bar,
 * latest blocks, and latest signed transfers.
 */
export default async function HomePage() {
  let blocks: BlockSummary[] = [];
  let stats: ChainStats | null = null;
  let transfers: TransferSummary[] = [];
  let specVersion: number | null = null;
  let error: string | null = null;

  try {
    const [blocksRes, statsRes, transfersRes, specRes] = await Promise.all([
      getBlocks(10, 0),
      getStats(),
      getTransfers(10),
      getSpecVersions().catch(() => ({ versions: [] })),
    ]);
    blocks = blocksRes.data;
    stats = statsRes;
    transfers = transfersRes;
    if (specRes.versions.length > 0) {
      specVersion = specRes.versions[0].specVersion;
    }
  } catch {
    error = "Unable to connect to the indexer. Is the backend running?";
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {/* Chain overview */}
      {stats && <ChainOverview theme={theme} stats={stats} specVersion={specVersion} />}

      {/* Stats bar */}
      {stats && <StatsBar stats={stats} />}

      {/* Two-column: Latest Blocks + Latest Transfers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Blocks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-100">Latest Blocks</h2>
            <a href="/blocks" className="text-xs text-accent hover:underline">
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
            <h2 className="text-lg font-semibold text-zinc-100">Signed Transfers</h2>
            <a href="/transfers" className="text-xs text-accent hover:underline">
              View All
            </a>
          </div>
          <div className="card">
            <LatestTransfersCard
              transfers={transfers}
              tokenDecimals={theme.tokenDecimals}
              tokenSymbol={theme.tokenSymbol}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
