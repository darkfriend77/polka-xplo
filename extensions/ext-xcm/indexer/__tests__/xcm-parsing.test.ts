import { describe, it, expect } from "vitest";
import {
  decodeCompactU32,
  scaleCompactLen,
  networkFieldLen,
  splitHexJunctions,
  resolveJunctions,
  extractAccountFromMultilocation,
  extractParaIdFromMultilocation,
  parseJunctionAccount,
  parseJunctionParaId,
} from "../event-handlers.js";

// ============================================================
// decodeCompactU32
// ============================================================

describe("decodeCompactU32", () => {
  it("decodes single-byte mode (value 0)", () => {
    // 0 << 2 | 0b00 = 0x00
    expect(decodeCompactU32("00")).toBe(0);
  });

  it("decodes single-byte mode (value 1)", () => {
    // 1 << 2 | 0b00 = 0x04
    expect(decodeCompactU32("04")).toBe(1);
  });

  it("decodes single-byte mode (value 42)", () => {
    // 42 << 2 | 0b00 = 168 = 0xa8
    expect(decodeCompactU32("a8")).toBe(42);
  });

  it("decodes two-byte mode (value 1000)", () => {
    // 1000 << 2 | 0b01 = 4001 = 0x0FA1 → little-endian: A1 0F
    expect(decodeCompactU32("a10f")).toBe(1000);
  });

  it("decodes two-byte mode (value 2034)", () => {
    // 2034 << 2 | 0b01 = 8137 = 0x1FC9 → LE: C9 1F
    expect(decodeCompactU32("c91f")).toBe(2034);
  });

  it("decodes four-byte mode (value 100000)", () => {
    // 100000 << 2 | 0b10 = 400002 = 0x061A82 → LE as 4 bytes: 82 1A 06 00
    expect(decodeCompactU32("821a0600")).toBe(100000);
  });

  it("returns null for empty string", () => {
    expect(decodeCompactU32("")).toBeNull();
  });

  it("returns null for too-short two-byte mode", () => {
    // First byte indicates two-byte mode but only 1 byte provided
    expect(decodeCompactU32("a1")).toBeNull();
  });
});

// ============================================================
// scaleCompactLen
// ============================================================

describe("scaleCompactLen", () => {
  it("returns 1 for single-byte mode", () => {
    expect(scaleCompactLen("04", 0)).toBe(1);
  });

  it("returns 2 for two-byte mode", () => {
    // 0b01 in lower 2 bits → two-byte mode. E.g. 0xA1 → binary 10100001 → mode 01
    expect(scaleCompactLen("a10f", 0)).toBe(2);
  });

  it("returns 4 for four-byte mode", () => {
    // 0b10 in lower 2 bits. E.g. 0x82 → binary 10000010 → mode 10
    expect(scaleCompactLen("821a0600", 0)).toBe(4);
  });

  it("handles hex position offset", () => {
    // "ffff04" — skip first 4 hex chars, which puts us at "04"
    expect(scaleCompactLen("ffff04", 4)).toBe(1);
  });

  it("returns 1 if hex is too short", () => {
    expect(scaleCompactLen("", 0)).toBe(1);
  });
});

// ============================================================
// networkFieldLen
// ============================================================

describe("networkFieldLen", () => {
  it("returns 1 for None (0x00)", () => {
    expect(networkFieldLen("00", 0)).toBe(1);
  });

  it("returns 2 for Some(Polkadot) — variant 0x02", () => {
    expect(networkFieldLen("0102", 0)).toBe(2);
  });

  it("returns 2 for Some(Kusama) — variant 0x03", () => {
    expect(networkFieldLen("0103", 0)).toBe(2);
  });

  it("returns 34 for Some(ByGenesis) — variant 0x00 + 32 bytes", () => {
    expect(networkFieldLen("0100", 0)).toBe(34);
  });

  it("returns 10 for Some(Ethereum) — variant 0x07 + 8 bytes", () => {
    expect(networkFieldLen("0107", 0)).toBe(10);
  });

  it("returns 14 for Some(ByFork) — variant 0x01 + 12 bytes", () => {
    expect(networkFieldLen("0101", 0)).toBe(14);
  });

  it("returns 1 if hex is too short for option byte", () => {
    expect(networkFieldLen("", 0)).toBe(1);
  });
});

