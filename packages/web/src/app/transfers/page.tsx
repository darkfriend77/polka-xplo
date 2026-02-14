import { getTransfersList, type TransfersResponse } from "@/lib/api";
import { TransfersTable } from "@/components/TransfersTable";
import { Pagination } from "@/components/Pagination";
import { theme } from "@/lib/theme";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Transfers list page — paginated table of all balance transfer events.
 */
export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  let transfers: TransfersResponse | null = null;
  let error: string | null = null;

  try {
    transfers = await getTransfersList(pageSize, offset);
  } catch {
    error = "Unable to fetch transfers. Is the backend running?";
  }

  const totalPages = transfers ? Math.ceil(transfers.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-accent hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Transfers</h1>
        {transfers && (
          <p className="text-sm text-zinc-400 mt-0.5">{transfers.total.toLocaleString()} total</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {transfers && transfers.data.length > 0 && (
        <>
          <div className="card">
            <TransfersTable
              transfers={transfers.data}
              tokenSymbol={theme.tokenSymbol}
              tokenDecimals={theme.tokenDecimals}
            />
          </div>

          <Pagination currentPage={page} totalPages={totalPages} basePath="/transfers" />
        </>
      )}

      {transfers && transfers.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No transfers found yet. The indexer is still syncing.
        </div>
      )}
    </div>
  );
}
