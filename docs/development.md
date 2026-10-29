# Local development

PagerWho uses Node.js 22, pnpm 9.15.4, Turborepo, and PostgreSQL. Run commands
from the repository root.

## Setup

```sh
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

Edit the copied files before starting the application. The API, worker, and
Prisma CLI must use the same database. Keep secrets out of version control.

```sh
pnpm db:up
pnpm db:generate
pnpm --filter @im/db migrate:deploy
pnpm dev
```

Skip `pnpm db:up` when using an existing PostgreSQL database. Vite normally
serves the frontend on port 5173 and the API uses port 3000. `pnpm dev` starts
the web, API, and worker, but does not apply migrations.

Email verification is optional. Password accounts can register and sign in
without authentication SMTP, but verification and password-reset messages will
not be delivered. A configured OIDC provider can also be used for sign-in.

`pnpm db:seed` creates optional demonstration data and must not be used as a
production provisioning step. Use `pnpm db:migrate` when developing schema
changes and `migrate:deploy` to apply committed migrations. Preserve historical
migrations when upgrading an existing database.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm db:validate
```

`pnpm test` excludes backend-core database integration tests. Run
`pnpm test:backend:integration` separately against a prepared test database.
Prisma validation requires `DATABASE_URL` but does not connect to the database.
Playwright starts a Vite server on port 5177, and most UI tests mock API
responses. Use `pnpm --filter <package-name> <command>` for focused checks.

Deployment configuration tests can be run with:

```sh
pnpm test:deploy
```
