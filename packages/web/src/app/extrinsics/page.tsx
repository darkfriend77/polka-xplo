import { getExtrinsics, type ExtrinsicsResponse } from "@/lib/api";
import { ExtrinsicsTable } from "@/components/ExtrinsicsTable";
import { theme } from "@/lib/theme";

/**
 * Extrinsics list page — paginated table of all extrinsics.
 * Supports ?signed=true to hide unsigned (inherent) extrinsics.
 */
export default async function ExtrinsicsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; signed?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;
  const signedOnly = params.signed === "true";

  let extrinsics: ExtrinsicsResponse | null = null;
  let error: string | null = null;

  try {
    extrinsics = await getExtrinsics(pageSize, offset, signedOnly);
  } catch {
    error = "Unable to fetch extrinsics. Is the backend running?";
  }

  const totalPages = extrinsics ? Math.ceil(extrinsics.total / pageSize) : 0;

  /** Build a URL preserving filters */
  function pageUrl(p: number) {
    const parts = [`/extrinsics?page=${p}`];
    if (signedOnly) parts.push("signed=true");
    return parts.join("&");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Extrinsics</h1>
        {extrinsics && (
          <span className="text-sm text-zinc-400">
            {extrinsics.total.toLocaleString()} total
          </span>
        )}
      </div>

      {/* Filter toggle */}
      <div className="flex items-center gap-2 text-sm">
        <a
          href="/extrinsics"
          className={`px-3 py-1 rounded-full transition-colors ${
            !signedOnly
              ? "bg-accent/20 text-accent"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          All
        </a>
        <a
          href="/extrinsics?signed=true"
          className={`px-3 py-1 rounded-full transition-colors ${
            signedOnly
              ? "bg-accent/20 text-accent"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Signed Only
        </a>
      </div>

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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              {page > 1 && (
                <a
                  href={pageUrl(page - 1)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  &larr; Prev
                </a>
              )}
              <span className="px-3 py-1.5 text-zinc-400">
                Page {page} of {totalPages.toLocaleString()}
              </span>
              {page < totalPages && (
                <a
                  href={pageUrl(page + 1)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Next &rarr;
                </a>
              )}
            </div>
          )}
        </>
      )}

      {extrinsics && extrinsics.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {signedOnly
            ? "No signed extrinsics found yet."
            : "No extrinsics found yet. The indexer is still syncing."}
        </div>
      )}
    </div>
  );
}
