import { getLogs, type LogsResponse } from "@/lib/api";
import { LogsTable } from "@/components/LogsTable";
import { Pagination } from "@/components/Pagination";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Logs list page — paginated table of all block digest logs.
 */
export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;

  let logs: LogsResponse | null = null;
  let error: string | null = null;

  try {
    logs = await getLogs(pageSize, offset);
  } catch {
    error = "Unable to fetch logs. Is the backend running?";
  }

  const totalPages = logs ? Math.ceil(logs.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-accent hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-zinc-100 mt-1">Logs</h1>
        {logs && <p className="text-sm text-zinc-400 mt-0.5">{logs.total.toLocaleString()} total</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {logs && logs.data.length > 0 && (
        <>
          <div className="card">
            <LogsTable logs={logs.data} />
          </div>

          <Pagination currentPage={page} totalPages={totalPages} basePath="/logs" />
        </>
      )}

      {logs && logs.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No logs found yet. The indexer is still syncing.
        </div>
      )}
    </div>
  );
}
