import {
  getSpecVersions,
  getRuntimeModules,
  type SpecVersionInfo,
  type RuntimeSummary,
} from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Runtime Modules page — shows all pallets for a given spec version
 * with their call, event, storage, constant, and error counts.
 *
 * Defaults to the latest indexed spec version. Supports ?v=N to select a specific version.
 */
export default async function RuntimePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;

  let versions: SpecVersionInfo[] = [];
  let runtime: RuntimeSummary | null = null;
  let error: string | null = null;
  let activeVersion: number | null = null;

  try {
    const versionsRes = await getSpecVersions();
    versions = versionsRes.versions;

    if (versions.length === 0) {
      error = "No runtime versions indexed yet. The indexer is still syncing.";
    } else {
      // Pick the requested version or the latest
      activeVersion = params.v ? parseInt(params.v, 10) : versions[0]!.specVersion;
      runtime = await getRuntimeModules(activeVersion);
    }
  } catch {
    error = "Unable to fetch runtime data. Is the backend running?";
  }

  const totalCalls = runtime?.pallets.reduce((s, p) => s + p.callCount, 0) ?? 0;
  const totalEvents = runtime?.pallets.reduce((s, p) => s + p.eventCount, 0) ?? 0;
  const totalStorage = runtime?.pallets.reduce((s, p) => s + p.storageCount, 0) ?? 0;
  const totalConstants = runtime?.pallets.reduce((s, p) => s + p.constantCount, 0) ?? 0;
  const totalErrors = runtime?.pallets.reduce((s, p) => s + p.errorCount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Runtime Modules</h1>
        {runtime && <p className="text-sm text-zinc-400 mt-0.5">{runtime.pallets.length} pallets</p>}
      </div>

      {/* Spec version selector */}
      {versions.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-zinc-400">Spec Version:</span>
          <div className="flex flex-wrap gap-2">
            {versions.map((v) => (
              <a
                key={v.specVersion}
                href={`/runtime?v=${v.specVersion}`}
                className={`px-3 py-1 rounded-full text-sm font-mono transition-colors ${
                  v.specVersion === activeVersion
                    ? "bg-accent/20 text-accent"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {v.specVersion}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Version info bar */}
      {activeVersion != null && versions.length > 0 && (
        <div className="text-xs text-zinc-500">
          {(() => {
            const v = versions.find((x) => x.specVersion === activeVersion);
            if (!v) return null;
            return (
              <>
                Blocks #{v.fromBlock.toLocaleString()} – #{v.toBlock.toLocaleString()} (
                {v.blockCount.toLocaleString()} blocks)
              </>
            );
          })()}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {/* Summary row */}
      {runtime && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard label="Call Functions" value={totalCalls} />
          <SummaryCard label="Events" value={totalEvents} />
          <SummaryCard label="Storage" value={totalStorage} />
          <SummaryCard label="Constants" value={totalConstants} />
          <SummaryCard label="Errors" value={totalErrors} />
        </div>
      )}

      {/* Pallets table */}
      {runtime && runtime.pallets.length > 0 && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4 text-right">Call Functions</th>
                  <th className="pb-2 pr-4 text-right">Events</th>
                  <th className="pb-2 pr-4 text-right">Storage Functions</th>
                  <th className="pb-2 pr-4 text-right">Constants</th>
                  <th className="pb-2 text-right">Error Types</th>
                </tr>
              </thead>
              <tbody>
                {runtime.pallets.map((pallet) => (
                  <tr key={pallet.index} className="table-row">
                    <td className="py-2.5 pr-4 font-medium text-zinc-200">{pallet.name}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-400">{pallet.callCount}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-400">{pallet.eventCount}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-400">{pallet.storageCount}</td>
                    <td className="py-2.5 pr-4 text-right text-zinc-400">{pallet.constantCount}</td>
                    <td className="py-2.5 text-right text-zinc-400">{pallet.errorCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-800 text-xs font-semibold text-zinc-300">
                  <td className="pt-2 pr-4">Total</td>
                  <td className="pt-2 pr-4 text-right">{totalCalls}</td>
                  <td className="pt-2 pr-4 text-right">{totalEvents}</td>
                  <td className="pt-2 pr-4 text-right">{totalStorage}</td>
                  <td className="pt-2 pr-4 text-right">{totalConstants}</td>
                  <td className="pt-2 text-right">{totalErrors}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-900/60 rounded-lg p-3 text-center">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
