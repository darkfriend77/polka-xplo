import { getLogs, type LogsResponse } from "@/lib/api";
import { LogsTable } from "@/components/LogsTable";
import { Pagination } from "@/components/Pagination";

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Logs</h1>
        {logs && (
          <span className="text-sm text-zinc-400">
            {logs.total.toLocaleString()} total
          </span>
        )}
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

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/logs"
          />
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
