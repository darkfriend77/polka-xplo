# Getting Started

This guide gets you running a Polka-Xplo explorer instance. The examples use [Ajuna Network](https://ajuna.io/) (a Polkadot parachain), but the same steps work for **any Substrate chain** — just swap the RPC endpoint and chain ID.

## Option A: Docker (Recommended)

Zero local tooling needed — just Docker and Docker Compose.

### 1. Clone the repo

```bash
git clone https://github.com/10igma/polka-xplo.git
cd polka-xplo
```

### 2. Launch the stack

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d
```

This starts four containers:

| Container            | Port | Description                                |
| -------------------- | ---- | ------------------------------------------ |
| `polka-xplo-db`      | 5432 | PostgreSQL 16 database                     |
| `polka-xplo-redis`   | 6379 | Redis queue                                |
| `polka-xplo-indexer` | 3001 | Block indexer + REST API                   |
| `polka-xplo-web`     | 3000 | Next.js frontend                           |

### 3. Open the explorer

Navigate to [http://localhost:3000](http://localhost:3000). Blocks will start appearing immediately as the indexer syncs from the chain tip.

### 4. Verify health

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "healthy",
  "nodeConnected": true,
  "dbConnected": true,
  "chainTip": 8250000,
  "indexedTip": 8249998,
  "syncLag": 2
}
```

### 5. Stop the stack

```bash
# Stop containers (data is preserved in Docker volumes)
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down

# Stop AND delete all indexed data
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down -v
```

### 6. Rebuild from scratch

If you've pulled new code or want a fresh start:

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down -v
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d --build
```

---

## Option B: Local Development

For hacking on the code.

### Prerequisites

- Node.js >= 20
- npm >= 10
- Docker (for Postgres + Redis)

### 1. Install dependencies

```bash
git clone https://github.com/10igma/polka-xplo.git
cd polka-xplo
npm install
```

### 2. Start infrastructure

```bash
docker compose up -d explorer-db explorer-redis
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
DATABASE_URL=postgresql://polkaxplo:polkaxplo@localhost:5432/polkaxplo
REDIS_URL=redis://localhost:6379
ARCHIVE_NODE_URL=wss://rpc-para.ajuna.network,wss://ajuna.ibp.network,wss://ajuna.dotters.network
CHAIN_ID=ajuna
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
NEXT_PUBLIC_CHAIN_ID=ajuna
```

### 4. Run migrations and start

```bash
npm run db:migrate
npm run indexer:start    # Terminal 1: starts indexer + API on :3001
npm run web:dev          # Terminal 2: starts Next.js on :3000
```

Open [http://localhost:3000](http://localhost:3000).

---

## Switching Chains

Change two values to index a different chain:

| Chain         | `CHAIN_ID` | `ARCHIVE_NODE_URL`                                                                 |
| ------------- | ---------- | ---------------------------------------------------------------------------------- |
| Polkadot      | `polkadot` | `wss://rpc.polkadot.io,wss://polkadot-rpc.dwellir.com`                             |
| Kusama        | `kusama`   | `wss://kusama-rpc.polkadot.io,wss://kusama-rpc.dwellir.com`                        |
| Asset Hub     | `assethub` | `wss://polkadot-asset-hub-rpc.polkadot.io`                                         |
| Ajuna Network | `ajuna`    | `wss://rpc-para.ajuna.network,wss://ajuna.ibp.network,wss://ajuna.dotters.network` |

For custom chains, add an entry to `chain-config.json` — see [Configuration](configuration.md#chain-configuration).

---

## Stopping and Restarting

You can safely stop the indexer at any time. All block writes use database transactions, so no partial data is committed. On restart, the indexer automatically detects the last indexed height and backfills any blocks it missed.

```
[Pipeline:ajuna] Backfilling 47 blocks (12345 -> 12392)
[Pipeline:ajuna] Backfill complete.
[Pipeline:ajuna] Pipeline is live.
```

See [Deployment > Stopping and Restarting](deployment.md#stopping-and-restarting) for more details.

---

**Next:** [Architecture](architecture.md) · [Configuration](configuration.md) · [Development](development.md)
