"use client";

import dynamic from "next/dynamic";

/**
 * Polkadot Identicon — Client Component wrapper.
 *
 * Uses @polkadot/react-identicon which renders the standard colored-circles
 * identity icon used across the Polkadot ecosystem. Dynamically imported
 * with SSR disabled since it relies on browser APIs.
 */
const PolkadotIdenticon = dynamic(() => import("@polkadot/react-identicon"), {
  ssr: false,
  loading: () => (
    <div className="rounded-full bg-zinc-700 animate-pulse" style={{ width: 40, height: 40 }} />
  ),
});

export function Identicon({
  address,
  size = 40,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  // Ensure hex address has 0x prefix for polkadot identicon
  const value = address.startsWith("0x") ? address : `0x${address}`;

  return (
    <span className={className}>
      <PolkadotIdenticon value={value} size={size} theme="polkadot" />
    </span>
  );
}
