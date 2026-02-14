import { IndexerDashboard } from "@/components/IndexerDashboard";

export const dynamic = "force-dynamic";

/**
 * Indexer status page — real-time dashboard showing sync progress,
 * throughput, memory usage, database size, and RPC health.
 */
export default function IndexerStatusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Indexer Status</h1>
      </div>
      <IndexerDashboard />
    </div>
  );
}
