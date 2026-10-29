# PagerWho

Open-source incident response and on-call management for teams.

PagerWho turns monitoring alerts into deduplicated incidents, notifies the
on-call responder, and escalates automatically when nobody responds.

[Try PagerWho Cloud](https://pagerwho.com/) ·
[Read the product documentation](https://pagerwho.com/docs) ·
[Self-host PagerWho](#quick-start)

## Quick start

Run the complete local evaluation stack from the repository root:

```sh
docker compose up --build -d --wait
```

Open [http://localhost:8080](http://localhost:8080) and sign in with:

```text
Email: testuser1@example.com
Password: Password123!
```

The stack includes PostgreSQL, migrations, demo data, the API, worker, and web
application. Its sample project includes a service, on-call rotations, an
escalation policy, and incidents in multiple states. Notifications use log
delivery, so no external provider is contacted.

```sh
docker compose down
```

Data remains in the `postgres-data` Docker volume. Run `docker compose down -v`
only when you intentionally want to remove the local database.

## Features

- Webhook alert ingestion, deduplication, and incident timelines.
- Service ownership and incident acknowledgement and resolution.
- Primary and secondary on-call rotations, previews, and overrides.
- Escalation policies with delays and repeat rules.
- Slack, SMTP email, SMS, and phone notification providers.
- Event-driven workflow automation.
- Project roles, audit logs, and operational diagnostics.

## PagerWho Cloud

Want to evaluate PagerWho without operating infrastructure? Use the hosted
service at [pagerwho.com](https://pagerwho.com/). Product guides are available
in the [PagerWho documentation](https://pagerwho.com/docs).

## Self-hosting and development

The root Compose stack is intended for local evaluation and binds the web app to
`127.0.0.1`. For an internet-facing installation, configure HTTPS, independent
secrets, PostgreSQL, and the notification and authentication integrations you
need.

- [Self-hosting and configuration](docs/self-hosting.md)
- [Production deployment](docs/deployment.md)
- [Local development and checks](docs/development.md)
- [Architecture](docs/architecture.md)
- Self-hosted API documentation: `/api-docs` and `/openapi.json`

## License

PagerWho is available under the [MIT License](LICENSE).
