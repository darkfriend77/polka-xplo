import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { register as registerBlocks } from "../api/routes/blocks.js";
import { register as registerSearch } from "../api/routes/search.js";
import { register as registerTransfers } from "../api/routes/transfers.js";
import { register as registerEvents } from "../api/routes/events.js";

/**
 * API route contract tests.
 *
 * We mount individual route modules on a minimal Express app and
 * verify response shapes and status codes.  DB functions are mocked
 * to avoid requiring a live database.
 */

// ---- Mocks ----
vi.mock("@polka-xplo/db", () => ({
  getLatestBlocks: vi.fn(),
  getBlockByHeight: vi.fn(),
  getBlockByHash: vi.fn(),
  getExtrinsicsByBlock: vi.fn(),
  getEventsByBlock: vi.fn(),
  getTransfersList: vi.fn(),
  getEventsList: vi.fn(),
  getEventModules: vi.fn(),
  searchByHash: vi.fn(),
  getAccount: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@polka-xplo/shared", () => ({
  detectSearchType: vi.fn(),
  normalizeAddress: vi.fn(),
}));

// Import the mocked modules so we can control return values
import {
  getLatestBlocks,
  getBlockByHeight,
  getBlockByHash,
  getExtrinsicsByBlock,
  getEventsByBlock,
  getTransfersList,
  getEventsList,
  getEventModules,
  searchByHash,
  getAccount,
} from "@polka-xplo/db";

import { detectSearchType, normalizeAddress } from "@polka-xplo/shared";

// ============================================================
// /api/blocks
// ============================================================

describe("GET /api/blocks", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerBlocks(app);
    vi.clearAllMocks();
  });

  it("returns paginated block list with correct shape", async () => {
    const mockBlocks = [
      { height: 100, hash: "0xabc", timestamp: 1700000000000, extrinsicCount: 3, eventCount: 5 },
      { height: 99, hash: "0xdef", timestamp: 1699999994000, extrinsicCount: 1, eventCount: 2 },
    ];
    vi.mocked(getLatestBlocks).mockResolvedValue({ blocks: mockBlocks, total: 50 });

    const res = await request(app).get("/api/blocks?limit=2&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(50);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
    expect(res.body.hasMore).toBe(true);
  });

  it("clamps limit to max 100", async () => {
    vi.mocked(getLatestBlocks).mockResolvedValue({ blocks: [], total: 0 });

    await request(app).get("/api/blocks?limit=999");

    expect(getLatestBlocks).toHaveBeenCalledWith(100, 0);
  });

  it("returns 400 for invalid limit", async () => {
    const res = await request(app).get("/api/blocks?limit=0");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/blocks/:id", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerBlocks(app);
    vi.clearAllMocks();
  });

  it("returns block detail by height", async () => {
    const mockBlock = { height: 42, hash: "0xabc123" };
    vi.mocked(getBlockByHeight).mockResolvedValue(mockBlock as ReturnType<typeof getBlockByHeight> extends Promise<infer U> ? U : never);
    vi.mocked(getExtrinsicsByBlock).mockResolvedValue([]);
    vi.mocked(getEventsByBlock).mockResolvedValue([]);

    const res = await request(app).get("/api/blocks/42");

    expect(res.status).toBe(200);
    expect(res.body.block.height).toBe(42);
    expect(res.body.extrinsics).toEqual([]);
    expect(res.body.events).toEqual([]);
  });

  it("returns 404 for non-existent block", async () => {
    vi.mocked(getBlockByHeight).mockResolvedValue(null as never);

    const res = await request(app).get("/api/blocks/999999999");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid block identifier", async () => {
    const res = await request(app).get("/api/blocks/not-a-block");
    expect(res.status).toBe(400);
  });

  it("accepts 0x-prefixed 64-char hash", async () => {
    const hash = "0x" + "ab".repeat(32);
    vi.mocked(getBlockByHash).mockResolvedValue({ height: 10, hash } as never);
    vi.mocked(getExtrinsicsByBlock).mockResolvedValue([]);
    vi.mocked(getEventsByBlock).mockResolvedValue([]);

    const res = await request(app).get(`/api/blocks/${hash}`);
    expect(res.status).toBe(200);
    expect(getBlockByHash).toHaveBeenCalledWith(hash);
  });
});

// ============================================================
// /api/transfers
// ============================================================

describe("GET /api/transfers", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerTransfers(app);
    vi.clearAllMocks();
  });

  it("returns paginated transfer list", async () => {
    vi.mocked(getTransfersList).mockResolvedValue({
      data: [{ from: "0xA", to: "0xB", amount: "1000" }],
      total: 1,
    } as never);

    const res = await request(app).get("/api/transfers?limit=10");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });
});

// ============================================================
// /api/events
// ============================================================

describe("GET /api/events/modules", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerEvents(app);
    vi.clearAllMocks();
  });

  it("returns module list", async () => {
    vi.mocked(getEventModules).mockResolvedValue([
      { module: "Balances", events: ["Transfer", "Deposit"] },
    ] as never);

    const res = await request(app).get("/api/events/modules");

    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(1);
    expect(res.body.modules[0].module).toBe("Balances");
  });
});

// ============================================================
// /api/search
// ============================================================

describe("GET /api/search", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    registerSearch(app);
    vi.clearAllMocks();
  });

  it("returns empty results for empty query", async () => {
    const res = await request(app).get("/api/search?q=");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it("searches by block number", async () => {
    vi.mocked(detectSearchType).mockReturnValue("blockNumber");
    vi.mocked(getBlockByHeight).mockResolvedValue({ height: 42, hash: "0xabc" } as never);

    const res = await request(app).get("/api/search?q=42");

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].type).toBe("block");
    expect(res.body.results[0].url).toBe("/block/42");
  });

  it("searches by hash", async () => {
    vi.mocked(detectSearchType).mockReturnValue("hash");
    vi.mocked(searchByHash).mockResolvedValue({
      type: "block",
      data: { height: 10 },
    } as never);

    const hash = "0x" + "ab".repeat(32);
    const res = await request(app).get(`/api/search?q=${hash}`);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].type).toBe("block");
  });

  it("searches by address", async () => {
    vi.mocked(detectSearchType).mockReturnValue("address");
    vi.mocked(normalizeAddress).mockReturnValue("0xhexkey");
    vi.mocked(getAccount).mockResolvedValue({
      address: "0xhexkey",
      publicKey: "0xhexkey",
    } as never);

    const res = await request(app).get("/api/search?q=5GrwvaEF...");

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].type).toBe("account");
  });

  it("returns account result even for unknown addresses", async () => {
    vi.mocked(detectSearchType).mockReturnValue("address");
    vi.mocked(normalizeAddress).mockReturnValue("0xunknown");
    vi.mocked(getAccount).mockResolvedValue(null as never);

    const res = await request(app).get("/api/search?q=unknownaddr");

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].type).toBe("account");
    expect(res.body.results[0].id).toBe("0xunknown");
  });
});
