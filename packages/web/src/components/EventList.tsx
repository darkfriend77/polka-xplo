"use client";

import React from "react";
import Link from "next/link";
import type { EventSummary } from "@/lib/api";
import { JsonView } from "./JsonView";

/** Convert PascalCase to camelCase (e.g. "System" → "system") */
function toCamelCase(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Tabular event list for block detail pages.
 * Shows each event with its ID, extrinsic, action, and expandable data.
 * Uses statescan-style `module(EventName)` format.
 */
export function EventList({ events }: { events: EventSummary[] }) {
  if (events.length === 0) {
    return <div className="text-center py-8 text-zinc-500">No events found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
            <th className="pb-2 pr-4">Event ID</th>
            <th className="pb-2 pr-4">Extrinsic ID</th>
            <th className="pb-2 pr-4">Action</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {events.map((evt) => (
            <EventRow key={evt.id} event={evt} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({ event }: { event: EventSummary }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasData = event.data && Object.keys(event.data).length > 0;

  return (
    <>
      <tr className="table-row cursor-pointer" onClick={() => hasData && setExpanded(!expanded)}>
        <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">{event.id}</td>
        <td className="py-2.5 pr-4 font-mono text-xs">
          {event.extrinsicId ? (
            <Link href={`/extrinsic/${event.extrinsicId}`} className="text-accent hover:underline">
              {event.extrinsicId}
            </Link>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
        <td className="py-2.5 pr-4">
          <span className="badge-info">
            {toCamelCase(event.module)}({event.event})
          </span>
        </td>
        <td className="py-2.5">
          {hasData && (
            <button className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className={`transform transition-transform ${expanded ? "rotate-90" : ""}`}
              >
                <path
                  d="M7.166 11.333L10.5 8L7.166 4.667"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </td>
      </tr>
      {expanded && hasData && (
        <tr>
          <td colSpan={4} className="pb-3 pt-0 px-4">
            <div className="rounded-lg bg-zinc-800/50 p-3 border border-zinc-700/50">
              <JsonView data={event.data} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
