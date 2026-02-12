"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ExtrinsicModuleInfo } from "@/lib/api";

/**
 * Dynamic extrinsic filter with module → call dropdowns and quick-toggle checkboxes.
 *
 * - Module: single-select dropdown
 * - Call: multi-select checkboxes (shown when a module is selected)
 * - Signed Only: toggle checkbox
 */
export function ExtrinsicFilter({ modules }: { modules: ExtrinsicModuleInfo[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentModule = searchParams.get("module") ?? "";
  const currentCallParam = searchParams.get("call") ?? "";
  const signedOnly = searchParams.get("signed") === "true";

  // Parse comma-separated call params into a Set for O(1) lookup
  const selectedCalls = useMemo(
    () => new Set(currentCallParam.split(",").filter(Boolean)),
    [currentCallParam],
  );

  const [moduleOpen, setModuleOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const moduleRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<HTMLDivElement>(null);

  // Available calls for the selected module
  const selectedModuleInfo = modules.find((m) => m.module === currentModule);
  const availableCalls = selectedModuleInfo?.calls ?? [];

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (moduleRef.current && !moduleRef.current.contains(e.target as Node)) {
        setModuleOpen(false);
      }
      if (callRef.current && !callRef.current.contains(e.target as Node)) {
        setCallOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navigate = useCallback(
    (module: string, calls: string[], signed: boolean) => {
      const params = new URLSearchParams();
      if (module) params.set("module", module);
      if (calls.length > 0) params.set("call", calls.join(","));
      if (signed) params.set("signed", "true");
      router.push(`/extrinsics${params.toString() ? `?${params.toString()}` : ""}`);
    },
    [router],
  );

  /** Toggle a single call in the multi-select */
  const toggleCall = useCallback(
    (call: string) => {
      const next = new Set(selectedCalls);
      if (next.has(call)) {
        next.delete(call);
      } else {
        next.add(call);
      }
      navigate(currentModule, Array.from(next), signedOnly);
    },
    [selectedCalls, currentModule, signedOnly, navigate],
  );

  /** Button label for call dropdown */
  const callLabel = useMemo(() => {
    if (selectedCalls.size === 0) return "All Calls";
    if (selectedCalls.size === 1) return Array.from(selectedCalls)[0];
    return `${selectedCalls.size} calls selected`;
  }, [selectedCalls]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Signed Only toggle */}
      <button
        onClick={() => navigate(currentModule, Array.from(selectedCalls), !signedOnly)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
          signedOnly
            ? "bg-accent/10 text-accent border-accent/30"
            : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:text-zinc-200"
        }`}
      >
        <span
          className={`flex items-center justify-center w-4 h-4 rounded border text-xs transition-colors ${
            signedOnly
              ? "bg-accent/20 border-accent/50 text-accent"
              : "border-zinc-600 text-transparent"
          }`}
        >
          ✓
        </span>
        <span>Signed Only</span>
      </button>

      {/* Module dropdown — single select */}
      <div ref={moduleRef} className="relative">
        <button
          onClick={() => {
            setModuleOpen(!moduleOpen);
            setCallOpen(false);
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
                navigate("", [], signedOnly);
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
                  navigate(m.module, [], signedOnly);
                  setModuleOpen(false);
                }}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                  currentModule === m.module
                    ? "text-accent bg-accent/10"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                }`}
              >
                <span>{m.module}</span>
                <span className="ml-2 text-xs text-zinc-600">({m.calls.length})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Call type dropdown — multi-select with checkboxes */}
      {currentModule && availableCalls.length > 0 && (
        <div ref={callRef} className="relative">
          <button
            onClick={() => {
              setCallOpen(!callOpen);
              setModuleOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              selectedCalls.size > 0
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-zinc-800/60 text-zinc-400 border-zinc-700/50 hover:text-zinc-200"
            }`}
          >
            <span>{callLabel}</span>
            {selectedCalls.size > 1 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-medium">
                {selectedCalls.size}
              </span>
            )}
            <svg
              className={`w-3.5 h-3.5 transition-transform ${callOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {callOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 max-h-80 overflow-y-auto rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl shadow-black/40 py-1 z-50">
              {/* Select all / clear header */}
              <button
                onClick={() => navigate(currentModule, [], signedOnly)}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                  selectedCalls.size === 0
                    ? "text-accent bg-accent/10"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                }`}
              >
                All Calls
              </button>
              <div className="border-t border-zinc-800 my-1" />
              {availableCalls.map((c) => {
                const checked = selectedCalls.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCall(c)}
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
                    <span>{c}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected call tags — quick deselect chips */}
      {selectedCalls.size > 0 &&
        Array.from(selectedCalls).map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent text-xs border border-accent/20"
          >
            {c}
            <button
              onClick={() => toggleCall(c)}
              className="hover:text-white transition-colors"
              aria-label={`Remove ${c} filter`}
            >
              ✕
            </button>
          </span>
        ))}

      {/* Clear all filters */}
      {(currentModule || selectedCalls.size > 0 || signedOnly) && (
        <button
          onClick={() => navigate("", [], false)}
          className="px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ✕ Clear
        </button>
      )}
    </div>
  );
}
