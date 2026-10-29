# Self-hosting and configuration

For a local evaluation, use the root [`compose.yaml`](../compose.yaml). It starts
PostgreSQL, applies migrations, loads demo data, and starts the application:

```sh
docker compose up --build -d --wait
```

This local stack uses development secrets, log-only notification delivery, and a
loopback web binding. Do not expose it directly to the internet. See
[Production deployment](deployment.md) for an internet-facing installation.

## Core configuration

The API environment example keeps four core values active:

- `DATABASE_URL`
- `WEB_APP_URL`
- `WEBHOOK_SECRET_PEPPER`
- `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`

Generate independent random secrets before deployment. The API and worker must
use the same provider encryption key. Keep existing encryption keys and webhook
peppers stable across restarts because changing them affects stored credentials
or existing webhook authentication.

For HTTPS deployment, set `NODE_ENV=production` and the correct public
`WEB_APP_URL`. Production does not inherit the development-origin allowlist. Use
`CORS_ORIGIN` only for additional trusted browser origins.

## Optional authentication integrations

SMTP, OIDC, and phone verification are optional. Leave unused settings
commented out instead of supplying empty or placeholder credentials.

- Authentication email requires `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASSWORD`.
  Without them, email verification and password-reset messages are not sent.
  Password accounts can still register and sign in.
- OIDC requires the issuer, client ID, client secret, redirect URI, and
  `AUTH_STATE_SECRET`. The redirect URI must match the identity provider's
  registration.
- Phone verification requires `PHONE_VERIFICATION_SECRET` and valid project
  Twilio configuration. Omitting it does not disable email/password login.

Use independent random values of at least 32 characters for optional
authentication and phone secrets.

| Setting | Default behavior |
| --- | --- |
| `PORT` / `HOST` | Port 3000, bind to all interfaces |
| `CORS_ORIGIN` | Local Vite origins in development; `WEB_APP_URL` is also allowed |
| `AUTH_SESSION_TTL_SECONDS` | Sessions last 30 days |
| `AUTH_COOKIE_SECURE` | Secure cookies in production |
| `SMTP_PORT` / `SMTP_SECURE` | Port 587; TLS socket mode for port 465 or `SMTP_SECURE=true` |
| `OIDC_PROVIDER_ID` / `OIDC_PROVIDER_LABEL` | `oidc` / `SSO` |
| `OIDC_SCOPES` | `openid email profile` |
| `OIDC_REQUIRE_VERIFIED_EMAIL` | `true` |
| `OIDC_CLIENT_AUTH_METHOD` | `client_secret_post`; `client_secret_basic` is supported |
| `OIDC_POST_LOGIN_REDIRECT_URL` | `WEB_APP_URL`, then the local frontend fallback |
| `WEBHOOK_PUBLIC_BASE_URL` | Local API URL; set the public API URL for generated webhook URLs |

## Notifications

For local testing, use `NOTIFICATION_DELIVERY_MODE=log`. Delivery is recorded
without contacting external providers. Use `live` for real delivery; missing
provider configuration then produces failures. In `auto` mode, unconfigured
providers can fall back to log delivery.

Configure project Email (SMTP) and Twilio providers through Project settings,
then configure each responder's destinations and channel preferences in User
settings. Verify phone numbers before enabling SMS or phone alerts.

Authentication SMTP is separate from project incident-notification SMTP. The
API and worker must share `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` when storing and
using encrypted provider credentials.

## Installation limits

There are no Free/Pro feature tiers. Configure the same values for the API and
worker, then restart both processes after a change.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PAGERWHO_LIMIT_WORKSPACES` | 0 | Workspaces owned by a user |
| `PAGERWHO_LIMIT_MEMBERS` | 0 | Active members plus pending invites per workspace |
| `PAGERWHO_LIMIT_SERVICES` | 0 | Services per workspace |
| `PAGERWHO_LIMIT_ON_CALL_SCHEDULES` | 0 | Schedules per workspace |
| `PAGERWHO_LIMIT_ESCALATION_POLICIES` | 0 | Policies per workspace |
| `PAGERWHO_RETENTION_DAYS` | 365 | Retention cleanup age |

Count limits accept non-negative safe integers; `0` means unlimited. Retention
accepts 1 through 36500 days. The worker removes old resolved incidents,
notification logs, workflow runs, processed workflow events, and activity logs.
Administrators can apply expiring resource overrides per workspace; expiry
restores the installation default.
