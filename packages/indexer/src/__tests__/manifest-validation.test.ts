import { describe, it, expect } from "vitest";
import { validateManifest } from "../plugins/registry.js";

const VALID_MANIFEST = {
  id: "pallet-staking",
  name: "Staking Extension",
  version: "1.0.0",
  description: "Staking data indexer",
  palletId: "Staking",
  supportedEvents: ["Staking.Rewarded", "Staking.Slashed"],
  supportedCalls: ["Staking.bond", "Staking.unbond"],
};

describe("validateManifest", () => {
  it("should accept a valid manifest", () => {
    const result = validateManifest(VALID_MANIFEST, "test.json");
    expect(result.id).toBe("pallet-staking");
    expect(result.supportedEvents).toHaveLength(2);
  });

  it("should accept a manifest without optional fields", () => {
    const minimal = {
      id: "ext-test",
      name: "Test",
      version: "0.1.0",
      palletId: "Test",
      supportedEvents: [],
      supportedCalls: [],
    };
    const result = validateManifest(minimal, "test.json");
    expect(result.id).toBe("ext-test");
  });

  it("should reject non-object input", () => {
    expect(() => validateManifest(null, "f")).toThrow("must be a JSON object");
    expect(() => validateManifest("string", "f")).toThrow("must be a JSON object");
    expect(() => validateManifest(42, "f")).toThrow("must be a JSON object");
    expect(() => validateManifest([], "f")).toThrow("must be a JSON object");
  });

  it("should reject missing required string fields", () => {
    for (const field of ["id", "name", "version", "palletId"]) {
      const bad = { ...VALID_MANIFEST, [field]: undefined };
      expect(() => validateManifest(bad, "f")).toThrow(`"${field}" must be a non-empty string`);
    }
  });

  it("should reject empty required string fields", () => {
    const bad = { ...VALID_MANIFEST, id: "" };
    expect(() => validateManifest(bad, "f")).toThrow(`"id" must be a non-empty string`);
  });

  it("should reject non-string values in required string fields", () => {
    const bad = { ...VALID_MANIFEST, version: 123 };
    expect(() => validateManifest(bad, "f")).toThrow(`"version" must be a non-empty string`);
  });

  it("should reject missing array fields", () => {
    const bad = { ...VALID_MANIFEST, supportedEvents: undefined };
    expect(() => validateManifest(bad, "f")).toThrow(`"supportedEvents" must be an array`);
  });

  it("should reject non-string items in arrays", () => {
    const bad = { ...VALID_MANIFEST, supportedCalls: [123] };
    expect(() => validateManifest(bad, "f")).toThrow(`"supportedCalls" must contain only strings`);
  });

  it("should reject non-string description", () => {
    const bad = { ...VALID_MANIFEST, description: 123 };
    expect(() => validateManifest(bad, "f")).toThrow(`"description" must be a string`);
  });

  it("should reject non-array dependencies", () => {
    const bad = { ...VALID_MANIFEST, dependencies: "not-array" };
    expect(() => validateManifest(bad, "f")).toThrow(`"dependencies" must be an array`);
  });

  it("should reject non-string items in dependencies", () => {
    const bad = { ...VALID_MANIFEST, dependencies: [42] };
    expect(() => validateManifest(bad, "f")).toThrow(`"dependencies" must contain only strings`);
  });

  it("should accept valid dependencies array", () => {
    const good = { ...VALID_MANIFEST, dependencies: ["ext-assets"] };
    const result = validateManifest(good, "f");
    expect(result.dependencies).toEqual(["ext-assets"]);
  });
});
