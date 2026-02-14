# Architecture

Polka-Xplo is a modular, metadata-driven block explorer for the Polkadot ecosystem. This document explains the system design, data flow, and key architectural decisions.

## System Overview

```
                    +---------------------+
                    |   Substrate Nodes   |
                    | (Archive / RPC × N) |
                    +----------+----------+
                               |
                    WSS (PAPI) + HTTP (RPC Pool)
                               |
                    +----------v----------+
                    |      INDEXER        |
                    |  Dual-Stream Engine |
                    |  + RPC Pool (N eps) |
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

## Three Pillars

### 1. Metadata-Driven Core

The system dynamically adapts its database schema and UI based on on-chain runtime metadata from PAPI, not hardcoded logic. Extrinsic arguments and event data are stored as JSONB — any pallet's data is preserved without schema migrations.

### 2. Hybrid Indexing Engine

A dual-stream architecture that combines:

- **Finalized stream** — Source of truth. Blocks marked `finalized` are immutable.
- **Best-head stream** — Optimistic updates for real-time UI responsiveness.
- **Backfill** — On startup, detects the gap between DB and chain tip and batch-fills missing blocks.

### 3. Extensible Plugin System

A standardized interface for "Pallet Extensions" that add backend indexing logic, custom database tables, and frontend UI components. The core explorer stays stable while extensions grow alongside the chain. See the [Extension Guide](extension-guide.md).

---

## Monorepo Structure

Polka-Xplo is a Turborepo monorepo with npm workspaces:

```
polka-xplo/
├── packages/
│   ├── shared/       # Core types, chain config, SS58 utilities
│   ├── db/           # PostgreSQL client, migrations, typed queries
│   ├── indexer/      # PAPI-based block processor + REST API
│   └── web/          # Next.js 15 frontend (App Router)
├── extensions/
│   ├── ext-assets/       # Asset pallet extension
│   ├── ext-governance/   # Governance pallet extension
│   ├── ext-xcm/          # XCM cross-chain messaging extension
│   └── pallet-staking/   # Reference staking extension
├── chain-config.json     # Multi-chain configuration
├── docker-compose.yml    # Full stack deployment
└── turbo.json            # Build pipeline
```

### Package Dependency Graph

```
shared ← db ← indexer
shared ← web
shared ← extensions/*
db     ← extensions/*
```

`shared` is the foundation — it has no internal dependencies. `db` depends on `shared` for types. `indexer` depends on both. `web` depends on `shared` only (data comes via the REST API).

---

## Tech Stack

| Layer      | Technology                                         |
| ---------- | -------------------------------------------------- |
| Monorepo   | Turborepo + npm workspaces                         |
| Language   | TypeScript 5.7+ (strict mode, ESM)                 |
| Chain API  | Polkadot-API (PAPI) v1.8+                          |
| Backend    | Node.js 20+, Express                               |
| Frontend   | Next.js 15 (App Router), React 19, Tailwind CSS 3, Recharts |
| Database   | PostgreSQL 16 (JSONB + GIN indexes)                |
| Queue      | Redis 7                                            |
| Testing    | Vitest                                             |
| Linting    | ESLint (flat config) + Prettier                    |
| Deployment | Docker Compose                                     |

---

## Indexer Deep Dive

### Dual-Stream Architecture

The `IngestionPipeline` class manages two concurrent data streams:

1. **Finalized Stream** (`client.finalizedBlock$`) — Subscribes to finalized blocks. These are the source of truth and are stored with `status: 'finalized'`.

2. **Best-Head Stream** (`client.bestBlocks$`) — Subscribes to the best (not-yet-finalized) block for real-time UI. Stored with `status: 'best'`. When the block is later finalized, it's updated in place.

On startup, the pipeline:
1. Queries the DB for the last finalized height
2. Queries the chain for the current tip
3. Backfills the gap in batches (configurable via `BATCH_SIZE` and `BACKFILL_CONCURRENCY`)
4. Transitions to live mode, processing blocks as they arrive

### RPC Pool

The `RpcPool` distributes JSON-RPC calls across multiple endpoints in round-robin fashion. Each endpoint has independent health tracking:
- Successes and failures are counted per endpoint
- Unhealthy endpoints are suspended with exponential backoff
- The pool automatically fails over to the next healthy endpoint
- Health stats are exposed via `/api/rpc-health`

### Block Processing

For each block, `processBlock()` runs in a single database transaction:

1. **Header** — Height, hash, parent hash, state root, extrinsics root, digest logs
2. **Extrinsics** — Decoded via PAPI metadata: module, call, arguments (JSONB), signer, tip
3. **Events** — Correlated to extrinsics via `ApplyExtrinsic` phase index
4. **Fee enrichment** — `TransactionFeePaid` or `Balances.Withdraw` fallback
5. **Failure detection** — `System.ExtrinsicFailed` marks the extrinsic as failed
6. **Account tracking** — Signers and event-referenced accounts are upserted
7. **Extension hooks** — Plugin handlers are invoked for matching events/extrinsics

All writes use `ON CONFLICT DO UPDATE` for idempotent re-processing.

### Runtime Metadata

The `RuntimeParser` fetches V14 metadata via `state_getMetadata` and extracts pallet summaries (storage items, calls, events, constants, errors). This powers the `/runtime` page and is cached per spec version.

---

## Database Schema

The core schema lives in `packages/db/src/migrations/`:

```
blocks (height PK, hash UNIQUE, parent_hash, state_root, extrinsics_root,
        timestamp, validator_id, status, spec_version, event_count,
        extrinsic_count, digest_logs JSONB)
    │
    ├── extrinsics (id PK, block_height FK, tx_hash, index, signer,
    │               module, call, args JSONB, success, fee, tip)
    │       │
    │       └── events (id PK, block_height, extrinsic_id FK, index,
    │                   module, event, data JSONB, phase_type, phase_index)
    │
    └── accounts (address PK, public_key, identity JSONB,
                  last_active_block, created_at_block)
            │
            └── account_balances (address PK/FK, free, reserved, frozen,
                                  flags, updated_at_block)

indexer_state (chain_id PK, last_finalized_block, last_best_block, state)
extension_migrations (extension_id + version PK, applied_at)
```

### Extension Tables

Extensions create their own tables via SQL migrations:

```
assets (asset_id PK, owner, symbol, name, decimals, ...)
asset_transfers (id PK, block_height, asset_id, from_address, to_address, amount)

staking_rewards / staking_slashes / staking_bonds / staking_stats

xcm_messages (id PK, message_hash, message_id, direction, protocol,
              origin_para_id, dest_para_id, sender, success,
              block_height, extrinsic_id)
    │
    └── xcm_transfers (id PK, xcm_message_id FK, direction,
                       from_chain_id, to_chain_id,
                       from_address, to_address,
                       asset_id, asset_symbol, amount,
                       block_height, extrinsic_id)

xcm_channels (from_para_id, to_para_id, message_count, transfer_count, ...)
```

### Key Design Decisions

- **JSONB for extensibility** — `args` (extrinsics) and `data` (events) store decoded pallet data as JSONB. GIN indexes enable efficient queries like `args->>'dest' = '0x...'`.
- **Dual status tracking** — Blocks carry `status` (`best` or `finalized`). Best-head blocks provide instant UI feedback; finalized blocks are immutable.
- **Fork pruning** — `pruneForkedBlocks()` removes best-only blocks from abandoned forks when the finalized chain advances past them.
- **Idempotent writes** — All inserts use `ON CONFLICT DO UPDATE` to safely re-process blocks without duplicates.

---

## Frontend Architecture

### Server vs Client Components

The Next.js 15 App Router uses a mix:

- **Server Components** — Data-fetching pages (`page.tsx`), stats bar, block/extrinsic lists. Rendered at request time (`force-dynamic`), no client bundle cost.
- **Client Components** — Interactive elements: search bar, pagination, address display (SS58 prefix selector), theme/dark mode, live balance polling.

### Context Providers

Two client-side React contexts wrap the app:

- **SS58Provider** — Manages the user's preferred SS58 address prefix for display
- **ThemeProvider** — Applies chain-specific branding (colors, token symbol, name)

### Account Detail View

The account detail page uses a three-panel server-rendered overview (identity, stats, native balance) with a standalone asset balances card. Below that, an `AccountActivity` client component provides four lazy-loaded tabs:

- **Extrinsics** — Recent extrinsics by the account (server-side passed)
- **Transfers** — Native token transfers (sender/receiver)
- **Assets** — Asset transfer history with symbol, amount, and counterparty
- **XCM** — Cross-chain message and transfer history

Each tab loads data on demand via the REST API and supports pagination.

### Activity Chart

The homepage features an interactive `ActivityChart` component (powered by **Recharts**) that visualizes chain activity over time. Users can switch between four time periods (Hourly, Daily, Weekly, Monthly) and toggle four metrics (Extrinsics, Transfers, Events, Blocks). Data is fetched from `/api/stats/activity`.

### Extension UI

The `EventRenderer` component maintains a registry mapping `Module.Event` keys to lazy-loaded React components. When a matching extension viewer exists, it's dynamically imported with a Suspense boundary. Otherwise, the generic `JsonView` fallback renders the raw JSON data.

---

**Next:** [Configuration](configuration.md) · [API Reference](api-reference.md) · [Extension Guide](extension-guide.md)
