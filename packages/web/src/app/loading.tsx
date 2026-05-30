import { SkeletonCard } from "@/components/Skeleton";

/** Home page loading skeleton — mirrors ChainOverview + StatsBar + chart + two-column grid. */
export default function HomeLoading() {
  return (
    <div className="space-y-6">
      {/* ChainOverview placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard className="lg:col-span-2" />
      </div>

      {/* StatsBar placeholder */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Two-column grid placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
    </div>
  );
}
