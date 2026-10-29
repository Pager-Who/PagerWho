# PagerWho architecture

This document describes the current application boundaries and execution model.
See the [root README](../README.md) for installation, configuration, and deployment.

## Runtime topology

```text
Browser -> web frontend / Nginx -> Express REST API -> PostgreSQL
                                                          ^
                                                    background worker
                                                    escalation / workflows
                                                    notification / retention
                                                          |
                                                  external providers
```

The frontend is React 19 with Vite, React Router, TanStack Query, and Tailwind CSS.
The API and worker share TypeScript domain services and a Prisma database client.
PostgreSQL is the source of truth and the work queue. There is no required Redis
or separate message broker. Docker Compose runs application processes; the
production and development deployment stacks require a separately reachable DB.

Development containers run Vite behind Nginx. Production builds static assets and
serves them from Nginx, which proxies /api/ and /health to the API. The worker is
a separate process and does not receive browser traffic.

## Repository boundaries

| Location | Responsibility |
| --- | --- |
| apps/web | Routing, UI flows, local form state, REST queries |
| apps/api | HTTP routing, authentication, validation, response mapping |
| apps/worker | Polling, provider calls, retries, workflow processing, retention |
| packages/contracts | Zod schemas and shared request/response types |
| packages/api-client | Typed browser REST client and common API errors |
| packages/backend-core | Domain services, authorization, state transitions |
| packages/db | Prisma schema, migrations, database client, development seed |
| packages/config | Shared lint and TypeScript configuration |
| packages/logger | Structured logging utilities |
| infra | Local PostgreSQL Compose service |
| deploy | Application Dockerfiles, Compose stacks, Nginx, deployment scripts |
| e2e | Playwright UI tests and API fixtures |

The web app uses src/app for composition, src/features for product flows, and
src/shared for reusable components, auth, i18n, theme, and API wiring. It imports
contracts and api-client, never the database or backend domain services.

Contracts do not depend on React, Prisma, or backend services. The API and worker
use backend-core, contracts, db, and logger. backend-core depends on contracts and
db; external notification adapters belong to the worker. The database seed uses
logger. Shared packages expose TypeScript sources; their build scripts mainly
perform type checking. The web build also emits browser assets.

## Domain model

A workspace (called a project in the UI) scopes membership, roles, teams,
services, schedules, policies, workflows, and provider settings. Teams group
people; they are not services or schedule rotations.

```text
Incident -> Service -> Escalation policy -> ordered steps
                                        -> primary/secondary on-call schedule
                                        -> user or team
                                        -> webhook or team channel target
                                        -> notification intents
```

Services are monitored systems. Their owner team provides ownership context;
it does not independently determine notification routing. A service references
an escalation policy, whose steps can reference on-call schedules. Schedule
participants are users. Primary and secondary rotations share the schedule's
cadence, while participant lists can differ. Overrides replace the calculated
responder for a selected time range.

## Incident lifecycle and ingestion

The API accepts manual incident creation and service webhook events. Generic
webhooks require a readable title; Grafana, Sentry, and Datadog payloads have
provider-specific normalization. Webhook credentials are checked at ingestion.
Event keys and fingerprints support duplicate detection and incident merging.

A new incident records its service, event, timeline, and escalation state in the
database. Status progresses through triggered, acknowledged, and resolved.
Workers process due escalation work and resolve current targets. Policy delays
and repeat settings determine future runs; execution timing also depends on
worker polling. A zero delay does not guarantee simultaneous delivery.

Acknowledgement or resolution stops future escalation work. Pending and retrying
notifications are skipped where appropriate. The worker rechecks incident state
before sending. An external request already in flight cannot be recalled; a
successful send completed after acknowledgement or resolution is recorded as
sent_after_ack.

## Background processing and delivery

The worker polls due PostgreSQL state, uses claims and leases for notification
work, and records delivery attempts around provider calls. Retry timing, expired
leases, failures, and dead letters are persisted. Operators can inspect worker
runs, notification attempts, and activity history through authorized endpoints.

Provider adapters support email, Slack, outgoing webhooks, SMS, and phone calls.
The current settings UI exposes Email and Twilio provider configuration; backend
Slack support does not imply a Slack configuration screen. Project email delivery
uses Nodemailer with SMTP settings. Authentication email is sent by the API with
its own deployment SMTP configuration. Twilio handles SMS/phone delivery and
phone verification. Eligible user destinations and channel preferences are
combined with project provider configuration during delivery.

Delivery modes are log (local simulation), auto (configured providers with log
fallback), and live (configuration required). Keep provider request timeouts
below the relevant worker lease. Provider success records a successful provider
request, not a guarantee that a person read or answered the notification.

Workflow events and workflow runs are stored in PostgreSQL and processed by the
worker. Retention also runs in the worker. Installation limits and retention age
are configured through environment variables; resource overrides can expire.
There is no Free/Pro plan API. Quota settings preserve the legacy physical
workspace_entitlements table name while obsolete plan/source columns are removed
by a new migration. Historical migrations remain intact.

## Authentication and authorization

Email/password and optional Google OIDC create server-side cookie sessions.
A browser-selected user or project is not an authorization credential. API
operations validate the session, workspace membership, and the permission for
the requested resource or action. Platform administration requires platform_admin.
Project Operations requires project.manage or platform administrator access.

Secrets and raw provider credentials must not appear in public responses or
logs. Provider credentials use authenticated encryption with the configured
PROVIDER_CREDENTIAL_ENCRYPTION_KEY; API and worker must share that key.
Webhook secrets, OIDC state, and phone verification use separate secret settings.
Trust-boundary validation and permission checks are server responsibilities.

## REST surface

Application routes live under /api/v1. Route families include auth, me,
workspaces, users, teams, services, incidents, webhooks, on-call,
escalation-policies, notifications, activity-logs, audit-logs, workers,
workflows, workflow-runs, and platform. Shared contracts are the source
for request and response types. Interactive API documentation is served at
/api-docs and /openapi.json; the API health endpoint is /health.

## Verification

Vitest covers unit and handler behavior; backend-core also has separately run
DB integration tests. Playwright covers user flows, permissions, and responsive
layouts, primarily with mocked API fixtures. TypeScript and ESLint checks run
across workspace packages through Turborepo. See the README for exact commands.
