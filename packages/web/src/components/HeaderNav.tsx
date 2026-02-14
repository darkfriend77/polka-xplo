"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { PrefixSelector } from "./PrefixSelector";
import { useTheme } from "@/lib/theme-context";

/**
 * Reusable dropdown menu for the header navigation.
 * Supports keyboard navigation (Escape, ArrowDown/Up, Home, End).
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
  const itemsRef = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus first item when dropdown opens
  useEffect(() => {
    if (open && itemsRef.current[0]) {
      itemsRef.current[0].focus();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Return focus to the trigger button
        (ref.current?.querySelector("button") as HTMLElement)?.focus();
        return;
      }

      if (!open) {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      const items = itemsRef.current.filter(Boolean) as HTMLAnchorElement[];
      const currentIndex = items.indexOf(document.activeElement as HTMLAnchorElement);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          items[(currentIndex + 1) % items.length]?.focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          items[(currentIndex - 1 + items.length) % items.length]?.focus();
          break;
        case "Home":
          e.preventDefault();
          items[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          items[items.length - 1]?.focus();
          break;
      }
    },
    [open],
  );

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
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
        <div
          role="menu"
          className="absolute top-full left-0 mt-2 w-44 rounded-lg border border-zinc-700/50 bg-zinc-900 shadow-xl shadow-black/40 py-1 z-50"
        >
          {links.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors focus:outline-none focus:bg-zinc-800/60 focus:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Mobile navigation section — renders a group label with links underneath.
 */
function MobileNavSection({
  title,
  links,
  onClose,
}: {
  title: string;
  links: { href: string; label: string }[];
  onClose: () => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 mb-1">
        {title}
      </h3>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onClose}
          className="block px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * Client-side header navigation with "Blockchain" and "Governance" dropdowns,
 * a prefix selector, and a mobile hamburger menu.
 */
export function HeaderNav({ apiDocsUrl }: { apiDocsUrl: string }) {
  const theme = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const directLinks = [
    { href: "/assets", label: "Assets" },
    { href: "/xcm", label: "XCM" },
    { href: "/chain-state/System/Account", label: "Chain State" },
    { href: "/status", label: "Status" },
  ];

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* ── Desktop Navigation ────────────────────────────────── */}
      <nav className="hidden sm:flex items-center gap-3 text-sm text-zinc-400">
        <NavDropdown label="Blockchain" links={blockchainLinks} />
        <NavDropdown label="Governance" links={governanceLinks} />
        {directLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hover:text-zinc-100 transition-colors"
          >
            {link.label}
          </Link>
        ))}
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

        {/* Chain badge */}
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

      {/* ── Mobile Hamburger Button ───────────────────────────── */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="sm:hidden p-2 text-zinc-400 hover:text-zinc-100 transition-colors"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        )}
      </button>

      {/* ── Mobile Slide-out Menu ─────────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Overlay backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-40 sm:hidden"
            onClick={() => setMobileOpen(false)}
          />

          {/* Slide-out panel */}
          <nav
            className="fixed top-0 right-0 h-full w-72 bg-zinc-900 border-l border-zinc-800 z-50 sm:hidden overflow-y-auto"
            role="navigation"
            aria-label="Mobile navigation"
          >
            {/* Close button */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
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
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100"
                aria-label="Close menu"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation sections */}
            <div className="py-3 space-y-4">
              <MobileNavSection title="Blockchain" links={blockchainLinks} onClose={() => setMobileOpen(false)} />
              <MobileNavSection title="Governance" links={governanceLinks} onClose={() => setMobileOpen(false)} />
              <MobileNavSection title="Explore" links={directLinks} onClose={() => setMobileOpen(false)} />

              {/* API (external link) */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-4 mb-1">
                  Developer
                </h3>
                <a
                  href={apiDocsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-2.5 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
                >
                  API Docs ↗
                </a>
              </div>

              {/* Prefix selector in mobile menu */}
              <div className="px-4 pt-2 border-t border-zinc-800">
                <PrefixSelector />
              </div>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
