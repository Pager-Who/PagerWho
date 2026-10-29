# PagerWho contributor guidance

PagerWho is a TypeScript monorepo using pnpm 9.15.4 (pinned in package.json)
and Turborepo. The deployment images use Node.js 22.

## Project structure

- apps/web: React 19, Vite, and React Router frontend.
- apps/api: Express REST API.
- apps/worker: PostgreSQL-backed background worker.
- packages/contracts: shared Zod schemas and REST types.
- packages/api-client: typed REST client.
- packages/backend-core: backend services and domain logic.
- packages/db: Prisma schema, migrations, seed, and database client.
- packages/config and packages/logger: shared tooling and logging.
- infra: local PostgreSQL Docker Compose.
- deploy: Docker Compose deployment files and scripts.
- e2e: Playwright tests.

## Code boundaries

Under apps/web/src, app contains routing and providers, features contains
product flows, and shared contains reusable components and utilities. Reuse existing components
and design tokens. See apps/web/PRODUCT.md and apps/web/DESIGN.md for context.
Keep shared code independent of features. Use the existing React Query and typed
REST client patterns for server state. Product copy is English by default, with
Korean and Simplified Chinese translations in the existing i18n layer.

Keep REST request and response validation in packages/contracts. Put shared
backend domain logic in packages/backend-core. Validate external input at API
boundaries. Never log secrets, personal data, or raw form input.

## Development and verification

Run commands from the repository root unless a package directory is specified.
Use pnpm install --frozen-lockfile to install the committed dependency versions.
When intentionally changing dependencies, regenerate pnpm-lock.yaml with pnpm
and include it with the manifest changes.

Configure apps/api/.env, apps/worker/.env, and apps/web/.env from their adjacent
.env.example files as needed. Prisma CLI commands use packages/db/.env; configure
it from packages/db/.env.example. API, worker, and Prisma must target the same
database. See README.md for installation limits; keep their values
aligned between the API and worker.

Before the first local run:

```sh
pnpm db:up
pnpm db:generate
pnpm --filter @im/db migrate:deploy
pnpm dev
```

pnpm db:up starts local PostgreSQL through Docker Compose; skip it when using an
existing database. pnpm dev starts web, API, and worker but does not apply database
migrations. pnpm db:migrate runs Prisma migrate dev for developing schema changes;
use migrate:deploy to apply committed migrations. pnpm db:seed is optional demo
data for local development, not a production setup step.

See README.md for installation and Docker Compose deployment instructions,
and docs/architecture.md for architecture.

Run the smallest relevant package check first, for example:

```sh
pnpm --filter @im/web typecheck
pnpm --filter @im/backend-core test
```

Repository-wide checks are pnpm lint, pnpm typecheck, pnpm test, pnpm build,
pnpm test:e2e, and pnpm db:validate. Not every package defines a test script.
pnpm test excludes backend-core database integration tests; run those separately
with pnpm test:backend:integration against a prepared test database.

Playwright starts its own Vite server on port 5177. Install its Chromium browser
with pnpm exec playwright install chromium before the first E2E run. Most E2E
flows use mocked APIs; check each test before assuming a live backend is needed.
test-results and playwright-report are generated outputs and must not be committed.

Shared package build scripts primarily typecheck their TypeScript sources;
apps/web build also produces Vite assets in apps/web/dist. Database and runtime
checks may require Docker and a local environment file; do not assume the database
is running. Prisma validation requires DATABASE_URL but does not connect to the DB.

Keep changes scoped and preserve unrelated work. Retain applied database
migrations and add new migrations for schema changes. Do not commit credentials
or local environment files.
