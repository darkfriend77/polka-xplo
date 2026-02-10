## Architecture & Design — What's Done Well

**Monorepo structure is solid.** The Turborepo + npm workspaces setup with clean package boundaries (`shared` → `db` → `indexer`, `shared` → `web`) is modern and well-organized. Dependency ordering in turbo.json is correct.

**Plugin/Extension system is well-designed.** The manifest-based discovery, event/call dispatch index, and migration runner in registry.ts closely follows the spec's Plugin Architecture. The frontend lazy-loading + fallback to `JsonView` in EventRenderer.tsx is the right pattern.

**Dual-stream pipeline architecture.** The finalized + best block streams in pipeline.ts correctly implements the spec's dual-stream requirement with backfill logic.

**TypeScript strictness.** The base tsconfig.base.json enables `strict: true`, `isolatedModules`, proper ESM (`"module": "ESNext"`), and `bundler` module resolution — all current best practices.

**DB design is clean.** The schema in 001_core_schema.sql uses appropriate indexes, `GIN` indexes on JSONB columns, `ON CONFLICT` upserts, and proper FK cascades.

**Docker multi-stage builds.** Both Dockerfiles use Alpine images with build/runner separation for smaller production images.

---

## Issues That Need Fixing (Bugs / Will-Break-At-Runtime)

### 1. **Critical: Backfill cannot resolve historical block hashes**

In pipeline.ts, `resolveBlockHash()` only checks the current finalized block and the `bestBlocks` array. For any block older than the current tip, it logs a warning and returns `null` — meaning **backfill silently skips most blocks**. The backfill loop at pipeline.ts calls `fetchAndProcessByHash(null, height, "finalized")` which depends on this broken resolution.

**Fix needed:** Use PAPI's `chainHead` or `archive` JSON-RPC methods to resolve historical block hashes. Without generated descriptors, you need direct RPC calls like `chain_getBlockHash(height)`.

### 2. **Critical: Events and decoded extrinsics are not populated**

In pipeline.ts, the returned object has:
```ts
events: [],          // "Requires TypedApi with descriptors for decoding"
timestamp: null,     // "Requires decoding the Timestamp.set inherent"
specVersion: 0,
```
This means **no events are ever indexed**, and timestamps are never recorded. The entire events pipeline, extension event handlers, and the `EventRenderer` on the frontend will show nothing.

### 3. **Migration runner does not track applied migrations**

In migrate.ts, all `.sql` files are re-executed on every run. While the `CREATE TABLE IF NOT EXISTS` is idempotent, any future migration with `ALTER TABLE` or data manipulation will break on re-execution. There is no `schema_migrations` tracking table.

### 4. **SearchBar form points to non-existent route**

In layout.tsx, the header `SearchBar` form has `action="/api/search-redirect"` but no such API route exists in the Next.js app or the indexer. This server-side search will 404.

### 5. **CORS middleware is too permissive**

In server.ts, `Access-Control-Allow-Origin: *` is hardcoded. This is acceptable for development but the spec calls for a "self-hosted" production deployment. There's no way to configure allowed origins.

### 6. **Docker web build assumes `standalone` output but may miss `public/` assets**

In Dockerfile.web, the runner copies `.next/standalone` and `.next/static` but does **not** copy the `public/` folder. Any static assets (favicon, images) will be missing.

### 7. **docker-compose.yml uses deprecated `version` key**

The `version: "3.8"` field in docker-compose.yml is deprecated in modern Docker Compose (v2+) and produces a warning.

### 8. **`polkadot-api` is not in web package.json but dynamically imported**

The `usePapiClient` hook at usePapiClient.ts does `import("polkadot-api")` dynamically, but `polkadot-api` is **not** listed in the web package's dependencies. This will fail at runtime.

---

## Best Practice Concerns

### 9. **No input validation/sanitization on API endpoints**

The API in server.ts passes `req.params` and `req.query` directly into database queries. While parameterized queries prevent SQL injection, there's no validation on:
- `limit`/`offset` (negative values, NaN)
- `address` format
- `hash` format

You should add input validation middleware (e.g., `zod` schemas).

### 10. **DB pool singleton uses module-level state**

The `pool` variable in client.ts is a module-level singleton. This works but makes testing difficult and could cause issues if multiple chain indexers are ever run in-process. Consider passing the pool via dependency injection.

