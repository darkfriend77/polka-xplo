"use client";

import React, { useState, useRef, useEffect } from "react";
import { PrefixSelector } from "./PrefixSelector";

/**
 * Client-side header navigation with "Blockchain" dropdown and prefix selector.
 */
export function HeaderNav({ apiDocsUrl }: { apiDocsUrl: string }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const blockchainLinks = [
    { href: "/blocks", label: "Blocks" },
    { href: "/extrinsics", label: "Extrinsics" },
    { href: "/transfers", label: "Transfers" },
    { href: "/accounts", label: "Accounts" },
    { href: "/events", label: "Events" },
    { href: "/logs", label: "Logs" },
    { href: "/runtime", label: "Runtime" },
  ];

  return (
    <nav className="hidden sm:flex items-center gap-4 text-sm text-zinc-400">
      {/* Blockchain dropdown */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 hover:text-zinc-100 transition-colors"
        >
          Blockchain
          <svg
            className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-2 w-44 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl shadow-black/40 py-1 z-50">
            {blockchainLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <a
        href="/chain-state/System/Account"
        className="hover:text-zinc-100 transition-colors"
      >
        Chain State
      </a>
      <a
        href={apiDocsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-zinc-100 transition-colors"
      >
        API
      </a>
      <PrefixSelector />
    </nav>
  );
}
