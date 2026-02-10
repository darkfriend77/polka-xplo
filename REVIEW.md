# Polka-Xplo — Architecture Review & Issue Tracker

**Date:** February 10, 2026  
**Scope:** Full codebase review — `packages/shared`, `packages/db`, `packages/indexer`, `packages/web`, Docker, and configuration.

---

## Executive Summary

The project is architecturally sound — TypeScript monorepo with clean package boundaries, dual-stream ingestion, a plugin system, and a well-structured Next.js 15 frontend. The codebase is production-viable today for single-chain explorers with moderate traffic.

This review identifies **23 findings** (12 fixed ✅, 11 remaining) with the following priority distribution:

| Priority | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| 🔴 Critical | 3 | 1 ✅ | 2 |
| 🟠 High | 5 | 2 ✅ | 3 |
| 🟡 Medium | 8 | 4 ✅ | 4 |
| 🟢 Low | 7 | 5 ✅ | 2 |

---

## 🔴 Critical Priority

### ~~C1. Race Condition in Backfill Concurrency~~ ✅ FIXED

**File:** `packages/indexer/src/ingestion/pipeline.ts` → `runWithConcurrency()`  
**Status:** Fixed — replaced shared mutable index with work-stealing queue (`queue.shift()`).
```

---

### C2. Extension Code Execution Without Sandboxing

**File:** `packages/indexer/src/plugins/registry.ts`  
**Impact:** Arbitrary code execution + SQL injection via extensions

1. `await import(handlerPath)` loads JavaScript from disk with full Node.js privileges — a malicious extension could access the database, filesystem, network, or environment variables.
2. `ext.getMigrationSQL()` returns raw SQL executed via `await query(sql)` — no sandboxing, no parametrization, no transaction wrapping.
3. `manifest.json` is parsed with no JSON schema validation — malformed manifests could crash the discovery phase.

**Fix (short-term):**
- Wrap migration SQL in a transaction with rollback on failure
- Validate manifests against a JSON Schema (e.g., Ajv)
- Add a config allowlist for trusted extension IDs

**Fix (long-term):**
- Consider `vm2` or `isolated-vm` for sandboxed plugin execution
- Or accept the trust model and document that extensions run with full privileges (like VS Code extensions)

---

### C3. Extension Migrations Not Transactional

**File:** `packages/indexer/src/plugins/registry.ts` → `runMigrations()`  
**Impact:** Partial schema corruption on migration failure

If an extension's migration SQL partially succeeds (e.g., first table created, second fails), the `extension_migrations` record is never inserted. On retry, the registry attempts the full migration again, hitting `CREATE TABLE` conflicts or, worse, `ALTER TABLE` errors that leave the schema in an unrecoverable state.

**Fix:** Wrap each extension migration in a transaction:
```typescript
await transaction(async (client) => {
  await client.query(sql);
  await client.query(
    `INSERT INTO extension_migrations (extension_id, version) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ext.manifest.id, ext.manifest.version]
  );
});
```

---

## 🟠 High Priority

### ~~H1. No Pipeline Reconnection on Stream Error~~ ✅ FIXED

**File:** `packages/indexer/src/ingestion/pipeline.ts` → `subscribeFinalized()`, `subscribeBestHead()`  
**Status:** Fixed — both subscriptions now auto-reconnect with exponential backoff (1s → 60s cap), retry counter resets on successful block.

---

### ~~H2. `hexToBytes` Crashes on Empty Hex Input~~ ✅ FIXED

**Files:** `packages/indexer/src/ingestion/pipeline.ts`, `packages/indexer/src/ingestion/extrinsic-decoder.ts`, `packages/indexer/src/runtime-parser.ts`  
**Status:** Fixed — added `if (!clean) return new Uint8Array(0);` guard in all 3 copies.

---

### H3. SS58 Prefix Switching Is a No-Op

**File:** `packages/web/src/lib/ss58-context.tsx` → `formatAddress()`  
**Impact:** Address display doesn't update when user changes SS58 prefix

The `formatAddress` function detects "already SS58" addresses and passes them through unchanged. When a user switches the prefix selector (e.g., from Ajuna 1328 to generic 42), displayed SS58 addresses on-screen don't re-encode — they remain in the original prefix format.

**Fix:** Decode existing SS58 to a raw public key, then re-encode with the current prefix:
```typescript
if (!raw.startsWith("0x")) {
  const decoded = ss58Decode(raw); // extract public key bytes
  return ss58Encode(decoded, currentPrefix);
}
```

---

### H4. Full Page Reloads on All Navigation

**Files:** `packages/web/src/components/HeaderNav.tsx`, `Pagination.tsx`, `LatestBlocksCard.tsx`, `LatestTransfersCard.tsx`, various page links  
**Impact:** Poor UX — every click does full page reload, losing client state

All internal links use plain `<a href="...">` instead of Next.js `<Link>` component. This bypasses the App Router's client-side navigation, triggering full page reloads on every click. Users lose scroll position, SS58 prefix selection resets, and the browser re-fetches all JavaScript bundles.

**Fix:** Replace `<a href>` with Next.js `<Link>` across all components. Example:
```tsx
import Link from "next/link";
// Before: <a href="/blocks">Blocks</a>
// After:  <Link href="/blocks">Blocks</Link>
```

---

### H5. `COUNT(*)` on Large Tables Without Caching

**File:** `packages/db/src/queries.ts` — all list queries  
**Impact:** Slow pagination on tables with millions of rows

Every paginated query runs a parallel `SELECT COUNT(*) FROM [table]`. On PostgreSQL, `COUNT(*)` does a full sequential scan (no index-only optimization). At millions of blocks/events/extrinsics, this becomes the dominant query cost — often taking 2-10 seconds.

**Fix options (in order of effort):**
1. **Cache counts in Redis/memory** with a short TTL (30s)
2. **Use `pg_stat_user_tables.n_live_tup`** for approximate counts (already used in `getDatabaseSize`)
3. **Remove exact total from paginated responses** — use cursor-based pagination ("has next page" only)
4. **Add partial indexes** for filtered counts (e.g., `WHERE signer IS NOT NULL` count)

---

## 🟡 Medium Priority

### M1. No Rate Limiting on API Endpoints

**File:** `packages/indexer/src/api/server.ts`  
**Impact:** API abuse / DoS vector

The Express API has no rate limiting. A single client can flood `/api/blocks?limit=100` or `/api/search` with rapid requests, overwhelming the database connection pool (max 20).

**Fix:** Add `express-rate-limit` middleware:
```typescript
import rateLimit from 'express-rate-limit';
app.use('/api/', rateLimit({ windowMs: 60_000, max: 200 }));
```

---

### ~~M2. No Security Headers on Web Frontend~~ ✅ FIXED

**File:** `packages/web/next.config.js`  
**Status:** Fixed — added `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy` headers. Also removed dead `experimental.serverActions` config (L7).

---

### M3. Unbounded Runtime Metadata Cache

**File:** `packages/indexer/src/runtime-parser.ts`  
**Impact:** Memory leak over long-running indexer uptimes

`runtimeCache` is a module-level `Map<number, RuntimeSummary>` with no eviction policy. Each cached entry holds a full pallet metadata summary. Over months of uptime with many spec versions encountered during backfill, this grows unbounded.

**Fix:** Switch to an LRU cache (e.g., `lru-cache` npm package) with a max size of ~20 entries.

---

### M4. Duplicate Code Between PAPI and Legacy RPC Block Fetch

**File:** `packages/indexer/src/ingestion/pipeline.ts`  
**Impact:** Maintenance burden — same logic duplicated in two methods

`fetchBlockViaPapi()` and `fetchBlockViaLegacyRpc()` contain nearly identical extrinsic mapping, event decoding, and enrichment code. When either code path needs a fix, the other must be updated too.

**Fix:** Extract common logic to a `buildRawBlockData(header, body, hash, height)` helper.

---

### M5. Accounts Stored with Hex Public Key, Not SS58

**File:** `packages/indexer/src/ingestion/block-processor.ts`, `packages/db/src/queries.ts`  
**Impact:** Account address format mismatch between indexer and frontend

The indexer stores accounts using the hex public key returned by PAPI (e.g., `0x1234...`). The frontend then re-encodes these for display, but search and API lookups require callers to know the hex key. This creates a UX issue: users searching with an SS58 address must have it normalized through `normalizeAddress()`, and cross-referencing with other explorers (Subscan, Statescan) that use SS58 as the canonical key fails.

**Current mitigation:** The API server calls `normalizeAddress()` on account lookups, which works but is fragile.

**Fix (future):** Store the canonical SS58 address (with chain prefix) alongside the hex public key, or normalize consistently at ingest time.

---

### ~~M6. Inconsistent Pagination Page Numbering~~ ✅ FIXED

**Files:** `packages/indexer/src/api/server.ts`  
**Status:** Fixed — all endpoints now use 1-based page: `Math.floor(offset / limit) + 1`.

---

### ~~M7. Synchronous Filesystem Operations in Extension Discovery~~ ✅ FIXED

**File:** `packages/indexer/src/plugins/registry.ts` → `discover()`  
**Status:** Fixed — replaced `fs.existsSync`, `fs.readdirSync`, `fs.readFileSync` with async `fs/promises` equivalents (`access`, `readdir`, `readFile`).

---

### ~~M8. `/api/transfers` Inconsistent Response Shape~~ ✅ FIXED

**File:** `packages/indexer/src/api/server.ts` → `/api/transfers`  
**Status:** Fixed — removed dual code path; endpoint always returns paginated `{ data, total, page, pageSize, hasMore }`. Frontend `getTransfers()` updated to extract `.data` from response.

---

## 🟢 Low Priority

### L1. No Test Suite

**Files:** Root `package.json`, all packages  
**Impact:** No automated regression detection

There are no test files, no test runner (Jest, Vitest, etc.), and no test scripts in any package. This is acceptable for rapid prototyping but risky for a production explorer handling financial data.

**Recommended:** Add Vitest (fastest for TypeScript ESM) with at least:
- Unit tests for `queries.ts` (SQL mapping correctness)
- Unit tests for `block-processor.ts` (event correlation, fee enrichment)
- Integration tests for key API endpoints
- Unit tests for `hexToBytes`, `ss58` utilities

---

### ~~L2. Docker Indexer Uses Alpine (V8 Compatibility Risk)~~ ✅ FIXED

**File:** `Dockerfile.indexer`  
**Status:** Fixed — switched both build and runner stages from `node:20-alpine` to `node:20-slim`, matching `Dockerfile.web`.

---

### ~~L3. Missing `export const dynamic` on Data Pages~~ ✅ FIXED

**Files:** All 12 data-fetching pages in `packages/web/src/app/`  
**Status:** Fixed — added `export const dynamic = "force-dynamic"` to homepage, blocks, events, extrinsics, transfers, accounts, logs, runtime, block/[id], extrinsic/[hash], account/[address], and chain-state pages.

---

### ~~L4. `Pagination` Uses `useCallback` Instead of `useMemo`~~ ✅ FIXED

**File:** `packages/web/src/components/Pagination.tsx`  
**Status:** Fixed — replaced `useCallback` + call with `useMemo` that computes page numbers directly.

---

### ~~L5. No `"type": "module"` in Root `package.json`~~ ✅ FIXED

**File:** `package.json` (root)  
**Status:** Fixed — added `"type": "module"` to root `package.json`.

---

### L6. `noUncheckedIndexedAccess` Not Enabled

**File:** `tsconfig.base.json`  
**Impact:** Potential undefined access bugs not caught at compile time

Several patterns in the codebase access array elements by index without null checks (e.g., `extrinsics[evt.extrinsicIndex]` in pipeline.ts). Enabling `"noUncheckedIndexedAccess": true` would catch these at compile time.

---

### ~~L7. Dead Config in `next.config.js`~~ ✅ FIXED

**File:** `packages/web/next.config.js`  
**Status:** Fixed — removed `experimental.serverActions` block (addressed together with M2 security headers).

---

## Architecture Observations (Non-Issues, For Context)

### ✅ What's Working Well

1. **Monorepo topology** — Clean dependency graph: `shared` → `db` → `indexer`, `shared` → `web`. No circular dependencies.
2. **Dual-stream architecture** — Finalized + best-head with automatic backfill is the correct pattern for Substrate explorers.
3. **Plugin system design** — Manifest-based discovery with event/call dispatch, DB migrations, and frontend viewer registration is extensible and well-structured.
4. **RPC Pool** — Round-robin with exponential backoff suspension is a solid load-balancing strategy for unreliable public RPC nodes.
5. **Transaction wrapping in `processBlock`** — All DB writes for a single block are atomic. No partial block data on failure.
6. **Database design** — JSONB columns with GIN indexes, upsert semantics, and proper FK cascades are PostgreSQL best practices.
7. **Migration runner** — Tracks applied migrations via `schema_migrations`, preventing re-execution.
8. **API documentation** — Swagger/OpenAPI annotations on all endpoints.
9. **Theme system** — Build-time resolution from env var is the correct pattern for Next.js static optimization.
10. **Metrics singleton** — Rolling window (ring buffer) for rate calculation is efficient and memory-bounded.

### 📊 Scale Considerations

The current architecture is appropriate for chains with < 10M blocks. Beyond that:

| Component | Bottleneck | Threshold | Mitigation |
|-----------|-----------|-----------|------------|
| `COUNT(*)` queries | Sequential scan | ~5M rows | Approximate counts or caching |
| `events` table | Table size | ~20M rows | [Table partitioning by block range](https://www.postgresql.org/docs/16/ddl-partitioning.html) |
| Backfill | Single-process | ~50M blocks | Worker-based horizontal scaling |
| `getAccounts` | Correlated subquery | ~500K accounts | Materialized view for extrinsic counts |
| Runtime metadata cache | Memory | ~50+ spec versions | LRU cache eviction |

---

## Recommended Fix Order

**Immediate (before next release):**
1. ~~C1 — Fix `runWithConcurrency` race condition~~ ✅
2. ~~H2 — Guard `hexToBytes` against empty input~~ ✅
3. ~~H1 — Add reconnection logic to PAPI subscriptions~~ ✅
4. ~~M6 — Standardize pagination page numbering~~ ✅

**Short-term (next sprint):**
5. C3 — Wrap extension migrations in transactions
6. H4 — Replace `<a>` with Next.js `<Link>`
7. H3 — Fix SS58 prefix re-encoding
8. ~~L2 — Switch indexer Dockerfile to `node:20-slim`~~ ✅
9. ~~M8 — Normalize `/api/transfers` response shape~~ ✅

**Medium-term (next major version):**
10. H5 — Implement COUNT caching / approximate counts
11. M1 — Add API rate limiting
12. ~~M2 — Configure security headers~~ ✅
13. C2 — Validate extension manifests with JSON Schema
14. L1 — Add test suite (Vitest)
15. M4 — Extract shared block processing logic

**Nice-to-have:**
16. M3, M5, ~~M7~~ ✅, ~~L3~~ ✅, ~~L4~~ ✅, ~~L5~~ ✅, L6, ~~L7~~ ✅
