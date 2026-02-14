# Polka-Xplo

A modular, metadata-driven blockchain explorer for the Polkadot ecosystem. Built on [Polkadot-API (PAPI)](https://papi.how/) for type-safe, light-client-ready chain interaction.

Polka-Xplo ingests, indexes, and serves blockchain data (blocks, extrinsics, events, accounts, balances) through a plugin-first architecture that adapts dynamically to runtime upgrades and custom pallet extensions.

## Quick Start

```bash
# Clone
git clone https://github.com/10igma/polka-xplo.git && cd polka-xplo

# Launch (Ajuna Network)
docker compose -f docker-compose.yml -f docker-compose.ajuna.yml up -d

# Verify
curl http://localhost:3001/health
```

Open **http://localhost:3000** — the explorer is live.

> Works for **any** Substrate chain — just swap the RPC endpoint and chain ID. See [Switching Chains](docs/getting-started.md#switching-chains).

## Documentation

| Guide | Description |
| ----- | ----------- |
| [Getting Started](docs/getting-started.md) | Docker quickstart, local dev, switching chains |
| [Architecture](docs/architecture.md) | System overview, indexer deep-dive, DB schema |
| [Configuration](docs/configuration.md) | Environment variables, chain-config, Docker overrides |
| [API Reference](docs/api-reference.md) | All REST endpoints with parameters and response shapes |
| [Extension Guide](docs/extension-guide.md) | Build chain-specific plugins (staking, governance, etc.) |
| [Deployment](docs/deployment.md) | Docker Compose production setup, monitoring, multi-chain |
| [Development](docs/development.md) | Local dev, testing, linting, TypeScript config |
| [Troubleshooting](docs/troubleshooting.md) | Common errors and fixes |

## Tech Stack

- **Indexer:** Node.js 20, Polkadot-API (PAPI), PostgreSQL 16, Redis 7 (BullMQ)
- **Frontend:** Next.js 15, React 19, Tailwind CSS 3
- **Tooling:** TypeScript (strict), Turborepo, Vitest, ESLint, Prettier
- **Deployment:** Docker Compose

## Project Structure

```
packages/
  shared/     # Config, types, constants
  db/         # PostgreSQL client, queries, migrations
  indexer/    # Block processor, REST API, extension loader
  web/        # Next.js frontend
extensions/
  pallet-staking/   # Reference extension (Ajuna staking)
```

## License

[MIT](LICENSE)
