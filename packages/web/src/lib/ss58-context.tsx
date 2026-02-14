"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { ss58Encode, ss58Decode } from "@polka-xplo/shared";

/** Well-known SS58 prefixes */
export const SS58_PRESETS = [
  { prefix: 42, label: "Substrate (42)" },
  { prefix: 0, label: "Polkadot (0)" },
  { prefix: 2, label: "Kusama (2)" },
  { prefix: 1328, label: "Ajuna (1328)" },
  { prefix: 5, label: "Astar (5)" },
  { prefix: 7, label: "Edgeware (7)" },
] as const;

interface SS58ContextValue {
  prefix: number;
  setPrefix: (p: number) => void;
  formatAddress: (hexOrSs58: string) => string;
}

const SS58Context = createContext<SS58ContextValue>({
  prefix: 42,
  setPrefix: () => {},
  formatAddress: (v) => v,
});

export function SS58Provider({
  children,
  defaultPrefix = 42,
}: {
  children: React.ReactNode;
  defaultPrefix?: number;
}) {
  const [prefix, setPrefix] = useState(defaultPrefix);

  const formatAddress = useCallback(
    (hexOrSs58: string): string => {
      if (!hexOrSs58) return "—";
      // If it looks like a hex public key, encode it directly
      if (/^0x[0-9a-fA-F]{64}$/.test(hexOrSs58)) {
        return ss58Encode(hexOrSs58, prefix);
      }
      // Already an SS58 address — decode to hex first, then re-encode with current prefix
      const hex = ss58Decode(hexOrSs58);
      if (hex) return ss58Encode(hex, prefix);
      return hexOrSs58;
    },
    [prefix],
  );

  return (
    <SS58Context.Provider value={{ prefix, setPrefix, formatAddress }}>
      {children}
    </SS58Context.Provider>
  );
}

export function useSS58() {
  return useContext(SS58Context);
}
