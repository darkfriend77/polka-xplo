import { Suspense } from "react";
import {
  getBlocks,
  getStats,
  getTransfers,
  getSpecVersions,
  type ChainStats,
} from "@/lib/api";
import { ChainOverview } from "@/components/ChainOverview";
import { StatsBar } from "@/components/StatsBar";
import { LatestBlocksCard } from "@/components/LatestBlocksCard";
import { LatestTransfersCard } from "@/components/LatestTransfersCard";
import Link from "next/link";
import { ActivityChartWrapper } from "@/components/ActivityChartWrapper";
import { theme } from "@/lib/theme";
import { SkeletonCard } from "@/components/Skeleton";

export const dynamic = "force-dynamic";

// ---- Async server components for streaming ----

/** Light section: stats + overview. Usually the fastest API call. */
async function ChainStatsSection() {
  let stats: ChainStats | null = null;
  let specVersion: number | null = null;
  let fetchError = false;

  try {
    const [statsRes, specRes] = await Promise.all([
      getStats(),
      getSpecVersions().catch(() => ({ versions: [] })),
    ]);
    stats = statsRes;
    specVersion = specRes.versions.length > 0 ? specRes.versions[0]!.specVersion : null;
  } catch {
    fetchError = true;
  }

  if (fetchError) {
    return (
      <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
        Unable to connect to the indexer. Is the backend running?
      </div>
    );
  }

  return (
    <>
      {stats && <ChainOverview theme={theme} stats={stats} specVersion={specVersion} />}
      {stats && <StatsBar stats={stats} />}
    </>
  );
}

/** Latest blocks card — streamed independently. */
async function LatestBlocksSection() {
  const blocksRes = await getBlocks(10, 0);
  return <LatestBlocksCard blocks={blocksRes.data} />;
}

/** Latest transfers card — streamed independently. */
async function LatestTransfersSection() {
  const transfers = await getTransfers(10);
  return (
    <LatestTransfersCard
      transfers={transfers}
      tokenDecimals={theme.tokenDecimals}
      tokenSymbol={theme.tokenSymbol}
    />
  );
}

// ---- Skeleton fallbacks ----

function StatsSkeletonFallback() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard className="lg:col-span-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </>
  );
}

function CardSkeletonFallback() {
  return <SkeletonCard className="h-64" />;
}

/**
 * Home page: Uses React Suspense to stream each section independently.
 * The shell renders instantly, then each async section fills in as its
 * data arrives — no single slow query blocks the entire page.
 */
export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Chain overview + stats bar — streams first */}
      <Suspense fallback={<StatsSkeletonFallback />}>
        <ChainStatsSection />
      </Suspense>

      {/* Chain Activity Chart — client-side, already lazy-loaded */}
      <ActivityChartWrapper />

      {/* Two-column: Latest Blocks + Latest Transfers — streamed independently */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Blocks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-100">Latest Blocks</h2>
            <Link href="/blocks" className="text-xs text-accent hover:underline">
              View All
            </Link>
          </div>
          <div className="card">
            <Suspense fallback={<CardSkeletonFallback />}>
              <LatestBlocksSection />
            </Suspense>
          </div>
        </section>

        {/* Signed Transfers */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-zinc-100">Signed Transfers</h2>
            <Link href="/transfers" className="text-xs text-accent hover:underline">
              View All
            </Link>
          </div>
          <div className="card">
            <Suspense fallback={<CardSkeletonFallback />}>
              <LatestTransfersSection />
            </Suspense>
          </div>
        </section>
      </div>
    </div>
  );
}
