"use client";

import React from "react";
import Link from "next/link";
import { useSS58 } from "@/lib/ss58-context";

/**
 * Displays a hex public key as an SS58 address using the current prefix.
 * Client component that reacts to prefix changes.
 */
export function AddressDisplay({
  address,
  className = "",
  truncate = false,
  link = false,
}: {
  address: string;
  className?: string;
  truncate?: boolean;
  link?: boolean;
}) {
  const { formatAddress } = useSS58();
  const formatted = formatAddress(address);
  const display = truncate ? truncateSs58(formatted) : formatted;

  if (link) {
    return (
      <Link href={`/account/${address}`} className={`text-accent hover:underline ${className}`}>
        {display}
      </Link>
    );
  }

  return <span className={className}>{display}</span>;
}

/** Truncate an SS58 or hex address for compact display */
function truncateSs58(addr: string, chars: number = 6): string {
  if (!addr || addr.length <= chars * 2 + 2) return addr ?? "";
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
