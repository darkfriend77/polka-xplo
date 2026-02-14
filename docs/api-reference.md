# API Reference

The indexer exposes a REST API on port 3001 (configurable via `API_PORT`). Interactive Swagger documentation is available at [http://localhost:3001/api-docs](http://localhost:3001/api-docs).

All paginated endpoints use **1-based** page numbering with `limit` and `page` parameters.

---

## Health & Status

### `GET /health`

Returns the indexer's operational status.

```json
{
  "status": "healthy",
  "nodeConnected": true,
  "dbConnected": true,
  "chainTip": 8250000,
  "indexedTip": 8249998,
  "syncLag": 2,
  "timestamp": 1707580800000
}
```

### `GET /api/rpc-health`

Returns health stats for all RPC endpoints in the pool.

```json
{
  "endpointCount": 3,
  "endpoints": [
    { "url": "https://rpc-para.ajuna.network", "healthy": true, "successes": 5079, "failures": 0 },
    { "url": "https://ajuna.ibp.network", "healthy": true, "successes": 4821, "failures": 0 },
    { "url": "https://ajuna.dotters.network", "healthy": true, "successes": 4756, "failures": 1 }
  ]
}
```

### `GET /api/indexer-status`

Returns real-time indexer metrics (powers the Status dashboard).

```json
{
  "blocksPerMinute": 42.5,
  "blocksPerHour": 2550,
  "totalIndexed": 1250000,
  "chainTip": 8250000,
  "estimatedCompletion": "2026-02-15T12:00:00Z",
  "errors": 0,
  "memoryUsageMB": 185,
  "databaseSizeMB": 2048,
  "uptime": 86400
}
```

---

## Blocks

### `GET /api/blocks`

Paginated list of recent blocks (newest first).

| Parameter | Type   | Default | Description        |
| --------- | ------ | ------- | ------------------ |
| `limit`   | number | 20      | Results per page   |
| `page`    | number | 1       | Page number        |

### `GET /api/blocks/:id`

Block details by height (numeric) or hash (0x-prefixed). Includes the block record, all extrinsics, and all events.

---

## Extrinsics

### `GET /api/extrinsics`

Paginated list of extrinsics.

| Parameter | Type    | Default | Description                                |
| --------- | ------- | ------- | ------------------------------------------ |
| `limit`   | number  | 25      | Results per page                           |
| `page`    | number  | 1       | Page number                                |
| `signed`  | boolean | —       | `true` to hide unsigned inherents          |

### `GET /api/extrinsics/:hash`

Extrinsic details by transaction hash. Includes decoded arguments and all correlated events.

---

## Events

### `GET /api/events`

Paginated list of events.

| Parameter | Type   | Default | Description                        |
| --------- | ------ | ------- | ---------------------------------- |
| `limit`   | number | 25      | Results per page                   |
| `page`    | number | 1       | Page number                        |
| `module`  | string | —       | Filter by module (e.g., `Balances`) |

---

## Transfers

### `GET /api/transfers`

Paginated list of `Balances.Transfer` events.

| Parameter | Type   | Default | Description      |
| --------- | ------ | ------- | ---------------- |
| `limit`   | number | 25      | Results per page |
| `page`    | number | 1       | Page number      |

Response shape:

```json
{
  "data": [...],
  "total": 12345,
  "limit": 25,
  "page": 1
}
```

---

## Accounts

### `GET /api/accounts`

Paginated, ranked list of accounts with balances and extrinsic counts.

| Parameter | Type   | Default | Description      |
| --------- | ------ | ------- | ---------------- |
| `limit`   | number | 25      | Results per page |
| `page`    | number | 1       | Page number      |

### `GET /api/accounts/:address`

Account details including identity, balance breakdown (free, reserved, frozen), and recent extrinsics. Accepts SS58 addresses of any prefix or hex public keys.

### `GET /api/accounts/:address/asset-transfers`

Asset transfer history for an account. Returns all `asset_transfers` rows where the account is sender or receiver, joined with the `assets` table for symbol/name/decimals.

| Parameter | Type   | Default | Description                |
| --------- | ------ | ------- | -------------------------- |
| `limit`   | number | 25      | Results per page (max 100) |
| `offset`  | number | 0       | Offset for pagination      |

> **Address normalization:** The endpoint accepts SS58 addresses of any prefix or hex public keys. Internally, addresses are normalized to hex for matching against the database.

Response shape:

```json
{
  "data": [
    {
      "id": 1,
      "block_height": 8200000,
      "asset_id": "42",
      "from_address": "0x...",
      "to_address": "0x...",
      "amount": "1000000000000",
      "symbol": "USDt",
      "asset_name": "Tether USD",
      "decimals": 6
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 25,
  "hasMore": true
}
```

---

## Digest Logs

### `GET /api/logs`

Paginated list of block digest logs (PreRuntime, Seal, Consensus, etc.).

| Parameter | Type   | Default | Description      |
| --------- | ------ | ------- | ---------------- |
| `limit`   | number | 25      | Results per page |
| `page`    | number | 1       | Page number      |

---

## Runtime Metadata

### `GET /api/runtime`

List of all known spec versions with their block ranges.

### `GET /api/runtime/:specVersion`

Parsed pallet metadata for a specific spec version. Returns pallet name, index, and counts of storage items, calls, events, constants, and errors.

---

## Search

### `GET /api/search?q=<query>`

Smart search with heuristic input detection:

| Input Type      | Detection Rule                  | Behavior                            |
| --------------- | ------------------------------- | ----------------------------------- |
| Block number    | Numeric                         | Search blocks by height             |
| Hash            | 0x-prefixed, 66 chars           | Search blocks and extrinsics        |
| Address         | SS58 or hex public key          | Link to account page                |

---

## Extensions

### `GET /api/extensions`

Returns the list of all registered extension manifests.

---

## Statistics

### `GET /api/stats`

Aggregate chain statistics for the homepage (latest block, finalized block, signed extrinsics, transfers, total accounts, existential deposit, token decimals, parachain ID).

### `GET /api/stats/activity`

Time-series chain activity data for visualization. Aggregates extrinsics, events, blocks, and transfers into time buckets.

| Parameter | Type   | Default | Description                                |
| --------- | ------ | ------- | ------------------------------------------ |
| `period`  | string | `day`   | Bucket size: `hour`, `day`, `week`, `month` |
| `limit`   | number | 30      | Number of buckets to return (max 365)      |

Response shape:

```json
{
  "period": "day",
  "count": 30,
  "data": [
    {
      "timestamp": 1707580800000,
      "label": "2024-02-10T00:00:00.000Z",
      "extrinsics": 1250,
      "events": 4300,
      "blocks": 1440,
      "transfers": 85
    }
  ]
}
```

---

## XCM (Cross-Consensus Messaging)

These endpoints are available when the `ext-xcm` extension is active.

### `GET /api/xcm/messages`

Paginated list of XCM messages (inbound and outbound).

| Parameter   | Type    | Default | Description                                         |
| ----------- | ------- | ------- | --------------------------------------------------- |
| `limit`     | number  | 25      | Results per page (max 100)                          |
| `offset`    | number  | 0       | Offset for pagination                               |
| `direction` | string  | —       | Filter: `inbound` or `outbound`                     |
| `protocol`  | string  | —       | Filter: `UMP`, `DMP`, `HRMP`, `XCMP`                |
| `chain_id`  | number  | —       | Filter by para ID (matches origin or destination)   |

### `GET /api/xcm/transfers`

Paginated list of XCM value transfers with asset details.

| Parameter   | Type   | Default | Description                                        |
| ----------- | ------ | ------- | -------------------------------------------------- |
| `limit`     | number | 25      | Results per page (max 100)                         |
| `offset`    | number | 0       | Offset for pagination                              |
| `direction` | string | —       | Filter: `inbound` or `outbound`                    |
| `asset`     | string | —       | Filter by asset symbol (e.g. `AJUN`, `DOT`, `USDt`) |
| `from_chain`| number | —       | Filter by source parachain ID                      |
| `to_chain`  | number | —       | Filter by destination parachain ID                 |
| `address`   | string | —       | Filter by sender or receiver (SS58 or hex)         |

> **Address normalization:** SS58 addresses are automatically converted to hex public keys for matching. Both SS58 and hex formats are accepted.

### `GET /api/xcm/channels`

List of all observed XCM channels with message and transfer counts.

### `GET /api/xcm/channels/:fromParaId-:toParaId`

Details for a specific channel identified by the `fromParaId-toParaId` pair. Includes the channel record, recent messages, and recent transfers.

### `GET /api/xcm/summary`

XCM overview statistics: total messages by direction/protocol, total transfers by direction with distinct asset counts, and channel count.

Response shape:

```json
{
  "messages": {
    "inbound": { "UMP": 120 },
    "outbound": { "DMP": 45, "HRMP": 30 }
  },
  "transfers": {
    "inbound": { "count": 95, "assets": 3 },
    "outbound": { "count": 80, "assets": 2 }
  },
  "channelCount": 5
}
```

---

**Next:** [Extension Guide](extension-guide.md) · [Architecture](architecture.md)
