"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, type FormEvent } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Base path, e.g. "/extrinsics" */
  basePath: string;
  /** Extra query params to preserve alongside page, e.g. { signed: "true" } */
  extraParams?: Record<string, string>;
}

/** Build a URL for a given page, preserving extra filter params */
function buildUrl(basePath: string, page: number, extraParams?: Record<string, string>): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      params.set(k, v);
    }
  }
  return `${basePath}?${params.toString()}`;
}

/**
 * Reusable pagination component that provides:
 *  - First / Prev / Next / Last quick-nav
 *  - Smart page number buttons with ellipsis
 *  - "Go to page" input for large datasets
 */
export function Pagination({ currentPage, totalPages, basePath, extraParams }: PaginationProps) {
  const router = useRouter();
  const [goToInput, setGoToInput] = useState("");

  const url = (p: number) => buildUrl(basePath, p, extraParams);

  /** Generate the array of page numbers + ellipsis markers to render */
  const getPageNumbers = useCallback((): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];

    if (totalPages <= 9) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    // Always show first page
    pages.push(1);

    const windowStart = Math.max(2, currentPage - 2);
    const windowEnd = Math.min(totalPages - 1, currentPage + 2);

    if (windowStart > 2) pages.push("ellipsis");
    for (let i = windowStart; i <= windowEnd; i++) pages.push(i);
    if (windowEnd < totalPages - 1) pages.push("ellipsis");

    // Always show last page
    pages.push(totalPages);

    return pages;
  }, [currentPage, totalPages]);

  const handleGoTo = (e: FormEvent) => {
    e.preventDefault();
    const target = parseInt(goToInput, 10);
    if (!target || target < 1 || target > totalPages) return;
    router.push(url(target));
    setGoToInput("");
  };

  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex flex-col items-center gap-3 text-sm">
      {/* Navigation row */}
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {/* First */}
        {currentPage > 2 && (
          <a
            href={url(1)}
            className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="First page"
          >
            &laquo;
          </a>
        )}

        {/* Prev */}
        {currentPage > 1 && (
          <a
            href={url(currentPage - 1)}
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Previous page"
          >
            &lsaquo;
          </a>
        )}

        {/* Page numbers */}
        {pageNumbers.map((item, idx) =>
          item === "ellipsis" ? (
            <span key={`e${idx}`} className="px-1.5 py-1.5 text-zinc-600 select-none">
              &hellip;
            </span>
          ) : (
            <a
              key={item}
              href={url(item)}
              className={`min-w-[2.25rem] text-center px-2 py-1.5 rounded transition-colors ${
                item === currentPage
                  ? "bg-accent/20 text-accent font-semibold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {item.toLocaleString()}
            </a>
          )
        )}

        {/* Next */}
        {currentPage < totalPages && (
          <a
            href={url(currentPage + 1)}
            className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Next page"
          >
            &rsaquo;
          </a>
        )}

        {/* Last */}
        {currentPage < totalPages - 1 && (
          <a
            href={url(totalPages)}
            className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Last page"
          >
            &raquo;
          </a>
        )}
      </div>

      {/* Go-to-page row (only show for large result sets) */}
      {totalPages > 9 && (
        <form onSubmit={handleGoTo} className="flex items-center gap-2 text-xs text-zinc-500">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={goToInput}
            onChange={(e) => setGoToInput(e.target.value)}
            placeholder={String(currentPage)}
            className="w-20 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 text-center
                       focus:outline-none focus:border-accent/50 [appearance:textfield]
                       [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span>of {totalPages.toLocaleString()}</span>
          <button
            type="submit"
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            Go
          </button>
        </form>
      )}
    </div>
  );
}
