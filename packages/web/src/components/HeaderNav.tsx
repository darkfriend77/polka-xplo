"use client";

import React, { useState, useRef, useEffect } from "react";
import { PrefixSelector } from "./PrefixSelector";
import { useTheme } from "@/lib/theme-context";

/**
 * Reusable dropdown menu for the header navigation.
 */
function NavDropdown({
  label,
  links,
}: {
  label: string;
  links: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 hover:text-zinc-100 transition-colors"
      >
        {label}
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
          {links.map((link) => (
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
  );
}

/**
 * Client-side header navigation with "Blockchain" and "Governance" dropdowns,
 * plus a prefix selector.
 */
export function HeaderNav({ apiDocsUrl }: { apiDocsUrl: string }) {
  const theme = useTheme();

  const blockchainLinks = [
    { href: "/blocks", label: "Blocks" },
    { href: "/extrinsics", label: "Extrinsics" },
    { href: "/transfers", label: "Transfers" },
    { href: "/accounts", label: "Accounts" },
    { href: "/events", label: "Events" },
    { href: "/logs", label: "Logs" },
    { href: "/runtime", label: "Runtime" },
  ];

  const governanceLinks = [
    { href: "/governance", label: "Overview" },
    { href: "/governance/referenda", label: "Referenda" },
    { href: "/governance/proposals", label: "Proposals" },
    { href: "/governance/council", label: "Council" },
    { href: "/governance/techcomm", label: "Tech Committee" },
  ];

  return (
    <nav className="hidden sm:flex items-center gap-3 text-sm text-zinc-400">
      <NavDropdown label="Blockchain" links={blockchainLinks} />
      <NavDropdown label="Governance" links={governanceLinks} />
      <a href="/assets" className="hover:text-zinc-100 transition-colors">
        Assets
      </a>
      <a href="/xcm" className="hover:text-zinc-100 transition-colors">
        XCM
      </a>
      <a href="/chain-state/System/Account" className="hover:text-zinc-100 transition-colors">
        Chain State
      </a>
      <a href="/status" className="hover:text-zinc-100 transition-colors">
        Status
      </a>
      <a
        href={apiDocsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-zinc-100 transition-colors"
      >
        API
      </a>

      {/* Separator */}
      <div className="h-4 w-px bg-zinc-700/60" />

      {/* Chain badge — like Subscan's "Parachain" pill */}
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
        style={{
          borderColor: `${theme.accentColor}40`,
          color: theme.accentColor,
          backgroundColor: `${theme.accentColor}10`,
        }}
      >
        {theme.name}
      </span>

      <PrefixSelector />
    </nav>
  );
}
