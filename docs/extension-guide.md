# Extension Guide

The extension/plugin system is the core differentiator of Polka-Xplo. It separates pallet-specific logic from the generic explorer core, keeping both stable and independently evolvable.

## When to Use an Extension

Use an extension for any **pallet-specific** feature:

- Custom event handling (e.g., parsing staking rewards into dedicated tables)
- Dedicated database tables (e.g., `staking_rewards`, `governance_proposals`)
- Specialized UI components (e.g., a rich reward viewer instead of raw JSON)
- Pallet subpages

The core explorer handles generic block/extrinsic/event indexing and display. Extensions add domain-specific logic for individual pallets.

---

## How Extensions Work

### Backend (Indexer)

1. On startup, the Plugin Registry scans `/extensions/` for `manifest.json` files.
2. Each manifest declares which events and calls the extension handles.
3. The registry builds dispatch indexes mapping `Module.Event` and `Module.Call` keys to handler functions.
4. During block processing, the core indexer checks the registry for each event/extrinsic:
   - If a matching plugin exists → invoke the plugin's handler
   - If no plugin exists → save as raw JSONB (default behavior)
5. Extensions can provide custom SQL migrations that run on startup.

### Frontend (Web)

1. `EventRenderer` maintains a registry mapping `Module.Event` to lazy-loaded React components.
2. When rendering an event, it checks for a registered plugin viewer.
3. Found → dynamically import the component with a Suspense boundary.
4. Not found → fall back to `JsonView` (collapsible JSON display).

---

## Directory Structure

```
extensions/
└── pallet-mymod/
    ├── manifest.json            # Required: describes the extension
    ├── package.json             # TypeScript build config
    ├── tsconfig.json
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

---

## Step-by-Step: Creating an Extension

### 1. Create the manifest

`extensions/pallet-mymod/manifest.json`:

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

### 2. Write the backend handler

`extensions/pallet-mymod/indexer/event-handlers.ts`:

```typescript
import type { BlockContext, ExplorerEvent, Extrinsic } from "@polka-xplo/shared";
import { query } from "@polka-xplo/db";

