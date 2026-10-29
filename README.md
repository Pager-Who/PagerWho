# PagerWho

Open-source incident response and on-call management for teams.

PagerWho turns monitoring alerts into deduplicated incidents, notifies the
on-call responder, and escalates automatically when nobody responds.

[Try PagerWho Cloud](https://pagerwho.com/) ·
[Read the documentation](https://pagerwho.com/docs) ·
[Self-host PagerWho](#self-host-pagerwho)

## Self-host PagerWho

The quickest way to evaluate PagerWho locally includes PostgreSQL, database
migrations, demo data, the API, worker, and web application in one Compose stack.

```sh
docker compose up --build -d --wait
```

Open [http://localhost:8080](http://localhost:8080) and sign in with:

```text
Email: testuser1@example.com
Password: Password123!
```

Notifications use log delivery in this local POC, so no external provider is
contacted. Data is stored in the `postgres-data` Docker volume. Stop the stack
with `docker compose down`. Add `-v` only when you intentionally want to delete
the POC database.

The root Compose stack is for local evaluation and binds the web application to
127.0.0.1. For an internet-facing installation, use the production deployment
configuration, generate independent secrets, configure HTTPS, and connect the
notification and authentication providers you need.

## Features

- Webhook alert ingestion, deduplication, and incident timelines.
- Service ownership and incident acknowledgement and resolution.
- Primary and secondary on-call rotations, previews, and temporary overrides.
- Escalation policies with delays and repeat rules.
- Slack, SMTP email, SMS, and phone notification providers.
- Event-driven workflow automation.
- Project roles, audit logs, and operational diagnostics.

## PagerWho Cloud

Want to evaluate PagerWho without operating infrastructure? Use the hosted
service at [pagerwho.com](https://pagerwho.com/). Product guides for alert intake,
incidents, on-call schedules, escalation policies, notifications, workflows,
roles, and troubleshooting are available in the
[PagerWho documentation](https://pagerwho.com/docs).

- [Architecture](docs/architecture.md)
- Self-hosted API documentation: `/api-docs` and `/openapi.json`.

## Requirements

- Node.js 22 and pnpm 9.15.4, as used by the deployment images.
- PostgreSQL; the local Compose file uses PostgreSQL 16.
- Docker with Compose for the local database or container deployment.
- Bash and standard Linux utilities for the deployment scripts.

Run the following commands from the repository root. Copy commands use shell
syntax; PowerShell users can use Copy-Item for the same files. Deployment script
examples are intended for a Linux host.

## Local development

Install the pinned package manager using your Node.js tooling, then install
repository dependencies:

```sh
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

Edit the copied files before running the application. The API, worker, and Prisma
CLI must use the same database. Set the frontend API URL and allowed browser
origin for your local URLs. Keep secrets out of version control.

```sh
pnpm db:up
pnpm db:generate
pnpm --filter @im/db migrate:deploy
pnpm dev
```

Skip pnpm db:up when using an existing PostgreSQL database. Vite normally serves
the frontend on port 5173, and the API uses port 3000. Follow the actual startup
output if a port differs. pnpm dev starts web, API, and worker; it does not apply
migrations. New password accounts must verify their email before signing in, so
configure authentication SMTP first or use a configured OIDC provider. Local-only
seed data includes verified demonstration users for testing without SMTP.

pnpm db:seed optionally creates local demonstration data. Do not use it as a
production provisioning step. pnpm db:migrate runs Prisma migrate dev for schema
development; migrate:deploy applies committed migrations to an existing or new
installation. Preserve historical migrations when upgrading an existing DB.

## API configuration

The API environment example keeps four core values active: DATABASE_URL,
WEB_APP_URL, WEBHOOK_SECRET_PEPPER, and PROVIDER_CREDENTIAL_ENCRYPTION_KEY.
The example secrets are for local development only. Generate independent random
secrets before deployment, and use the same provider encryption key in API and
worker. Keep existing encryption keys and webhook peppers stable across restarts;
changing them affects stored credentials or existing webhook authentication.

SMTP, OIDC, and phone verification examples are commented out. Uncomment and
configure only the features you use:

- Authentication email requires SMTP_HOST, SMTP_USER, and SMTP_PASSWORD. Without
  them, verification and password-reset messages are not sent. Email verification
  is optional, so password accounts can still sign in. This is separate from
  project SMTP for incident notifications.
- OIDC requires issuer, client ID, client secret, redirect URI, and
  AUTH_STATE_SECRET. The redirect URI must match the identity provider's
  registration. Provider ID and label are optional display/routing choices.
- Phone verification requires PHONE_VERIFICATION_SECRET as well as valid project
  Twilio configuration. Omitting the secret disables verification requests; it
  does not disable ordinary email/password login.

Use independent random values of at least 32 characters for optional auth and
phone secrets. Unconfigured optional features should remain commented out rather
than using empty or placeholder credentials as if they were configured.

These advanced API settings can be omitted unless you need to override behavior:

| Setting | Default behavior |
| --- | --- |
| PORT / HOST | Port 3000, bind to all interfaces |
| CORS_ORIGIN | Local Vite origins are allowed in development; WEB_APP_URL also supplies an allowed origin |
| AUTH_SESSION_TTL_SECONDS | Sessions last 30 days |
| AUTH_COOKIE_SECURE | Secure cookies in production; can also be enabled explicitly |
| SMTP_PORT / SMTP_SECURE | Port 587; TLS socket mode for port 465 or SMTP_SECURE=true |
| OIDC_PROVIDER_ID / OIDC_PROVIDER_LABEL | oidc / SSO |
| OIDC_SCOPES | openid email profile |
| OIDC_REQUIRE_VERIFIED_EMAIL | true |
| OIDC_CLIENT_AUTH_METHOD | client_secret_post; client_secret_basic is also supported |
| OIDC_POST_LOGIN_REDIRECT_URL | WEB_APP_URL, then the local frontend fallback |
| WEBHOOK_PUBLIC_BASE_URL | Local API URL; set your externally reachable API base URL for generated webhook URLs |

For HTTPS deployment set NODE_ENV=production and the correct public WEB_APP_URL;
production does not inherit the development-origin allowlist. Add CORS_ORIGIN
only for additional trusted browser origins. The production deployment example
contains more explicit values because it configures API and worker together.
Installation count limits and retention already have defaults; see
[Installation limits](#installation-limits) when overriding them.

## Notification setup

For local testing, set NOTIFICATION_DELIVERY_MODE=log in the worker environment.
In log mode, delivery is recorded locally without contacting notification providers.
Use live mode for actual delivery; missing configuration then produces failures
rather than simulated delivery. In auto mode, unconfigured providers can fall
back to local log delivery.

Configure project Email (SMTP) and Twilio providers through Project settings,
and configure each responder's destinations and channel preferences in User
settings. Verify phone numbers before enabling SMS or phone alerts. The API and
worker must share the same PROVIDER_CREDENTIAL_ENCRYPTION_KEY when storing and
using encrypted provider credentials.

Authentication email uses the deployment SMTP settings, independently of project
incident-notification SMTP. Without authentication SMTP, verification and
password-reset messages cannot be delivered. Google OIDC is optional and is
configured by the deployment operator. New email/password accounts can sign in
without verification; SMTP is needed only for verification and password resets.


## Production Docker Compose deployment

Use Linux, Bash, Docker Engine, and a current Docker Compose v2 supporting
up --wait and --wait-timeout. Unlike the root local POC stack, the production
stack runs the application services without a PostgreSQL server. Provision PostgreSQL separately and ensure that containers
can reach it. host.docker.internal is mapped to the Docker host, but PostgreSQL
must listen on a reachable interface and allow the container network. A database
host of localhost inside a container does not refer to the host machine.

### Configure the deployment

For production, from the repository root:

```bash
cp deploy/prod/.env.example .env
chmod 600 .env
```

Set DATABASE_URL, WEB_APP_URL, WEBHOOK_SECRET_PEPPER, and
PROVIDER_CREDENTIAL_ENCRYPTION_KEY. Replace every REPLACE_WITH value with your
own credentials or independent random secrets of at least 32 characters (for example, run openssl rand -hex 32 separately
for each secret). Keep
the provider encryption key identical for API and worker and stable across
upgrades. Do not copy development secrets to a public deployment.

Production requires an HTTPS WEB_APP_URL because production session cookies are
secure. Configure your HTTPS reverse proxy to reach the default HTTP entry point
at localhost:8080. The proxy must preserve Host and send X-Forwarded-Proto=https.
Set PAGERWHO_HTTP_PORT to change the port. PAGERWHO_HTTP_BIND defaults to loopback;
set it deliberately if a proxy on another machine must reach the published port.
Dev and prod can run together only if their host port bindings differ.

The browser uses the same-origin /api/v1 path in both stacks. There is no
PagerWho-specific domain or frontend build URL to configure. WEB_APP_BASE_URL
and WEBHOOK_PUBLIC_BASE_URL default to WEB_APP_URL in Compose; override only
when externally visible links require another origin. Additional trusted browser
origins can be supplied through CORS_ORIGIN.

Authentication SMTP and OIDC are optional. Without either, password accounts can
still register and sign in, but verification and password-reset emails are not
delivered; the preflight prints a warning. Phone verification settings remain optional. The
production notification mode defaults to live: configure project providers and
personal destinations before expecting actual alerts. Dev defaults to log,
which records simulated delivery. Auth SMTP and project notification SMTP are
separate settings.

### Deploy the current checkout

```bash
PAGERWHO_ENV_FILE="$PWD/.env" bash deploy/prod/deploy.sh
```

The scripts never fetch Git, switch branches, or push. Select the desired checkout
before running them. The old --no-pull argument is accepted for compatibility
and has no effect. PAGERWHO_IMAGE_TAG can identify a release; by default a UTC
timestamp tags the build. No automatic Docker image pruning is performed.

The script passes the selected file through both Compose --env-file interpolation
and container env_file configuration. It validates Compose, builds images, runs
a configuration preflight inside the application image, and applies migrations
only if validation passes. It then recreates services and waits up to 180 seconds
for their running/healthy state. Failed validation or migration stops deployment.
A process with no healthcheck, including the worker, is checked for running state;
review worker readiness through the authenticated Operations interface as well.
This is a single-host deployment with a possible interruption during upgrades,
not an atomic or zero-downtime release mechanism.

### Development containers

```bash
cp deploy/dev/.env.example deploy/dev/.env
chmod 600 deploy/dev/.env
# Edit the file with your database, URLs, and generated secrets first.
PAGERWHO_ENV_FILE="$PWD/deploy/dev/.env" bash deploy/dev/deploy.sh
```

The default dev browser origin is http://localhost:8080. If you change the port
used by the browser, update WEB_APP_URL to match. This stack runs Vite
behind Nginx and does not mount host source for live editing. Use pnpm dev for
normal source development. For a custom dev hostname, set WEB_APP_URL and
VITE_ALLOWED_HOSTS in the deployment environment file. Do not disable Vite host
validation globally.

### Check and upgrade

```bash
PAGERWHO_ENV_FILE="$PWD/.env" docker compose --env-file .env -f deploy/prod/docker-compose.yml ps
PAGERWHO_ENV_FILE="$PWD/.env" docker compose --env-file .env -f deploy/prod/docker-compose.yml logs --tail 100
curl --fail http://localhost:8080/health
```

API documentation is proxied through /api-docs and /openapi.json. Verify page
loading, sign-in, project access, webhook ingestion, worker readiness, and live
notification delivery through your public URL. Health alone does not prove that
external notifications work. Nginx and API request logs omit query strings and client
addresses to avoid exposing webhook query tokens or personal data.

Back up PostgreSQL before upgrades and deploy API, worker, and web together when
contracts change. Existing committed migrations are applied by migrate:deploy.
Migrations are not automatically reversed; check database compatibility before
rolling application images back. Retain known-good images yourself. The scripts
do not deploy to a remote server or manage PostgreSQL backups or HTTPS certificates.

## Installation limits

There are no Free/Pro feature tiers. Set the same installation values for API and
worker and restart both processes after changes.

| Variable | Default | Meaning |
| --- | --- | --- |
| PAGERWHO_LIMIT_WORKSPACES | 0 | Workspaces owned by a user |
| PAGERWHO_LIMIT_MEMBERS | 0 | Active members plus pending invites per workspace |
| PAGERWHO_LIMIT_SERVICES | 0 | Services per workspace |
| PAGERWHO_LIMIT_ON_CALL_SCHEDULES | 0 | Schedules per workspace |
| PAGERWHO_LIMIT_ESCALATION_POLICIES | 0 | Policies per workspace |
| PAGERWHO_RETENTION_DAYS | 365 | Retention cleanup age |

Count limits accept non-negative safe integers; 0 means unlimited. Retention
accepts 1 through 36500 days. The worker removes old resolved incidents,
notification logs, workflow runs, processed workflow events, and activity logs.
Unlimited resource counts do not mean unlimited retention. Administrators can
apply expiring resource overrides per workspace; expiry restores the installation
default. Workspace ownership limits are configured installation-wide.

## Deployment checks

With Node.js, Bash, and Docker Compose installed, run:

```sh
node --test deploy/tests/*.test.mjs
```

These checks use synthetic settings and stubbed deployment commands. They verify
Compose configuration and failure gates without migrating a real database. Full
container verification additionally requires building the images and running
against an isolated PostgreSQL instance.

## Development checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm db:validate
```

pnpm test excludes backend-core database integration tests; run
pnpm test:backend:integration separately against a prepared test database.
Prisma validation requires DATABASE_URL but does not connect to the DB.
Playwright starts a Vite server on port 5177 and most UI tests mock API responses.
Use pnpm --filter <package-name> <command> for focused checks.