### 11. **Block processing is not batched into transactions**

In block-processor.ts, each `insertBlock`, `insertExtrinsic`, `insertEvent` and `upsertAccount` call is a separate query. If processing fails mid-block, you get partial data. The entire block should be wrapped in a single DB transaction.

### 12. **Backfill processes blocks concurrently without rate limiting**

At pipeline.ts, the backfill creates `Promise.all()` for an entire batch (up to 100 blocks). This can overwhelm both the RPC node and the DB connection pool (max 20). Add concurrency limiting (e.g., `p-limit`).

### 13. **Redis is in dependencies but never used**

`ioredis` is listed in the indexer package.json but is never imported anywhere. The spec calls for Redis-based queue processing for stability, but the current implementation processes blocks directly in the subscription callback. This is a missing feature, not just an unused dependency.

### 14. **No rate limiting or authentication on the API**

The Express API has no rate limiting, no API keys, and no helmet/security headers. For a public deployment, this is a DoS vector.

### 15. **`timeAgo()` is duplicated**

`truncateHash` and `timeAgo` are implemented in both config.ts and format.ts. The shared package versions should be the single source of truth.

### 16. **Next.js revalidation may conflict with Docker internal networking**

In api.ts, `fetchJson` uses `{ next: { revalidate: 6 } }`. In Docker, the `NEXT_PUBLIC_API_URL` is `http://explorer-indexer:3001` (internal DNS), but `NEXT_PUBLIC_*` env vars are baked in at **build time**, not runtime. The web container won't be able to reach the indexer during `next build`, and the baked URL may differ from the runtime one.

**Fix:** Use a non-`NEXT_PUBLIC_` server-side env var for the API URL in Server Components, and only use `NEXT_PUBLIC_` for client-side fetches.

### 17. **No `eslint` or `prettier` configuration**

The monorepo has a `lint` script but no `.eslintrc` or Prettier config. The `turbo run lint` for the web package runs `next lint`, but the other packages just run `tsc --noEmit` (type-checking, not linting).

### 18. **Extensions directory is outside packages**

The extensions folder isn't part of the npm workspaces (`"workspaces": ["packages/*"]`). The staking extension imports `@polka-xplo/shared` and `@polka-xplo/db` but has no package.json, no tsconfig.json, and no build step. The event-handlers.ts won't compile or resolve its imports when loaded at runtime.

---

## Summary Table

| # | Severity | Issue |
|---|----------|-------|
| 1 | **Critical** | Backfill can't resolve historical block hashes — blocks silently skipped |
| 2 | **Critical** | Events, timestamps, specVersion never populated (always empty/null/0) |
| 3 | **High** | Migration runner re-runs all migrations every time, no tracking |
| 4 | **High** | Header SearchBar `action` routes to nonexistent `/api/search-redirect` |
| 5 | **Medium** | Wildcard CORS in production |
| 6 | **Medium** | Docker web image missing `public/` folder |
| 7 | **Low** | Deprecated `version` in docker-compose |
| 8 | **High** | `polkadot-api` missing from web dependencies |
| 9 | **Medium** | No API input validation |
| 10 | **Low** | DB pool singleton hinders testability |
| 11 | **High** | Block processing not wrapped in a DB transaction |
| 12 | **Medium** | Unbounded concurrent backfill requests |
| 13 | **Medium** | Redis dependency unused — queue pattern not implemented |
| 14 | **Medium** | No rate limiting or security headers on API |
| 15 | **Low** | Duplicated utility functions across packages |
| 16 | **High** | `NEXT_PUBLIC_API_URL` baked at build time breaks Docker networking |
| 17 | **Low** | No ESLint/Prettier configuration |
| 18 | **High** | Extensions have no build pipeline, imports won't resolve at runtime |

The architecture and design are strong — the plugin system, dual-stream pipeline, PAPI integration strategy, and frontend Server Component approach are all aligned with the spec and modern best practices. The critical path issues (#1, #2, #18) all revolve around **the PAPI descriptor generation step not being implemented yet**, which cascades into empty events, broken backfill, and non-functional extensions. Resolving those, adding transactional block processing (#11), and fixing the build/deploy issues (#16, #4) should be the top priorities.
