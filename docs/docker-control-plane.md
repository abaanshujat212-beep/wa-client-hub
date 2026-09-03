# Docker control plane

The Compose stack runs the dashboard/API, a one-shot database migration, PostgreSQL 16, and persistent Redis. PostgreSQL and Redis use an internal Docker network and publish no host ports. The application binds to `127.0.0.1:3131` by default so a TLS reverse proxy can be the only public entry point.

The Windows browser/calling engine remains outside this stack. Docker does not attempt to launch WhatsApp Web locally; the secure Windows worker protocol is the next M1 issue.
The container has only an ephemeral, non-executable runtime directory so legacy launcher status checks can initialize without granting persistent browser-profile storage to the control plane.

## Development start

1. Copy `.env.docker.example` to `.env.docker`.
2. Replace all `change-me` values. Do not commit `.env.docker`.
3. Start and build the stack:

```powershell
docker compose --env-file .env.docker up --build -d --wait
```

Check readiness at `http://127.0.0.1:3131/api/ready`. A ready response reports both `database` and `redis` as `up`. View logs with `docker compose --env-file .env.docker logs -f app` and stop without deleting data with `docker compose --env-file .env.docker down`.

The migration container must finish successfully and Redis must be healthy before the application starts. The application then connects to Redis and PostgreSQL before opening its HTTP listener.

## Data persistence and recovery

`postgres_data` stores canonical application data. `redis_data` uses append-only persistence for queues and ephemeral coordination state. Normal `docker compose down`, image rebuilds, and container recreation retain both named volumes.

Do not run `docker compose down --volumes` in an environment whose data must be retained. PostgreSQL volume persistence is not a backup: use `scripts/backup-postgres.ps1` and copy encrypted backups off-host. Redis is not the canonical source of business records and can be rebuilt after a disaster.

## Production configuration

Build, scan, and publish an immutable image, set `APP_IMAGE` in the production environment file, and run:

```powershell
docker compose --env-file .env.production -f compose.yml -f compose.production.yml up -d --wait --no-build
```

Production requires `COOKIE_SECURE=true`, a unique session secret of at least 32 characters, strong database/admin passwords, and HTTPS at the reverse proxy. The production override keeps the app bound to loopback. Never publish ports 5432 or 6379, the Docker socket, RDP, or an administrative interface.

Run exactly one `app` replica during the transitional PostgreSQL repository implementation. The migration job is concurrency-safe, but application mutations are intentionally single-writer until targeted SQL transactions replace legacy-state synchronization.

## Operations

- Liveness: `/api/health` proves the HTTP process is responsive.
- Readiness: `/api/ready` checks PostgreSQL and Redis and returns HTTP 503 if either is unavailable.
- Inspect resolved configuration before deployment: `docker compose --env-file .env.docker config`.
- Restart application containers without touching data: `docker compose --env-file .env.docker up -d --force-recreate app`.
- Roll back the image by changing `APP_IMAGE` to the previous immutable tag and re-running the production command. Database rollback/export procedures are in `docs/postgresql-migration.md`.
