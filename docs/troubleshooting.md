# Troubleshooting

## Docker Build Failures

### `npm install` fails with peer dependency errors

**Symptom:**

```
npm error ERESOLVE could not resolve
npm error While resolving: eslint-plugin-react-hooks@...
```

**Cause:** ESLint 10 has a transient peer-dep conflict with eslint-plugin-react-hooks.

**Fix:** Ensure `.npmrc` exists at the repo root with:

```
legacy-peer-deps=true
```

Both Dockerfiles must copy it before `npm install`:

```dockerfile
COPY .npmrc ./
RUN npm install
```

### V8 fatal error / out of memory during build

**Symptom:**

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

**Fix:** Increase Node.js memory in the Docker build:

```dockerfile
ENV NODE_OPTIONS="--max-old-space-size=4096"
```

Or pass at build time:

```bash
docker compose build --build-arg NODE_OPTIONS="--max-old-space-size=4096"
```

### Alpine image crash (`v8::internal::...`)

**Symptom:** Indexer crashes immediately with a V8 segfault on Alpine-based images.

**Fix:** Use `node:20-slim` (Debian) instead of `node:20-alpine` in Dockerfiles. The current Dockerfiles already use `node:20-slim`.

---

## Indexer Issues

### Indexer starts but blocks/min shows 0

**Possible causes:**

1. **RPC endpoint is unreachable** — Check `GET /api/rpc-health`.
2. **Rate limiting** — Public RPC endpoints often throttle. Use multiple endpoints:
   ```
   ARCHIVE_NODE_URL=wss://rpc1.example.com,wss://rpc2.example.com
   ```
3. **Chain is paused** — Some test chains stop producing blocks. Verify by checking the latest block on a public explorer.

### Indexer restarts and re-processes blocks

This is expected after a restart. The indexer:
1. Queries DB for the last finalized block
2. Compares with chain tip
3. Backfills any gap

All writes are idempotent (upserts), so re-processing is safe and produces the same data.

### `PAPI client disconnected` in logs

The PAPI (Polkadot API) client auto-reconnects. Occasional disconnect/reconnect messages are normal, especially with public RPC endpoints. If reconnection fails repeatedly, the indexer logs the error and retries.

### High memory usage during backfill

During initial sync, the ingestion pipeline can use significant memory. The indexer processes blocks in parallel batches. If memory is tight:

- Ensure at least 2 GB RAM is available to the indexer container
- Monitor via `GET /api/indexer-status` (includes `memoryUsage`)

---

## Database Issues

### Cannot connect to PostgreSQL

**Symptom:**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:**
- Verify Postgres is running: `docker compose ps explorer-db`
- Check `DATABASE_URL` matches the Docker network (use `explorer-db` hostname inside Docker, `localhost` outside)
- Ensure the DB health check passes: `docker compose logs explorer-db`

### Reset the database

```bash
# Stop everything, remove volumes, restart
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down -v
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d --build
```

This wipes all indexed data. The indexer will start from block 0.

### Migration errors

If a migration file has a syntax error, the indexer will log it at startup. Fix the SQL and restart. Migrations use `IF NOT EXISTS` for idempotency, so re-running is safe.

---

## Frontend Issues

### Page shows "Failed to fetch" or loading spinner forever

**Possible causes:**

1. **Indexer API not running** — Start it: `npm run dev -w packages/indexer`
2. **Wrong API URL** — The frontend reads `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:3001`)
3. **CORS** — The indexer API allows `*` origins by default. If behind a reverse proxy, ensure headers pass through.

### Balance showing 0 or wrong decimal places

The balance display depends on `chain-config.json` having the correct `tokenDecimals` value:

```json
{
  "ajuna": {
    "tokenDecimals": 12,
    "tokenSymbol": "AJUN"
  }
}
```

Verify the value matches the actual chain configuration.

### Live balance not updating

The `useLiveBalance` hook subscribes via Polkadot-API (PAPI). If the RPC endpoint in `chain-config.json` is unreachable from the browser, the WebSocket connection will fail silently. Ensure the RPC URL is accessible from the user's browser (not just the server).

---

## XCM Issues

### XCM tab shows no data for an account

**Possible causes:**

1. **Address format mismatch** — The XCM tables store addresses as hex public keys. If the API receives an SS58 address that can't be decoded, the query finds no matches. Verify the address is valid on the target chain.
2. **Extension not active** — The `ext-xcm` extension must be listed in `/extensions/` with a valid `manifest.json`. Check `GET /api/extensions` to confirm it's loaded.
3. **No XCM activity** — The account may simply have no cross-chain messages. Verify on a relay chain explorer (e.g., Subscan).

### XCM transfers page shows empty or missing assets

1. **Asset filter applied** — The asset symbol filter drop-down may be filtering results. Clear the filter to see all transfers.
2. **Tables not created** — If the indexer started without the XCM extension, the tables won't exist. Restart the indexer after adding the extension to `/extensions/`.
3. **Parachain not sending XCM** — Not all parachains actively use XCM. Verify the chain has HRMP/DMP/UMP activity.

---

## Activity Chart Issues

### Chart shows "No activity data" or empty

**Possible causes:**

1. **Indexer not synced** — The chart queries the `blocks` table. If the indexer hasn't synced enough blocks, there's no data to aggregate. Check sync progress via `GET /api/indexer-status`.
2. **API unreachable** — The chart fetches from `/api/stats/activity`. Ensure the indexer API is running and accessible (check browser devtools for network errors).
3. **Period mismatch** — If the chain is very new and you select "Monthly", there may be only one bucket. Try "Hourly" for more granular data.

---

## Common Errors

| Error                                        | Cause                              | Fix                                       |
| -------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| `ERESOLVE could not resolve`                 | Missing `.npmrc`                   | Add `legacy-peer-deps=true` to `.npmrc`   |
| `connect ECONNREFUSED :5432`                 | Postgres not running               | `docker compose up -d explorer-db`        |
| `connect ECONNREFUSED :6379`                 | Redis not running                  | `docker compose up -d explorer-redis`     |
| `PAPI client disconnected`                   | RPC endpoint flaky                 | Add multiple RPC URLs                     |
| `relation "blocks" does not exist`           | Migrations not run                 | `npm run migrate -w packages/db`          |
| `fetch failed` in Next.js                    | Indexer API unreachable            | Check `NEXT_PUBLIC_API_URL`               |
| Docker build OOM                             | Node heap too small                | Set `NODE_OPTIONS=--max-old-space-size=4096` |

---

**Next:** [Getting Started](getting-started.md) · [Deployment](deployment.md)
