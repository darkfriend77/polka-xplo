import { getEvents, getEventModules, type EventsResponse } from "@/lib/api";
import { EventsTable } from "@/components/EventsTable";
import { EventFilter } from "@/components/EventFilter";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

/**
 * Events list page — paginated table of all events, with dynamic module + event filters.
 */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; module?: string; event?: string }>;
}) {
  const params = await searchParams;
  const pageSize = 25;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * pageSize;
  const module = params.module || undefined;
  const eventParam = params.event || undefined;
  const eventNames = eventParam ? eventParam.split(",").filter(Boolean) : undefined;

  let events: EventsResponse | null = null;
  let moduleList: { module: string; events: string[] }[] = [];
  let error: string | null = null;

  try {
    const [eventsRes, modulesRes] = await Promise.all([
      getEvents(pageSize, offset, module, eventNames),
      getEventModules(),
    ]);
    events = eventsRes;
    moduleList = modulesRes.modules;
  } catch {
    error = "Unable to fetch events. Is the backend running?";
  }

  const totalPages = events ? Math.ceil(events.total / pageSize) : 0;
  const filterLabel = [module, eventNames?.join(", ")].filter(Boolean).join(": ");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-zinc-100">
          Events{filterLabel ? `: ${filterLabel}` : ""}
        </h1>
        {events && (
          <span className="text-sm text-zinc-400">{events.total.toLocaleString()} total</span>
        )}
      </div>

      {/* Dynamic filter dropdowns */}
      <EventFilter modules={moduleList} />

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
            extraParams={{
              ...(module ? { module } : {}),
              ...(eventParam ? { event: eventParam } : {}),
            }}
          />
        </>
      )}

      {events && events.data.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          No events found{filterLabel ? ` for "${filterLabel}"` : ""}. The indexer is still syncing.
        </div>
      )}
    </div>
  );
}
