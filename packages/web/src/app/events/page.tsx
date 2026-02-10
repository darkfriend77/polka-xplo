import { getEvents, type EventsResponse } from "@/lib/api";
import { EventsTable } from "@/components/EventsTable";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

/**
 * Events list page — paginated table of all events, with optional module filter.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; module?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;
  const module = params.module || undefined;

  let events: EventsResponse | null = null;
  let error: string | null = null;

  try {
    events = await getEvents(pageSize, offset, module);
  } catch {
    error = "Unable to fetch events. Is the backend running?";
  }

  const totalPages = events ? Math.ceil(events.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-zinc-100">
          Events{module ? `: ${module}` : ""}
        </h1>
        {events && (
          <span className="text-sm text-zinc-400">
            {events.total.toLocaleString()} total
          </span>
        )}
      </div>

      {/* Module filter */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">Filter:</span>
        <a
          href="/events"
          className={`px-2 py-1 rounded text-xs transition-colors ${
            !module
              ? "bg-accent/20 text-accent"
              : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          All
        </a>
        {["System", "Balances", "TransactionPayment", "Staking", "Session", "Treasury"].map(
          (m) => (
            <a
              key={m}
              href={`/events?module=${m}`}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                module === m
                  ? "bg-accent/20 text-accent"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {m}
            </a>
          )
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-950/30 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {events && events.data.length > 0 && (
        <>
          <div className="card">
            <EventsTable events={events.data} />
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/events"
            extraParams={module ? { module } : undefined}
          />
        </>
      )}

      {events && events.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No events found{module ? ` for module "${module}"` : ""}. The indexer is still syncing.
        </div>
      )}
    </div>
  );
}