// ============================================================
// splitHexJunctions
// ============================================================

describe("splitHexJunctions", () => {
  it("parses single Parachain junction (compact u32 = 1000)", () => {
    // Type 0x00 + compact(1000) = "a10f"
    const result = splitHexJunctions("00a10f");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("0x00a10f");
  });

  it("parses PalletInstance junction", () => {
    // Type 0x04 + 1 byte pallet index (50 = 0x32)
    const result = splitHexJunctions("0432");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("0x0432");
  });

  it("parses AccountId32 junction with None network", () => {
    // Type 0x01 + None(0x00) + 32 bytes account
    const account = "abcd".repeat(16); // 64 hex chars = 32 bytes
    const hex = "0100" + account;
    const result = splitHexJunctions(hex);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("0x" + hex);
  });

  it("parses two junctions: Parachain + AccountId32", () => {
    // Parachain(1000) = 00 a10f
    // AccountId32(None, account) = 01 00 + 32 bytes
    const account = "1234".repeat(16);
    const hex = "00a10f0100" + account;
    const result = splitHexJunctions(hex);
    expect(result).toHaveLength(2);
    // First junction: Parachain
    const paraJunction = result[0];
    expect(parseJunctionParaId(paraJunction)).toBe(1000);
    // Second junction: AccountId32
    const accJunction = result[1];
    expect(parseJunctionAccount(accJunction)).toBe("0x" + account);
  });

  it("returns empty array for empty input", () => {
    expect(splitHexJunctions("")).toEqual([]);
  });

  it("emits remainder as blob for unknown junction type", () => {
    // Type 0xff is unknown
    const result = splitHexJunctions("ff1234");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("0xff1234");
  });
});

// ============================================================
// resolveJunctions
// ============================================================

describe("resolveJunctions", () => {
  it("returns an array as-is", () => {
    const arr = [{ Parachain: 1000 }, { AccountId32: { id: "0xabc" } }];
    expect(resolveJunctions(arr)).toEqual(arr);
  });

  it("wraps a single object in an array", () => {
    expect(resolveJunctions({ Parachain: 1000 })).toEqual([{ Parachain: 1000 }]);
  });

  it("splits a hex string into junctions", () => {
    // Single PalletInstance junction
    const result = resolveJunctions("0x0432");
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("0x0432");
  });

  it("returns empty array for null/undefined", () => {
    expect(resolveJunctions(null)).toEqual([]);
    expect(resolveJunctions(undefined)).toEqual([]);
  });

  it("returns empty array for number", () => {
    expect(resolveJunctions(42)).toEqual([]);
  });
});

// ============================================================
// parseJunctionParaId
// ============================================================

describe("parseJunctionParaId", () => {
  it("parses decoded { Parachain: 1000 }", () => {
    expect(parseJunctionParaId({ Parachain: 1000 })).toBe(1000);
  });

  it("parses decoded { Parachain: 2034 }", () => {
    expect(parseJunctionParaId({ Parachain: 2034 })).toBe(2034);
  });

  it("parses hex junction 0x00 + compact(1000)", () => {
    expect(parseJunctionParaId("0x00a10f")).toBe(1000);
  });

  it("returns null for AccountId32 junction", () => {
    expect(parseJunctionParaId({ AccountId32: { id: "0xabc" } })).toBeNull();
  });

  it("returns null for non-Parachain hex junction", () => {
    // Type 0x01 = AccountId32, not Parachain
    expect(parseJunctionParaId("0x0100" + "ab".repeat(32))).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseJunctionParaId(null)).toBeNull();
  });
});

// ============================================================
// parseJunctionAccount
// ============================================================

