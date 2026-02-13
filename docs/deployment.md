# Deployment

## Docker Compose (Recommended)

### Default (Polkadot)

```bash
docker compose up -d
```

### Ajuna Network

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d
```

### Custom Chain

Create a compose override (see [Configuration > Docker Compose Overrides](configuration.md#docker-compose-overrides)):

```bash
docker compose -f docker-compose.yml -f docker-compose.mychain.yml up -d
```

---

## Services

| Service            | Image            | Port | Description                       |
| ------------------ | ---------------- | ---- | --------------------------------- |
| `explorer-db`      | postgres:16      | 5432 | PostgreSQL (persistent volume)    |
| `explorer-redis`   | redis:7          | 6379 | Redis (job queue)                 |
| `explorer-indexer`  | Custom (node:20) | 3001 | Block processor + REST API        |
| `explorer-web`     | Custom (node:20) | 3000 | Next.js frontend (standalone)     |

### Health Checks

Both Postgres and Redis have built-in health checks. The indexer and web containers wait for `service_healthy` before starting.

---

## Stopping and Restarting

### Stop (preserve data)

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down
```

This stops all containers. **Data is preserved** in Docker volumes (`pgdata`, `redisdata`).

### Restart

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d
```

The indexer will:
1. Query the DB for the last finalized block height
2. Query the chain for the current tip
3. Backfill any missed blocks
4. Resume live syncing

### Full rebuild (new code)

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d --build
```

### Reset everything (wipe data)

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down -v
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d --build
```

The `-v` flag removes Docker volumes, wiping the database and Redis. The indexer will start syncing from block 0.

> **Important:** `down` = safe, `down -v` = deletes all indexed data. Never use `-v` unless you want a fresh start.

---

## Co-located Deployment (Local Full Node / Collator)

If you run a Substrate full node, collator, or validator on the same server, you can point the indexer at the local RPC endpoint for the best possible performance:

- **Sub-millisecond latency** — no network hop
- **No rate limits** — you own the node
- **Automatic fallback** — public RPCs in `ARCHIVE_NODE_URL` kick in if the local node is temporarily down

### Quick Start

```bash
docker compose -f docker-compose.yml -f docker-compose.local-node.yml up -d
```

Combined with a chain-specific override (e.g. Ajuna on a local collator):

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.ajuna.yml \
  -f docker-compose.local-node.yml \
  up -d
```

### How It Works

The `LOCAL_NODE_URL` environment variable is optional. When set, the indexer prepends it to the RPC pool. Because the local node has near-zero latency, the latency-weighted router naturally sends it the vast majority of traffic. The public endpoints in `ARCHIVE_NODE_URL` remain in the pool as automatic fallback.

```
┌─────────────────────────────────────────────────┐
│              Server / VPS                       │
│                                                 │
│  ┌───────────────┐     ws://127.0.0.1:9944      │
│  │ Substrate Node │◄────────────────────────┐   │
│  │ (collator/     │                         │   │
│  │  full node)    │                         │   │
│  └───────────────┘                         │   │
│                                             │   │
│  ┌─────────────┐  ┌───────┐  ┌───────────┐ │   │
│  │  PostgreSQL  │  │ Redis │  │  Indexer   │─┘   │
│  └─────────────┘  └───────┘  │  (polka-   │────►│
│                               │   xplo)    │     │
│                               └─────┬─────┘     │
│                                     │            │
└─────────────────────────────────────┼────────────┘
                                      │ fallback
                                      ▼
                              Public RPC endpoints
                              (wss://rpc.example.com)
```

### Without Docker (bare-metal)

If you run the indexer directly on the host (no Docker), just set the env vars:

```bash
export LOCAL_NODE_URL=ws://127.0.0.1:9944
export ARCHIVE_NODE_URL=wss://rpc.polkadot.io
export DATABASE_URL=postgresql://polkaxplo:polkaxplo@localhost:5432/polkaxplo
export REDIS_URL=redis://localhost:6379
export CHAIN_ID=polkadot

npm run indexer:start
```

### Substrate Node Requirements

Your local node must expose its RPC. Typical flags:

```bash
# Minimal: RPC on localhost only (recommended — safe, no external exposure)
--rpc-port 9944

# If the indexer runs in Docker with bridge networking, the node
# needs to listen on all interfaces:
--rpc-external --rpc-cors all
```

> **Security:** Prefer `ws://127.0.0.1:9944` (localhost only). Never expose `--rpc-external` to the internet without a reverse proxy and authentication.

### Docker Networking Notes

The default `docker-compose.local-node.yml` uses `network_mode: host` so the container sees `127.0.0.1:9944` directly. If you prefer Docker bridge networking:

