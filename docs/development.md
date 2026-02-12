# Development Guide

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- **PostgreSQL** 16 (local or Docker)
- **Redis** 7 (local or Docker)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

> The root `.npmrc` sets `legacy-peer-deps=true` to resolve a transient peer-dep conflict between ESLint 10 and eslint-plugin-react-hooks.

### 2. Start infrastructure

The easiest way to get Postgres and Redis running locally:

```bash
docker compose up -d explorer-db explorer-redis
```

### 3. Set environment variables

```bash
export DATABASE_URL="postgresql://explorer:explorer@localhost:5432/explorer"
export REDIS_URL="redis://localhost:6379"
export ARCHIVE_NODE_URL="wss://rpc1.ajuna.network"
export CHAIN_ID="ajuna"
```

### 4. Run migrations

```bash
npm run migrate -w packages/db
```

### 5. Start the indexer

```bash
npm run dev -w packages/indexer
```

### 6. Start the frontend

```bash
npm run dev -w packages/web
```

The frontend runs on `http://localhost:3000` and the API on `http://localhost:3001`.

---

## Monorepo Structure

| Package            | Purpose                            |
| ------------------ | ---------------------------------- |
| `packages/shared`  | Config, types, constants           |
| `packages/db`      | Database client, queries, migrate  |
| `packages/indexer` | Block processor, REST API, plugins |
| `packages/web`     | Next.js frontend                   |
| `extensions/`      | Optional chain-specific plugins    |

Build order: `shared` → `db` → `indexer` / `web`.

Turborepo handles the dependency graph:

```bash
npx turbo build        # Build all packages in order
npx turbo dev          # Dev mode with watch
```

---

## TypeScript Configuration

The repo uses a base `tsconfig.base.json` extended by each package:

| Config                                 | Purpose                      |
| -------------------------------------- | ---------------------------- |
| `tsconfig.base.json`                   | Shared strict settings       |
| `packages/shared/tsconfig.json`        | Compiles to `dist/`          |
| `packages/db/tsconfig.json`            | Compiles to `dist/`          |
| `packages/indexer/tsconfig.json`       | Compiles to `dist/`          |
| `packages/web/tsconfig.json`           | Next.js preset               |

All packages use:
- `strict: true`
- `esModuleInterop: true`
- `skipLibCheck: true`
- `module: "nodenext"` / `moduleResolution: "nodenext"` (except Next.js)

---

## Testing

Tests use **Vitest** and live in `packages/*/src/__tests__/`:

```bash
# Run all tests
npx vitest run

# Watch mode
npx vitest

# With coverage
npx vitest run --coverage
```

### Test files

| File                              | What it tests                                |
| --------------------------------- | -------------------------------------------- |
| `shared/__tests__/config-utils.test.ts`   | Chain config loading & field validation |
| `shared/__tests__/ss58.test.ts`           | SS58 address encoding & decoding        |
| `indexer/__tests__/hex-utils.test.ts`     | Hex ↔ bytes conversion, edge cases      |
| `indexer/__tests__/event-utils.test.ts`   | Event extraction & correlation          |
| `web/src/lib/__tests__/format.test.ts`    | Balance & number formatting             |

### Writing tests

Follow the existing pattern:

```typescript
import { describe, it, expect } from "vitest";

describe("myModule", () => {
  it("should handle edge case", () => {
    expect(myFunction(null)).toBe(undefined);
  });
});
```

Place test files in `__tests__/` alongside the source they test. Vitest is configured at the root level.

---

## Linting & Formatting

### ESLint

Flat config (`eslint.config.js`) with:
- `@typescript-eslint/recommended`
- `eslint-plugin-react-hooks`
- `eslint-config-prettier` (disables style rules that conflict with Prettier)

```bash
npx eslint .              # Lint all files
npx eslint . --fix        # Auto-fix
```

### Prettier

Config in `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

```bash
npx prettier --write .    # Format all files
npx prettier --check .    # Check (CI mode)
```

### Pre-commit workflow

```bash
npx eslint . --fix && npx prettier --write . && npx vitest run
```

---

## NPM Scripts

| Script                         | Description                                |
| ------------------------------ | ------------------------------------------ |
| `npm run build`                | Build all packages (Turborepo)             |
| `npm run dev`                  | Dev mode for all packages                  |
| `npm run dev -w packages/web`  | Dev mode for frontend only                 |
| `npm run dev -w packages/indexer` | Dev mode for indexer only               |
| `npm run migrate -w packages/db` | Run database migrations                  |
| `npm test`                     | Run all vitest tests                       |
| `npm run lint`                 | Run ESLint                                 |
| `npm run format`               | Run Prettier (write)                       |

---

## Adding a New Feature

### New API endpoint

1. Add the route handler in `packages/indexer/src/api/server.ts`
2. Add any needed SQL queries in `packages/db/src/queries.ts`
3. Add types to `packages/shared/src/types.ts`
4. Add tests

### New frontend page

1. Create `packages/web/src/app/<route>/page.tsx`
2. Use server components, add `export const dynamic = "force-dynamic"` if needed
3. Fetch data via the API helpers in `packages/web/src/lib/api.ts`
4. Add any reusable components in `packages/web/src/components/`

### New database migration

1. Add `packages/db/src/migrations/NNN_description.sql`
2. Migrations run in filename order. Use `IF NOT EXISTS` for idempotency.
3. Run: `npm run migrate -w packages/db`

### New chain-specific extension

See the [Extension Guide](extension-guide.md).

---

**Next:** [Architecture](architecture.md) · [Extension Guide](extension-guide.md)
