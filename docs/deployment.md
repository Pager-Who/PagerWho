# Production deployment

The production Compose deployment requires Linux, Bash, Docker Engine, a current
Docker Compose v2 with `up --wait` support, and an externally provisioned
PostgreSQL database. Unlike the root local evaluation stack, it does not start
PostgreSQL.

## Configure

From the repository root:

```bash
cp deploy/prod/.env.example .env
chmod 600 .env
```

Set `DATABASE_URL`, `WEB_APP_URL`, `WEBHOOK_SECRET_PEPPER`, and
`PROVIDER_CREDENTIAL_ENCRYPTION_KEY`. Replace every `REPLACE_WITH` value with an
independent random secret of at least 32 characters. Keep the provider encryption
key identical for the API and worker and stable across upgrades.

PostgreSQL must listen on an interface reachable from the containers and allow
the Compose network. `localhost` inside a container does not refer to the Docker
host. `host.docker.internal` is mapped to the host by the deployment Compose
files.

Production requires an HTTPS `WEB_APP_URL` because session cookies are secure.
Configure a reverse proxy to reach the default HTTP entry point at
`localhost:8080`, preserve `Host`, and send `X-Forwarded-Proto=https`.
`PAGERWHO_HTTP_PORT` changes the port. `PAGERWHO_HTTP_BIND` defaults to loopback.

The browser uses the same-origin `/api/v1` path. `WEB_APP_BASE_URL` and
`WEBHOOK_PUBLIC_BASE_URL` default to `WEB_APP_URL`; override them only when
externally visible links require a different origin.

Authentication SMTP and OIDC are optional. Without either, password accounts
can still register and sign in, but verification and password-reset emails are
not delivered. Production notification delivery defaults to `live`, so configure
project providers and personal destinations before expecting alerts.

## Deploy

```bash
PAGERWHO_ENV_FILE="$PWD/.env" bash deploy/prod/deploy.sh
```

The script does not fetch Git, switch branches, push, or prune images. Select the
desired checkout before running it. `PAGERWHO_IMAGE_TAG` can identify a release;
otherwise a UTC timestamp is used.

The script validates Compose, builds images, runs a configuration preflight,
applies committed migrations, recreates services, and waits up to 180 seconds
for them. Failed validation or migration stops deployment. This is a single-host
deployment with a possible interruption during upgrades, not a zero-downtime
release mechanism.

## Development containers

```bash
cp deploy/dev/.env.example deploy/dev/.env
chmod 600 deploy/dev/.env
# Edit database, URL, and secret values first.
PAGERWHO_ENV_FILE="$PWD/deploy/dev/.env" bash deploy/dev/deploy.sh
```

The default browser origin is `http://localhost:8080`. Update `WEB_APP_URL` if
the browser port changes. This stack runs Vite behind Nginx and does not mount
source files for live editing; use `pnpm dev` for normal development. For a
custom hostname, set `WEB_APP_URL` and `VITE_ALLOWED_HOSTS`.

## Verify and upgrade

```bash
PAGERWHO_ENV_FILE="$PWD/.env" docker compose --env-file .env -f deploy/prod/docker-compose.yml ps
PAGERWHO_ENV_FILE="$PWD/.env" docker compose --env-file .env -f deploy/prod/docker-compose.yml logs --tail 100
curl --fail http://localhost:8080/health
```

API documentation is available through `/api-docs` and `/openapi.json`. Also
verify page loading, sign-in, project access, webhook ingestion, worker readiness,
and live notification delivery through the public URL. Health alone does not
prove that external notifications work.

Back up PostgreSQL before upgrades and deploy the API, worker, and web together
when contracts change. Committed migrations are applied with `migrate:deploy`
and are not automatically reversed. Check database compatibility before rolling
back application images. The scripts do not manage remote servers, PostgreSQL
backups, or HTTPS certificates.
