import { getExtrinsics, getExtrinsicModules, type ExtrinsicsResponse } from "@/lib/api";
import { ExtrinsicsTable } from "@/components/ExtrinsicsTable";
import { ExtrinsicFilter } from "@/components/ExtrinsicFilter";
import { Pagination } from "@/components/Pagination";
import { theme } from "@/lib/theme";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Extrinsics list page — paginated table of all extrinsics.
 * Supports filtering by signed-only, module, and call.
 */
export default async function ExtrinsicsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; signed?: string; module?: string; call?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;
  const signedOnly = params.signed === "true";
  const module = params.module || undefined;
  const call = params.call || undefined;

  let extrinsics: ExtrinsicsResponse | null = null;
  let moduleList: { module: string; calls: string[] }[] = [];
  let error: string | null = null;

  try {
    const [extrinsicsRes, modulesRes] = await Promise.all([
      getExtrinsics(pageSize, offset, signedOnly, module, call),
      getExtrinsicModules(),
    ]);
    extrinsics = extrinsicsRes;
    moduleList = modulesRes.modules;
  } catch {
    error = "Unable to fetch extrinsics. Is the backend running?";
  }

  const totalPages = extrinsics ? Math.ceil(extrinsics.total / pageSize) : 0;
  const filterLabel = [module, call].filter(Boolean).join(".");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-accent hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">
          Extrinsics{filterLabel ? `: ${filterLabel}` : ""}
        </h1>
        {extrinsics && (
          <p className="text-sm text-zinc-400 mt-0.5">{extrinsics.total.toLocaleString()} total</p>
        )}
      </div>

      {/* Dynamic filter dropdowns */}
      <ExtrinsicFilter modules={moduleList} />

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {extrinsics && extrinsics.data.length > 0 && (
        <>
          <div className="card">
            <ExtrinsicsTable
              extrinsics={extrinsics.data}
              tokenSymbol={theme.tokenSymbol}
              tokenDecimals={theme.tokenDecimals}
            />
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/extrinsics"
            extraParams={{
              ...(signedOnly ? { signed: "true" } : {}),
              ...(module ? { module } : {}),
              ...(call ? { call } : {}),
            }}
          />
        </>
      )}

      {extrinsics && extrinsics.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {signedOnly || module
            ? "No extrinsics match the current filters."
            : "No extrinsics found yet. The indexer is still syncing."}
        </div>
      )}
    </div>
  );
}
