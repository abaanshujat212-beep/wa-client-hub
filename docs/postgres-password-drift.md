# Local PostgreSQL password drift recovery

Docker's official PostgreSQL image initializes `POSTGRES_USER` and `POSTGRES_PASSWORD` only when the data directory is first created. A retained `postgres_data` volume can therefore contain the old `wa_hub` role password while `.env.docker` contains a newer password. The result is the recurring `password authentication failed for user "wa_hub"` migration failure.

WA Client Hub now repairs this safely during the normal Windows Docker startup path:

1. Start only PostgreSQL and Redis and wait for their health checks.
2. Resolve the running PostgreSQL container locally with Docker Compose.
3. Execute `psql` inside that container as the local `postgres` OS user over the Unix socket.
4. Verify that the target role and database are the expected local `wa_hub` values.
5. Run `ALTER ROLE "wa_hub" PASSWORD ...` with the configured password supplied through stdin; the password is not printed or logged.
6. Run migrations, then start the app.

The helper is `scripts/sync-postgres-role-password.ps1`. It refuses placeholders, unexpected role/database identifiers, missing containers, and unexpected PostgreSQL targets. It never runs `docker compose down -v`, removes a volume, truncates data, or recreates the cluster.

The Compose app now receives PostgreSQL as discrete host/port/database/user/password fields instead of interpolating the password into `DATABASE_URL`. This avoids failures when a password contains `@`, `#`, `?`, `/`, or other URI-reserved characters. `DATABASE_URL` remains supported for external deployments when discrete fields are not supplied.

Run the normal launcher; do not manually alter the database role:

```powershell
.\Run-WA-Client-Hub.bat
```
