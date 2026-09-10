# Docker control plane

The Compose stack runs the dashboard/API, a one-shot database migration, PostgreSQL 16, and persistent Redis. PostgreSQL and Redis use an internal Docker network and publish no host ports. The application binds to `127.0.0.1:3131` by default.

The Windows browser/calling engine remains outside this stack. Docker does not attempt to launch WhatsApp Web locally. The container has only an ephemeral, non-executable runtime directory so legacy launcher status checks can initialize without persistent browser-profile storage.

## Development start

1. Copy `.env.docker.example` to `.env.docker`.
2. Replace all `change-me` values, including the base64-encoded 32-byte `CONNECTOR_MASTER_KEY`.
3. Validate and start the stack:

```sh
docker compose --env-file .env.docker config
docker compose --env-file .env.docker up --build -d --wait
```

Check readiness at `http://127.0.0.1:3131/api/ready`:

```sh
curl -fsS http://127.0.0.1:3131/api/ready
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f app
```

Stop without deleting data:

```sh
docker compose --env-file .env.docker down
```

The migration container must finish successfully and Redis must be healthy before the application starts.

## macOS and Apple Silicon

Docker Desktop with Compose v2 is supported for the control plane. The Node 22 Bookworm, PostgreSQL 16, and Redis 7 images used by the stack have normal arm64 support, and the application has no native Node add-ons. OpenWA is an optional browser-automation profile with separate architecture limitations documented in `docs/openwa-adapter.md`.

Guacamole is not required for Mac backend development. It is an optional browser gateway to a separate Windows RDP host for the legacy calling workflow.

## Data persistence and recovery

`postgres_data` stores canonical application data. `redis_data` uses append-only persistence. Normal `docker compose down`, image rebuilds, and container recreation retain named volumes. Do not run `docker compose down --volumes` where data must be retained.

The included backup and restore PowerShell scripts remain Windows operator helpers. On macOS, use PostgreSQL tools or Docker without changing Windows behavior, for example:

```sh
mkdir -p backups
docker compose --env-file .env.docker exec -T postgres \
  pg_dump -U "$(grep '^POSTGRES_USER=' .env.docker | cut -d= -f2-)" \
  "$(grep '^POSTGRES_DB=' .env.docker | cut -d= -f2-)" \
  > "backups/wa-hub-$(date +%Y%m%d-%H%M%S).sql"
```

## Production configuration

```sh
docker compose --env-file .env.production -f compose.yml -f compose.production.yml up -d --wait --no-build
```

Production requires `COOKIE_SECURE=true`, unique secrets, strong passwords, and HTTPS. Never publish ports 5432 or 6379, the Docker socket, RDP, or administrative interfaces.

## Operations

- Liveness: `/api/health`
- Readiness: `/api/ready`
- Inspect resolved configuration: `docker compose --env-file .env.docker config`
- Recreate app only: `docker compose --env-file .env.docker up -d --force-recreate app`
