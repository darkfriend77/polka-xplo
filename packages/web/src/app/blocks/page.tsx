import { getBlocks, type BlocksResponse } from "@/lib/api";
import { BlocksTable } from "@/components/BlocksTable";
import { Pagination } from "@/components/Pagination";

/**
 * Blocks list page — paginated table of all indexed blocks.
 */
export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  let blocks: BlocksResponse | null = null;
  let error: string | null = null;

  try {
    blocks = await getBlocks(pageSize, offset);
  } catch {
    error = "Unable to fetch blocks. Is the backend running?";
  }

  const totalPages = blocks ? Math.ceil(blocks.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Blocks</h1>
        {blocks && (
          <span className="text-sm text-zinc-400">
            {blocks.total.toLocaleString()} total
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {blocks && blocks.data.length > 0 && (
        <>
          <div className="card">
            <BlocksTable blocks={blocks.data} />
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/blocks"
          />
        </>
      )}

      {blocks && blocks.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No blocks found yet. The indexer is still syncing.
        </div>
      )}
    </div>
  );
}