```yaml
# Alternative: use extra_hosts instead of network_mode: host
services:
  explorer-indexer:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      LOCAL_NODE_URL: ws://host.docker.internal:9944
```

---

## Data Safety

The indexer is designed for safe interruption:

- **Transactional writes** — Every block is written in a single PostgreSQL transaction. If the process is killed mid-block, nothing partial is committed.
- **Idempotent upserts** — All inserts use `ON CONFLICT DO UPDATE`, so re-processing a block produces the same result.
- **Automatic backfill** — On restart, the indexer detects the gap between DB height and chain tip and fills it automatically.
- **Fork pruning** — Best-head blocks from abandoned forks are cleaned up when the finalized chain advances.

---

## Resource Requirements

### Minimum (development / small chains)

- 2 CPU cores
- 2 GB RAM
- 10 GB disk

### Recommended (production / large chains)

- 4+ CPU cores
- 8 GB RAM
- 100+ GB SSD (Polkadot mainnet generates ~2 GB/million blocks)

### RPC Endpoints

For production, use 2-3 RPC endpoints for redundancy:

```bash
ARCHIVE_NODE_URL=wss://rpc1.example.com,wss://rpc2.example.com,wss://rpc3.example.com
```

Monitor health via `GET /api/rpc-health`.

---

## Monitoring

### Health Endpoint

```bash
curl http://localhost:3001/health
```

Returns `"status": "healthy"` with sync lag, DB connectivity, and chain tip.

### Indexer Metrics

```bash
curl http://localhost:3001/api/indexer-status
```

Returns blocks/minute, blocks/hour, ETA, error count, memory usage, and database size.

### Docker Logs

```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml logs -f

# Indexer only
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml logs -f explorer-indexer

# Last 100 lines
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml logs --tail 100 explorer-indexer
```

---

## Indexing Multiple Chains

To index multiple chains simultaneously, run multiple indexer instances with different `CHAIN_ID` values pointing at the same database:

```yaml
# docker-compose.multi.yml
services:
  indexer-polkadot:
    extends:
      service: explorer-indexer
    environment:
      CHAIN_ID: polkadot
      ARCHIVE_NODE_URL: wss://rpc.polkadot.io
      API_PORT: "3001"
    ports:
      - "3001:3001"

  indexer-kusama:
    extends:
      service: explorer-indexer
    environment:
      CHAIN_ID: kusama
      ARCHIVE_NODE_URL: wss://kusama-rpc.polkadot.io
      API_PORT: "3002"
    ports:
      - "3002:3002"
```

Each indexer stores data in the same Postgres database using `chain_id` scoping.

---

## Security Hardening

### Admin Endpoint Protection

The indexer API exposes destructive/expensive admin endpoints (backfill, repair,
maintenance, consistency-check). These are protected at two layers:

#### 1. Application Layer — `ADMIN_API_KEY`

Set `ADMIN_API_KEY` in your `.env` to require an API key for admin endpoints.
Generate a strong key:

```bash
openssl rand -hex 32
```

Add to `.env`:

```env
ADMIN_API_KEY=<your-key>
NODE_ENV=production
```

When `NODE_ENV=production` and no key is set, admin endpoints return **403** —
they are completely disabled. Clients authenticate via the `X-Admin-Key` header
or `?admin_key=` query parameter.

#### 2. Nginx Layer — Block Admin Routes

All admin endpoints live under `/api/admin/`, so a single nginx rule blocks them all.
Any new admin endpoint added in the future is automatically covered.

Add this location block to your nginx site **before** the generic `/api/` proxy:

```nginx
# Block the entire admin API from public access
location /api/admin/ {
    return 403;
}

# Optional: restrict Swagger docs to localhost
location /api-docs {
    allow 127.0.0.1;
    deny all;
    proxy_pass http://127.0.0.1:3001;
}
```

Reload nginx after editing:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Rate Limiting

The API server includes a built-in per-IP rate limiter (default: 120
requests/minute). Configure via environment variables:

| Variable             | Default | Description                     |
| -------------------- | ------- | ------------------------------- |
| `RATE_LIMIT_WINDOW`  | `60000` | Window duration in milliseconds |
| `RATE_LIMIT_MAX`     | `120`   | Max requests per window per IP  |

Clients that exceed the limit receive **429 Too Many Requests** with a
`Retry-After` header.

For additional rate limiting at the nginx layer:

```nginx
# In the http {} block of nginx.conf
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

# In the server {} block, inside location /api/
limit_req zone=api burst=50 nodelay;
```

---

**Next:** [Configuration](configuration.md) · [Troubleshooting](troubleshooting.md)
