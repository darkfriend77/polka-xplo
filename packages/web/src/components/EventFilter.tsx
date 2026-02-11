"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { EventModuleInfo } from "@/lib/api";

/**
 * Dynamic event filter with cascading module → event dropdowns.
 * Module is single-select; event types support multi-select with checkboxes.
 */
export function EventFilter({ modules }: { modules: EventModuleInfo[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentModule = searchParams.get("module") ?? "";
  const currentEventParam = searchParams.get("event") ?? "";

  // Parse comma-separated event params into a Set for O(1) lookup
  const selectedEvents = useMemo(
    () => new Set(currentEventParam.split(",").filter(Boolean)),
    [currentEventParam],
  );

  const [moduleOpen, setModuleOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const moduleRef = useRef<HTMLDivElement>(null);
  const eventRef = useRef<HTMLDivElement>(null);

  // Available events for the selected module
  const selectedModuleInfo = modules.find((m) => m.module === currentModule);
  const availableEvents = selectedModuleInfo?.events ?? [];

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moduleRef.current && !moduleRef.current.contains(e.target as Node)) {
        setModuleOpen(false);
      }
      if (eventRef.current && !eventRef.current.contains(e.target as Node)) {
        setEventOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navigate = useCallback(
    (module: string, events: string[]) => {
      const params = new URLSearchParams();
      if (module) params.set("module", module);
      if (events.length > 0) params.set("event", events.join(","));
      router.push(`/events${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [router],
  );

  /** Toggle a single event in the multi-select */
  const toggleEvent = useCallback(
    (evt: string) => {
      const next = new Set(selectedEvents);
      if (next.has(evt)) {
        next.delete(evt);
      } else {
        next.add(evt);
      }
      navigate(currentModule, Array.from(next));
    },
    [selectedEvents, currentModule, navigate],
  );

  /** Button label for event dropdown */
  const eventLabel = useMemo(() => {
    if (selectedEvents.size === 0) return "All Events";
    if (selectedEvents.size === 1) return Array.from(selectedEvents)[0];
    return `${selectedEvents.size} events selected`;
  }, [selectedEvents]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Module dropdown — single select */}
      <div ref={moduleRef} className="relative">
        <button
          onClick={() => {
            setModuleOpen(!moduleOpen);
            setEventOpen(false);
          }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            currentModule
              ? "bg-accent/10 text-accent border-accent/30"
              : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:text-zinc-200"
          }`}
        >
          <span>{currentModule || "All Modules"}</span>
          <svg
            className={`w-3.5 h-3.5 transition-transform ${moduleOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {moduleOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl shadow-black/40 py-1 z-50">
            <button
              onClick={() => {
                navigate("", []);
                setModuleOpen(false);
              }}
              className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                !currentModule
                  ? "text-accent bg-accent/10"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
              }`}
            >
              All Modules
            </button>
            {modules.map((m) => (
              <button
                key={m.module}
                onClick={() => {
                  navigate(m.module, []);
                  setModuleOpen(false);
                }}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                  currentModule === m.module
                    ? "text-accent bg-accent/10"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                }`}
              >
                <span>{m.module}</span>
                <span className="ml-2 text-xs text-zinc-600">({m.events.length})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Event type dropdown — multi-select with checkboxes */}
      {currentModule && availableEvents.length > 0 && (
        <div ref={eventRef} className="relative">
          <button
            onClick={() => {
              setEventOpen(!eventOpen);
              setModuleOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              selectedEvents.size > 0
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:text-zinc-200"
            }`}
          >
            <span>{eventLabel}</span>
            {selectedEvents.size > 1 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-medium">
                {selectedEvents.size}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 transition-transform ${eventOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {eventOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl shadow-black/40 py-1 z-50">
              {/* Select all / clear header */}
              <button
                onClick={() => navigate(currentModule, [])}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                  selectedEvents.size === 0
                    ? "text-accent bg-accent/10"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                }`}
              >
                All Events
              </button>
              <div className="border-t border-zinc-800 my-1" />
              {availableEvents.map((evt) => {
                const checked = selectedEvents.has(evt);
                return (
                  <button
                    key={evt}
                    onClick={() => toggleEvent(evt)}
                    className={`flex items-center gap-2.5 w-full text-left px-4 py-2 text-sm transition-colors ${
                      checked
                        ? "text-accent bg-accent/5"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border text-xs transition-colors ${
                        checked
                          ? "bg-accent/20 border-accent/50 text-accent"
                          : "border-zinc-600 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span>{evt}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected event tags — quick deselect chips */}
      {selectedEvents.size > 0 &&
        Array.from(selectedEvents).map((evt) => (
          <span
            key={evt}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent text-xs border border-accent/20"
          >
            {evt}
            <button
              onClick={() => toggleEvent(evt)}
              className="hover:text-white transition-colors"
              aria-label={`Remove ${evt} filter`}
            >
              ✕
            </button>
          </span>
        ))}

      {/* Clear all filters */}
      {(currentModule || selectedEvents.size > 0) && (
        <button
          onClick={() => navigate("", [])}
          className="px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
}