describe("parseJunctionAccount", () => {
  it("parses decoded { AccountId32: { id: '0xabc' } }", () => {
    expect(parseJunctionAccount({ AccountId32: { id: "0xdead" } })).toBe("0xdead");
  });

  it("parses decoded { AccountId32: { Id: '0xabc' } } (capital I)", () => {
    expect(parseJunctionAccount({ AccountId32: { Id: "0xcafe" } })).toBe("0xcafe");
  });

  it("extracts account from hex junction (type 0x01, None network)", () => {
    // 0x01 type + 0x00 None network + 32 bytes account
    const account = "ab".repeat(32);
    const hex = "0x0100" + account;
    expect(parseJunctionAccount(hex)).toBe("0x" + account);
  });

  it("extracts account from hex junction (type 0x01, Some(Polkadot) network)", () => {
    // 0x01 type + 0x01 Some + 0x02 Polkadot + 32 bytes account
    const account = "cd".repeat(32);
    const hex = "0x010102" + account;
    expect(parseJunctionAccount(hex)).toBe("0x" + account);
  });

  it("returns empty string for Parachain junction", () => {
    expect(parseJunctionAccount({ Parachain: 1000 })).toBe("");
  });

  it("returns empty string for null", () => {
    expect(parseJunctionAccount(null)).toBe("");
  });
});

// ============================================================
// extractParaIdFromMultilocation
// ============================================================

describe("extractParaIdFromMultilocation", () => {
  it("extracts from X1 decoded junction", () => {
    const loc = {
      parents: 1,
      interior: { X1: { Parachain: 1000 } },
    };
    expect(extractParaIdFromMultilocation(loc)).toBe(1000);
  });

  it("extracts from X1 hex junction", () => {
    const loc = {
      parents: 1,
      interior: { X1: "0x00a10f" },
    };
    expect(extractParaIdFromMultilocation(loc)).toBe(1000);
  });

  it("extracts from X2 with Parachain first", () => {
    const loc = {
      parents: 1,
      interior: {
        X2: [{ Parachain: 2034 }, { AccountId32: { id: "0xabc" } }],
      },
    };
    expect(extractParaIdFromMultilocation(loc)).toBe(2034);
  });

  it("extracts from X2 hex string", () => {
    // Parachain(2034) + AccountId32(None, account)
    const account = "ab".repeat(32);
    const loc = {
      parents: 1,
      interior: { X2: "0x00c91f0100" + account },
    };
    expect(extractParaIdFromMultilocation(loc)).toBe(2034);
  });

  it("returns null for Here interior", () => {
    expect(extractParaIdFromMultilocation({ parents: 1, interior: "Here" })).toBeNull();
  });

  it("returns null for undefined location", () => {
    expect(extractParaIdFromMultilocation(undefined)).toBeNull();
  });

  it("returns null when no Parachain junction exists", () => {
    const loc = {
      parents: 0,
      interior: { X1: { AccountId32: { id: "0xabc" } } },
    };
    expect(extractParaIdFromMultilocation(loc)).toBeNull();
  });
});

// ============================================================
// extractAccountFromMultilocation
// ============================================================

describe("extractAccountFromMultilocation", () => {
  it("extracts from X1 decoded AccountId32", () => {
    const loc = {
      parents: 0,
      interior: { X1: { AccountId32: { id: "0xdeadbeef" } } },
    };
    expect(extractAccountFromMultilocation(loc)).toBe("0xdeadbeef");
  });

  it("extracts from X2 decoded (second junction is account)", () => {
    const loc = {
      parents: 1,
      interior: {
        X2: [{ Parachain: 2034 }, { AccountId32: { id: "0xcafe" } }],
      },
    };
    expect(extractAccountFromMultilocation(loc)).toBe("0xcafe");
  });

  it("returns empty string for Here interior", () => {
    expect(extractAccountFromMultilocation({ parents: 0, interior: "Here" })).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(extractAccountFromMultilocation(undefined)).toBe("");
  });

  it("returns empty string when no AccountId32 junction exists", () => {
    const loc = {
      parents: 1,
      interior: { X1: { Parachain: 1000 } },
    };
    expect(extractAccountFromMultilocation(loc)).toBe("");
  });
});
