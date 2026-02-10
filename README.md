# Polka-Xplo

A modular, metadata-driven blockchain explorer for the Polkadot ecosystem. Built on [Polkadot-API (PAPI)](https://papi.how/) for type-safe, light-client-ready chain interaction.

Polka-Xplo ingests, indexes, and serves blockchain data (blocks, extrinsics, events, accounts, balances) through a plugin-first architecture that adapts dynamically to runtime upgrades and custom pallet extensions.

---

## Quick Start: Explore Ajuna Network in 5 Minutes

This walkthrough launches a fully working explorer for [Ajuna Network](https://ajuna.io/), a Polkadot parachain, using `wss://rpc-para.ajuna.network`. The same steps work for **any** Substrate chain -- just swap the RPC endpoint and chain ID.

### Option A: Docker (recommended -- zero local tooling needed)

> **Prerequisites:** Docker and Docker Compose installed.

**1. Clone and enter the repo**

```bash
git clone https://github.com/10igma/polka-xplo.git
cd polka-xplo
```

**2. Launch the entire stack for Ajuna Network**

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d
```

This starts four containers:

| Container             | Port | What it does                              |
|-----------------------|------|-------------------------------------------|
| `polka-xplo-db`      | 5432 | PostgreSQL database                       |
| `polka-xplo-redis`   | 6379 | Redis queue                               |
| `polka-xplo-indexer`  | 3001 | Connects to `wss://rpc-para.ajuna.network`, indexes blocks, serves REST API |
| `polka-xplo-web`     | 3000 | Next.js frontend                          |

**3. Open the explorer**

Open [http://localhost:3000](http://localhost:3000) in your browser. The indexer begins syncing from the chain tip immediately -- you'll see Ajuna blocks, extrinsics, and events populating in real time.

**4. Verify the indexer is connected**

```bash
curl http://localhost:3001/health
```

Expected response:

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

**5. Try the API**

```bash
# Latest blocks
curl http://localhost:3001/api/blocks?limit=5

# Search for a block by number
curl http://localhost:3001/api/search?q=100000

# View chain-scoped page in the browser
open http://localhost:3000/chain/ajuna
```

**6. Stop the stack**

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down
```

To also delete all indexed data:

```bash
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml down -v
```

---

### Option B: Local Development (for hacking on the code)

> **Prerequisites:** Node.js >= 20, npm >= 10, Docker (for Postgres + Redis).

**1. Clone and install**

```bash
git clone https://github.com/10igma/polka-xplo.git
cd polka-xplo
npm install
```

**2. Start Postgres and Redis**

```bash
docker compose up -d explorer-db explorer-redis
```

**3. Configure environment for Ajuna**

```bash
cp .env.example .env
```

Edit `.env` and set the Ajuna RPC and chain ID:

```bash
# .env
DATABASE_URL=postgresql://polkaxplo:polkaxplo@localhost:5432/polkaxplo
REDIS_URL=redis://localhost:6379

# --- Point at Ajuna Network ---
ARCHIVE_NODE_URL=wss://rpc-para.ajuna.network
CHAIN_ID=ajuna

BATCH_SIZE=100
WORKER_CONCURRENCY=4

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

**4. Run database migrations**

```bash
npm run db:migrate
```

**5. Start the indexer** (connects to Ajuna and begins syncing)

```bash
npm run indexer:start
```

You'll see output like:

```
====================================
  Polka-Xplo Indexer Starting...
====================================
[Main] Database pool initialized.
[Main] Chain: Ajuna Network (ajuna)
[Main] Extensions loaded: 1
[Main] Connected to wss://rpc-para.ajuna.network
[Pipeline:ajuna] Starting ingestion pipeline...
[Pipeline:ajuna] Backfilling 150 blocks (8249850 -> 8250000)
[Pipeline:ajuna] Backfill complete.
[Pipeline:ajuna] Pipeline is live.
[Main] API server listening on port 3001
[Pipeline:ajuna] Finalized block #8250001
[Pipeline:ajuna] Finalized block #8250002
```

**6. Start the frontend** (in a second terminal)

```bash
npm run web:dev
```

**7. Open** [http://localhost:3000](http://localhost:3000) -- the explorer is live.

---

### Switching to a Different Chain

The same steps work for any Substrate/Polkadot-ecosystem chain. Just change two values:

| Chain             | `CHAIN_ID`  | `ARCHIVE_NODE_URL`                          |
|-------------------|-------------|---------------------------------------------|
| Polkadot          | `polkadot`  | `wss://rpc.polkadot.io`                     |
| Kusama            | `kusama`    | `wss://kusama-rpc.polkadot.io`              |
| Asset Hub         | `assethub`  | `wss://polkadot-asset-hub-rpc.polkadot.io`  |
| Moonbeam          | `moonbeam`  | `wss://wss.api.moonbeam.network`            |
| **Ajuna Network** | `ajuna`     | `wss://rpc-para.ajuna.network`              |

For chains not in the default list, add an entry to `chain-config.json`:

```json
{
  "id": "mychain",
  "name": "My Chain",
  "rpc": ["wss://rpc.mychain.network"],
  "addressPrefix": 42,
  "tokenSymbol": "MYC",
  "tokenDecimals": 12,
  "colorTheme": "#FF6600",
  "isParachain": true,
  "relayChain": "polkadot"
}
```

Then set `CHAIN_ID=mychain` and `ARCHIVE_NODE_URL=wss://rpc.mychain.network` in your environment.

---

## Table of Contents

- [Quick Start: Explore Ajuna Network in 5 Minutes](#quick-start-explore-ajuna-network-in-5-minutes)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Docker Deployment](#docker-deployment)
- [Packages](#packages)
  - [@polka-xplo/shared](#polka-xploshared)
  - [@polka-xplo/db](#polka-xplodb)
  - [@polka-xplo/indexer](#polka-xploindexer)
  - [@polka-xplo/web](#polka-xploweb)
- [Extension System](#extension-system)
  - [How Extensions Work](#how-extensions-work)
  - [Creating an Extension](#creating-an-extension)
  - [Reference Extension: Staking](#reference-extension-staking)
- [Multi-Chain Support](#multi-chain-support)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Frontend Pages and Components](#frontend-pages-and-components)
- [Configuration](#configuration)
- [Development Roadmap](#development-roadmap)
- [License](#license)

---

## Architecture Overview

Polka-Xplo follows a **three-pillar architecture**:

```
                    +---------------------+
                    |   Polkadot Nodes    |
                    |  (Archive / RPC)    |
                    +----------+----------+
                               |
                          WebSocket (PAPI)
                               |
                    +----------v----------+
                    |      INDEXER        |
                    |  Dual-Stream Engine |
                    |  + Plugin Registry  |
                    +----+----------+-----+
                         |          |
                    Postgres      Redis
                    (Primary)    (Queue)
                         |
                    +----v----------+
                    |    REST API   |
                    |   :3001       |
                    +----+----------+
                         |
                    +----v----------+
                    |   NEXT.JS     |
                    |   Frontend    |
                    |   :3000       |
                    +---------------+
```

**1. Metadata-Driven Core** -- The system dynamically adapts its database schema and UI based on on-chain metadata from PAPI, not hardcoded logic.

**2. Hybrid Indexing Engine** -- A dual-stream architecture that combines a finalized stream (source of truth) with a best-head stream (optimistic, real-time updates), plus automatic backfill on restart.

**3. Extensible Plugin System** -- A standardized interface for "Pallet Extensions" that encapsulate backend indexing logic and frontend UI components. The core explorer remains stable while extensions grow alongside the chain.

---

## Tech Stack

| Layer       | Technology                                           |
|-------------|------------------------------------------------------|
| Monorepo    | [Turborepo](https://turbo.build/) + npm workspaces   |
| Language    | TypeScript 5.7+                                      |
| Chain API   | [Polkadot-API (PAPI)](https://papi.how/) v1.8+       |
| Backend     | Node.js 20+, Express                                 |
| Frontend    | Next.js 15 (App Router), React 19                    |
| Styling     | Tailwind CSS 3.4 (dark mode)                         |
| Database    | PostgreSQL 16 (JSONB + GIN indexes)                  |
| Queue       | Redis 7                                              |
| Deployment  | Docker Compose                                       |

---

## Project Structure

```
polka-xplo/
├── packages/
│   ├── shared/              # Core types, chain config, utilities
│   │   └── src/
│   │       ├── types.ts     # Domain types (Block, Extrinsic, Event, Account, etc.)
│   │       ├── config.ts    # Chain configs, search heuristics, formatters
│   │       └── index.ts
│   ├── db/                  # PostgreSQL client, migrations, typed queries
│   │   └── src/
│   │       ├── client.ts    # Connection pool, transactions
│   │       ├── queries.ts   # All typed database operations
│   │       ├── migrate.ts   # Migration runner
│   │       └── migrations/
│   │           └── 001_core_schema.sql
│   ├── indexer/             # PAPI-based block processor and API server
│   │   └── src/
│   │       ├── index.ts     # Entry point, lifecycle orchestration
│   │       ├── client.ts    # PAPI client factory (WsProvider)
│   │       ├── ingestion/
│   │       │   ├── pipeline.ts         # Dual-stream engine + backfill
│   │       │   └── block-processor.ts  # Deep extraction & normalization
│   │       ├── plugins/
│   │       │   └── registry.ts         # Extension discovery & dispatch
│   │       └── api/
│   │           └── server.ts           # REST endpoints (Express)
│   └── web/                 # Next.js frontend
│       └── src/
│           ├── app/                    # App Router pages
│           │   ├── layout.tsx          # Root layout + header + search
│           │   ├── page.tsx            # Home (block list + OmniSearch)
│           │   ├── block/[id]/
│           │   ├── account/[address]/
│           │   ├── extrinsic/[hash]/
│           │   ├── chain/[chainId]/[...path]/
│           │   └── chain-state/[pallet]/[storage]/
│           ├── components/
│           │   ├── OmniSearch.tsx       # Smart search (hash/number/address)
│           │   ├── BlockList.tsx        # Block table
│           │   ├── ExtrinsicList.tsx    # Extrinsic table
│           │   ├── BalanceDisplay.tsx   # Balance breakdown (free/reserved/frozen)
│           │   ├── EventRenderer.tsx    # Dynamic plugin viewer + JSON fallback
│           │   └── JsonView.tsx         # Collapsible JSON display
│           ├── hooks/
│           │   ├── useLiveBalance.ts    # Real-time balance polling/subscription
│           │   └── usePapiClient.ts     # Frontend PAPI connection
│           └── lib/
│               ├── api.ts              # Typed API client for all endpoints
│               └── format.ts           # Hash truncation, balance formatting, timeAgo
├── extensions/
│   └── pallet-staking/     # Reference extension (Staking pallet)
│       ├── manifest.json    # Declares supported events and calls
│       ├── indexer/
│       │   └── event-handlers.ts    # onEvent, onExtrinsic, getMigrationSQL
│       ├── migrations/
│       │   └── 001_staking.sql      # Custom tables for staking data
│       └── ui/
│           ├── components/
│           │   └── RewardViewer.tsx  # Rich UI for Staking.Rewarded events
│           └── hooks/
│               └── useStakingInfo.ts
├── chain-config.json        # Multi-chain configuration
├── docker-compose.yml       # Full stack: Postgres, Redis, Indexer, Web
├── Dockerfile.indexer
├── Dockerfile.web
├── turbo.json               # Turborepo pipeline configuration
├── tsconfig.base.json       # Shared TypeScript base config
├── package.json             # Root workspace config
└── spec.txt                 # Original architecture specification
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10
- **Docker** and **Docker Compose** (for containerized deployment)
- **PostgreSQL 16** (if running locally without Docker)
- **Redis 7** (if running locally without Docker)
- Access to a Polkadot Archive Node RPC endpoint (e.g., `wss://rpc.polkadot.io`)

### Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/10igma/polka-xplo.git
   cd polka-xplo
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your database URL, Redis URL, and RPC endpoint
   ```

4. **Start infrastructure** (Postgres + Redis)

   ```bash
   docker compose up -d explorer-db explorer-redis
   ```

5. **Run database migrations**

   ```bash
   npm run db:migrate
   ```

6. **Start the indexer** (connects to Polkadot and begins ingesting blocks)

   ```bash
   npm run indexer:start
   ```

7. **Start the frontend** (in a separate terminal)

   ```bash
   npm run web:dev
   ```

8. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker Deployment

Deploy the entire stack with a single command:

```bash
docker compose up -d
```

This starts four services:

| Service            | Port  | Description                           |
|--------------------|-------|---------------------------------------|
| `explorer-db`      | 5432  | PostgreSQL 16 (persistent volume)     |
| `explorer-redis`   | 6379  | Redis 7 (job queue + cache)           |
| `explorer-indexer`  | 3001  | Block processor + REST API            |
| `explorer-web`     | 3000  | Next.js frontend                      |

To stop:

```bash
docker compose down
```

To stop and remove all data volumes:

```bash
docker compose down -v
```

---

## Packages

### @polka-xplo/shared

The shared library contains all domain types and utility functions used across the backend and frontend.

**Key exports:**

- **Types**: `Block`, `Extrinsic`, `ExplorerEvent`, `Account`, `AccountBalance`, `ChainConfig`, `ExplorerConfig`, `ExtensionManifest`, `PalletExtension`, `PaginatedResponse`, `HealthResponse`, `IndexerStatus`
- **Config utilities**: `DEFAULT_CHAINS`, `DEFAULT_CONFIG`, `getChainConfig()`, `formatTokenAmount()`, `detectSearchType()`, `truncateHash()`, `timeAgo()`

### @polka-xplo/db

The database layer provides a typed query interface over PostgreSQL.

**Core tables:**

| Table               | Purpose                                    |
|---------------------|--------------------------------------------|
| `blocks`            | Chain skeleton (height, hash, status, etc.) |
| `extrinsics`        | Decoded user transactions (JSONB args)      |
| `events`            | Decoded events, correlated to extrinsics    |
| `accounts`          | Identity and activity tracking              |
| `account_balances`  | Balance snapshots (free/reserved/frozen)     |
| `indexer_state`     | Per-chain sync progress                     |
| `extension_migrations` | Tracks applied extension migrations      |

**Key features:**
- Connection pooling with configurable limits
- Transaction support with automatic rollback
- JSONB columns with GIN indexes for flexible querying of extrinsic args and event data
- Upsert semantics for idempotent block re-processing
- Fork pruning for abandoned best-head blocks

### @polka-xplo/indexer

The indexing engine connects to a Polkadot node via PAPI and processes blocks into the database.

**Core components:**

- **`client.ts`** -- PAPI client factory using `WsProvider` for Archive Node connections. Supports multiple concurrent chain connections.
- **`ingestion/pipeline.ts`** -- The dual-stream architecture:
  - *Finalized stream*: Source of truth. Blocks marked `status: 'finalized'` are immutable.
  - *Best-head stream*: Optimistic updates for real-time UI responsiveness.
  - *Backfill*: On startup, detects gaps between DB and chain tip and batch-fills missing blocks.
- **`ingestion/block-processor.ts`** -- Deep extraction per block: header parsing, extrinsic decoding (module/call/args), event correlation via `ApplyExtrinsic` phase, `ExtrinsicFailed` detection, timestamp extraction from `Timestamp.set`, signer tracking.
- **`plugins/registry.ts`** -- Extension lifecycle manager (see [Extension System](#extension-system)).
- **`api/server.ts`** -- REST API serving indexed data to the frontend.

**Runtime upgrade handling:** The indexer monitors `specVersion` changes across blocks. When a runtime upgrade is detected, it logs the transition. In production, this triggers metadata re-fetch and descriptor regeneration.

### @polka-xplo/web

The Next.js 15 frontend uses the App Router with a combination of Server Components (for cacheable, SEO-friendly pages) and Client Components (for interactive features like search and live balance updates).

**Design philosophy:** High information density, low visual noise. Dark mode by default. Polkadot brand colors. Monospace fonts for hashes and addresses.

---

## Extension System

The extension/plugin system is the core differentiator of Polka-Xplo. It allows adding support for new Substrate pallets without modifying the core explorer code.

### How Extensions Work

**Backend (Indexer):**

1. On startup, the Plugin Registry scans the `/extensions` directory for `manifest.json` files.
2. Each manifest declares which events and calls the extension handles.
3. The registry builds dispatch indexes mapping `Module.Event` and `Module.Call` keys to handler functions.
4. During block processing, the core indexer checks the registry for each event/extrinsic:
   - If a matching plugin exists, it invokes the plugin's handler.
   - If no plugin exists, the data is saved as raw JSONB (the default handler).
5. Extensions can provide custom SQL migrations that run automatically on startup.

**Frontend (Web):**

1. The `EventRenderer` component maintains a registry mapping `Module.Event` to lazy-loaded React components.
2. When rendering an event, it checks for a registered plugin viewer.
3. If found, the plugin component is dynamically imported and rendered with a Suspense boundary.
4. If not found, it falls back to the generic `JsonView` (collapsible JSON display).

### Creating an Extension

Create a new directory under `/extensions`:

```
extensions/
└── pallet-mymod/
    ├── manifest.json            # Required: declares the extension
    ├── indexer/
    │   └── event-handlers.ts    # Backend event/extrinsic handlers
    ├── migrations/
    │   └── 001_mymod.sql        # Custom database tables
    └── ui/
        ├── components/
        │   └── MyViewer.tsx     # Rich event viewer component
        └── hooks/
            └── useMyData.ts     # Custom data hooks
```

**manifest.json:**

```json
{
  "id": "pallet-mymod",
  "name": "My Module",
  "version": "1.0.0",
  "description": "Extension for the MyModule pallet.",
  "palletId": "MyModule",
  "supportedEvents": [
    "MyModule.SomethingHappened",
    "MyModule.ValueChanged"
  ],
  "supportedCalls": [
    "MyModule.do_something",
    "MyModule.set_value"
  ],
  "dependencies": []
}
```

**Backend handler (`event-handlers.ts`):**

```typescript
import type { BlockContext, ExplorerEvent, Extrinsic } from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";

export async function onEvent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  if (event.module === "MyModule" && event.event === "SomethingHappened") {
    const who = String(event.data.who ?? "");
    const value = String(event.data.value ?? "0");
    await query(
      `INSERT INTO mymod_events (block_height, who, value) VALUES ($1, $2, $3)`,
      [ctx.blockHeight, who, value]
    );
  }
}

export function getMigrationSQL(): string {
  return `CREATE TABLE IF NOT EXISTS mymod_events (
    id SERIAL PRIMARY KEY,
    block_height BIGINT NOT NULL,
    who VARCHAR(66) NOT NULL,
    value VARCHAR(40) NOT NULL
  );`;
}
```

**Frontend viewer (`MyViewer.tsx`):**

```tsx
"use client";

export default function MyViewer({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-lg border border-blue-700/30 bg-blue-950/20 p-4">
      <span className="text-blue-400 text-sm font-medium">Something Happened</span>
      <p className="text-zinc-300 text-sm mt-1">Who: {String(data.who)}</p>
      <p className="text-zinc-300 text-sm">Value: {String(data.value)}</p>
    </div>
  );
}
```

Then register the viewer in `packages/web/src/components/EventRenderer.tsx`:

```typescript
const extensionComponents = {
  "MyModule.SomethingHappened": lazy(
    () => import("../../../extensions/pallet-mymod/ui/components/MyViewer")
  ),
};
```

### Reference Extension: Staking

The `pallet-staking` extension ships as a complete reference implementation:

**Handled events:** `Staking.Rewarded`, `Staking.Slashed`, `Staking.Bonded`, `Staking.Unbonded`, `Staking.Withdrawn`, `Staking.Chilled`, `Staking.EraPaid`, `Staking.StakersElected`

**Handled calls:** `Staking.bond`, `Staking.bond_extra`, `Staking.unbond`, `Staking.nominate`, `Staking.chill`, `Staking.validate`, `Staking.payout_stakers`

**Custom tables:** `staking_rewards`, `staking_slashes`, `staking_bonds`, `staking_stats`

**UI component:** `RewardViewer` renders a styled card for `Staking.Rewarded` events showing validator address and reward amount.

---

## Multi-Chain Support

Polka-Xplo supports multiple chains from a single deployment. Chain configuration lives in `chain-config.json`:

```json
{
  "chains": [
    {
      "id": "polkadot",
      "name": "Polkadot",
      "rpc": ["wss://rpc.polkadot.io"],
      "addressPrefix": 0,
      "tokenSymbol": "DOT",
      "tokenDecimals": 10,
      "colorTheme": "#E6007A"
    },
    {
      "id": "kusama",
      "name": "Kusama",
      "rpc": ["wss://kusama-rpc.polkadot.io"],
      "addressPrefix": 2,
      "tokenSymbol": "KSM",
      "tokenDecimals": 12,
      "colorTheme": "#000000"
    }
  ],
  "defaultChain": "polkadot"
}
```

**Pre-configured chains:** Polkadot, Kusama, Asset Hub (parachain), Moonbeam (EVM parachain with H160 addresses), Ajuna Network (gaming parachain).

**How it works:**
- The indexer reads `CHAIN_ID` from the environment to select which chain to index.
- The frontend provides chain-scoped routes at `/chain/[chainId]/...` with per-chain theming.
- PAPI's multi-descriptor system generates type-safe APIs for each configured chain.
- Address formatting adapts automatically (SS58 for Polkadot/Kusama, H160 for EVM chains).

To index multiple chains simultaneously, run multiple indexer instances with different `CHAIN_ID` values pointing at the same database.

---

## Database Schema

The core schema is defined in `packages/db/src/migrations/001_core_schema.sql`.

```
blocks (height PK, hash UNIQUE, parent_hash, state_root, extrinsics_root,
        timestamp, validator_id, status, spec_version, event_count, extrinsic_count)
    |
    +-- extrinsics (id PK, block_height FK, tx_hash, index, signer,
    |               module, call, args JSONB, success, fee, tip)
    |       |
    |       +-- events (id PK, block_height, extrinsic_id FK, index,
    |                   module, event, data JSONB, phase_type, phase_index)
    |
    +-- (via signer)
        accounts (address PK, public_key, identity JSONB, last_active_block,
                  created_at_block)
            |
            +-- account_balances (address PK/FK, free, reserved, frozen,
                                  flags, updated_at_block)

indexer_state (chain_id PK, last_finalized_block, last_best_block, state)
extension_migrations (extension_id + version PK, applied_at)
```

**Key design decisions:**

- **JSONB for extensibility**: The `args` column on extrinsics and `data` column on events store decoded pallet data as JSONB. This allows any pallet's data to be stored without schema migrations. GIN indexes enable efficient queries like `args->>'dest' = 'Alice'`.
- **Dual status tracking**: Blocks carry a `status` field (`best` or `finalized`). Best-head blocks provide instant UI feedback; finalized blocks are the immutable source of truth.
- **Fork pruning**: The `pruneForkedBlocks()` function removes best-only blocks from abandoned forks.
- **Idempotent writes**: All insert operations use `ON CONFLICT ... DO UPDATE` to safely re-process blocks.

---

## API Reference

The indexer exposes a REST API on port 3001 (configurable via `API_PORT`).

### Health Check

```
GET /health
```

Returns the indexer's operational status:

```json
{
  "status": "healthy",
  "nodeConnected": true,
  "syncLag": 2,
  "dbConnected": true,
  "chainTip": 24500000,
  "indexedTip": 24499998,
  "timestamp": 1707580800000
}
```

### Blocks

```
GET /api/blocks?limit=20&offset=0
```

Returns a paginated list of recent blocks (newest first).

```
GET /api/blocks/:id
```

Returns block details by height (numeric) or hash (0x-prefixed). Includes the block record, all extrinsics, and all events.

### Extrinsics

```
GET /api/extrinsics/:hash
```

Returns extrinsic details and all correlated events.

### Accounts

```
GET /api/accounts/:address
```

Returns account details (identity, balance breakdown) and recent extrinsics.

### Search

```
GET /api/search?q=<query>
```

Smart search with heuristic input detection:
- **Block number** (numeric input): searches blocks by height
- **Hash** (0x-prefixed, 66 chars): searches blocks and extrinsics by hash
- **Address** (SS58 or H160 format): searches/links to account page

### Extensions

```
GET /api/extensions
```

Returns a list of all registered extension manifests.

---

## Frontend Pages and Components

### Pages

| Route                                  | Description                                                      |
|----------------------------------------|------------------------------------------------------------------|
| `/`                                    | Home page with OmniSearch bar and recent blocks table             |
| `/block/[id]`                          | Block detail: header fields, extrinsics table, events list        |
| `/account/[address]`                   | Account dashboard: identity, balance breakdown, recent activity   |
| `/extrinsic/[hash]`                    | Extrinsic detail: decoded args, fee, success/fail, correlated events |
| `/chain-state/[pallet]/[storage]`      | Generic chain state browser using PAPI metadata introspection     |
| `/chain/[chainId]/[...path]`           | Multi-chain scoped view with per-chain theming                    |

### Components

| Component          | Type     | Description                                                           |
|--------------------|----------|-----------------------------------------------------------------------|
| `OmniSearch`       | Client   | Smart search bar with type detection and dropdown results             |
| `BlockList`        | Server   | Sortable block table with height, hash, time, extrinsic/event counts  |
| `ExtrinsicList`    | Server   | Extrinsic table with module/call badges, signer, success/fail status  |
| `BalanceDisplay`   | Server   | Four-quadrant balance card (transferable, free, reserved, frozen)      |
| `EventRenderer`    | Client   | Dynamic extension viewer loader with `JsonView` fallback              |
| `JsonView`         | Client   | Collapsible JSON display for raw event/extrinsic data                 |

### Hooks

| Hook               | Description                                                              |
|--------------------|--------------------------------------------------------------------------|
| `useLiveBalance`   | Polls account balance every 6s; designed for PAPI observable upgrade     |
| `usePapiClient`    | Manages a frontend PAPI client connection (smoldot-ready)                |

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable                  | Default                             | Description                          |
|---------------------------|-------------------------------------|--------------------------------------|
| `DATABASE_URL`            | `postgresql://polkaxplo:polkaxplo@localhost:5432/polkaxplo` | PostgreSQL connection string |
| `REDIS_URL`               | `redis://localhost:6379`            | Redis connection string              |
| `ARCHIVE_NODE_URL`        | `wss://rpc.polkadot.io`            | Polkadot Archive Node WebSocket RPC  |
| `CHAIN_ID`                | `polkadot`                          | Chain to index (matches chain-config.json) |
| `API_PORT`                | `3001`                              | Indexer API server port              |
| `BATCH_SIZE`              | `100`                               | Blocks per backfill batch            |
| `WORKER_CONCURRENCY`      | `4`                                 | Parallel block processing workers    |
| `NEXT_PUBLIC_API_URL`     | `http://localhost:3001`             | API base URL for the frontend        |
| `NEXT_PUBLIC_WS_URL`      | `ws://localhost:3001`               | WebSocket URL for live updates       |

### Scripts

| Command              | Description                                   |
|----------------------|-----------------------------------------------|
| `npm run build`      | Build all packages (via Turborepo)             |
| `npm run dev`        | Start all packages in development mode         |
| `npm run lint`       | Type-check all packages                        |
| `npm run db:migrate` | Run database migrations                        |
| `npm run indexer:start` | Build and start the indexer                 |
| `npm run web:dev`    | Start the Next.js frontend in dev mode         |
| `npm run web:build`  | Production build of the frontend               |
| `npm run docker:up`  | Start all Docker Compose services              |
| `npm run docker:down`| Stop all Docker Compose services               |

---

## Development Roadmap

### Phase 1: Core Skeleton (current)

- [x] Turborepo monorepo with 4 packages
- [x] PAPI client setup with WsProvider
- [x] Basic indexer (blocks, extrinsics, events)
- [x] PostgreSQL core schema with JSONB extensibility
- [x] Plugin registry with manifest-based discovery
- [x] Reference extension (Staking pallet)

### Phase 2: Data Layer and Minimal UI

- [x] Account balance indexing
- [x] Next.js pages: Home, Block Detail, Account Detail, Extrinsic Detail
- [x] OmniSearch with heuristic type detection
- [x] Tailwind design system with dark mode

### Phase 3: Extension Engine

- [x] Backend plugin registry with lifecycle hooks
- [x] Frontend dynamic import system with Suspense
- [x] Staking reference extension with custom tables and UI viewer

### Phase 4: Parachain and Optimization

- [x] Multi-chain configuration (`chain-config.json`)
- [x] Docker containerization
- [ ] PAPI descriptor generation per chain (`npx papi add`)
- [ ] ClickHouse integration for high-volume analytics
- [ ] smoldot light client for trustless frontend balance verification
- [ ] Redis queue-based ingestion for backpressure handling
- [ ] Table partitioning for events at scale
- [ ] Automated metadata update cron jobs

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).