export async function onEvent(ctx: BlockContext, event: ExplorerEvent): Promise<void> {
  if (event.module === "MyModule" && event.event === "SomethingHappened") {
    const who = String(event.data.who ?? "");
    const value = String(event.data.value ?? "0");
    await query(
      `INSERT INTO mymod_events (block_height, who, value) VALUES ($1, $2, $3)`,
      [ctx.blockHeight, who, value],
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

The `onEvent` function is called for every event matching the `supportedEvents` in your manifest. `onExtrinsic` works the same way for calls.

### 3. Add a SQL migration (optional)

`extensions/pallet-mymod/migrations/001_mymod.sql`:

```sql
CREATE TABLE IF NOT EXISTS mymod_events (
    id SERIAL PRIMARY KEY,
    block_height BIGINT NOT NULL,
    who VARCHAR(66) NOT NULL,
    value VARCHAR(40) NOT NULL
);

CREATE INDEX idx_mymod_events_block ON mymod_events (block_height);
CREATE INDEX idx_mymod_events_who ON mymod_events (who);
```

Migrations run automatically on indexer startup. The `extension_migrations` table tracks which have been applied.

### 4. Create a frontend viewer (optional)

`extensions/pallet-mymod/ui/components/MyViewer.tsx`:

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

### 5. Register the viewer

In `packages/web/src/components/EventRenderer.tsx`, add the lazy import:

```typescript
const extensionComponents = {
  "MyModule.SomethingHappened": lazy(
    () => import("../../../extensions/pallet-mymod/ui/components/MyViewer"),
  ),
};
```

---

## Reference Extension: Staking

The `pallet-staking` extension ships as a complete working example.

### Handled Events

`Staking.Rewarded`, `Staking.Slashed`, `Staking.Bonded`, `Staking.Unbonded`, `Staking.Withdrawn`, `Staking.Chilled`, `Staking.EraPaid`, `Staking.StakersElected`

### Handled Calls

`Staking.bond`, `Staking.bond_extra`, `Staking.unbond`, `Staking.nominate`, `Staking.chill`, `Staking.validate`, `Staking.payout_stakers`

### Custom Tables

`staking_rewards`, `staking_slashes`, `staking_bonds`, `staking_stats`

### UI Component

`RewardViewer` renders a styled card for `Staking.Rewarded` events showing validator address and reward amount.

---

## Reference Extension: XCM

The `ext-xcm` extension is a more advanced example that demonstrates multi-table schemas, multi-endpoint APIs, dedicated web pages, and cross-table joins.

### Handled Events

The manifest covers events from multiple pallets involved in cross-chain messaging:

`PolkadotXcm.Sent`, `PolkadotXcm.Attempted`, `PolkadotXcm.FeesPaid`, `XcmpQueue.XcmpMessageSent`, `XTokens.TransferredAssets`, `MessageQueue.Processed`, `ParachainSystem.UpwardMessageSent`, `ParachainSystem.DownwardMessagesReceived`, `CumulusXcm.ExecutedDownward`, and more.

### Custom Tables

- **`xcm_messages`** — Every inbound/outbound XCM message with direction, protocol (UMP/DMP/HRMP/XCMP), origin/dest para IDs, sender, and success status.
- **`xcm_transfers`** — Value transfers extracted from XCM messages, linking to the parent message. Includes from/to chain IDs, addresses, asset symbol and amount.
- **`xcm_channels`** — Aggregated channel statistics between parachain pairs with message and transfer counts.

### API Endpoints

The extension contributes five REST endpoints:

| Endpoint                                 | Description                                    |
| ---------------------------------------- | ---------------------------------------------- |
| `GET /api/xcm/messages`                  | Paginated messages with direction/protocol filters |
| `GET /api/xcm/transfers`                 | Paginated transfers with asset/address filters |
| `GET /api/xcm/channels`                  | List all observed channels                     |
| `GET /api/xcm/channels/:from-:to`        | Channel detail with recent activity            |
| `GET /api/xcm/summary`                   | Aggregate XCM statistics                       |

### Frontend Pages

The web app includes dedicated XCM pages:

- **XCM Transfers** (`/transfers/xcm`) — Filterable table with asset symbol selector and direction filter.
- **Account XCM Tab** — The account detail view includes an XCM tab showing cross-chain activity for that account.

### Key Design Patterns

- **Multi-pallet event handling:** A single extension handles events from `PolkadotXcm`, `XcmpQueue`, `XTokens`, `MessageQueue`, `ParachainSystem`, and `CumulusXcm`.
- **Address normalization:** SS58 addresses are converted to hex public keys during indexing, enabling reliable cross-format lookups.
- **Graceful degradation:** All API endpoints return empty results if the XCM tables don't exist (extension not active), rather than throwing errors.
- **Multilocation parsing:** The event handler parses XCM V2, V3, and V4 multilocation formats to extract asset IDs, amounts, and destination chains.

---

## Extension API

### Handler Signatures

```typescript
// Called for each matching event during block processing
export async function onEvent(
  ctx: BlockContext,
  event: ExplorerEvent,
): Promise<void>;

// Called for each matching extrinsic during block processing
export async function onExtrinsic(
  ctx: BlockContext,
  extrinsic: Extrinsic,
): Promise<void>;

// Returns raw SQL for the extension's custom tables
export function getMigrationSQL(): string;
```

### BlockContext

```typescript
interface BlockContext {
  blockHeight: number;
  blockHash: string;
  timestamp: number | null;
  specVersion: number;
}
```

### Available Imports

Extensions can import from core packages:

```typescript
import type { BlockContext, ExplorerEvent, Extrinsic } from "@polka-xplo/shared";
import { query, transaction } from "@polka-xplo/db";
```

---

**Next:** [Architecture](architecture.md) · [API Reference](api-reference.md) · [Development](development.md)
