# PostgreSQL migration plan

Current MVP stores data in `data/store.json`. Production should move to PostgreSQL before paid customers.

## Target tables

- `users`
- `workspaces`
- `workspace_members`
- `whatsapp_numbers`
- `plans`
- `invites`
- `audit_logs`
- `sessions` or external session store

## Selected stack

The project uses `node-postgres` (`pg`) with versioned SQL migrations. The first migration is the canonical schema in `docs/schema.sql`; applied migration checksums are recorded in `schema_migrations` and protected by a PostgreSQL advisory lock.

- Prisma + PostgreSQL
- Drizzle + PostgreSQL
- node-postgres with SQL migrations

JSON remains the local development default during the route/repository transition.

## Migration steps

1. Add `DATABASE_URL` to `.env`. ✅
2. Add PostgreSQL client dependency. ✅
3. Create schema matching current JSON store and canonical event model. ✅
4. Add checksummed migration runner. ✅
5. Add JSON import script: ✅
   - reads `data/store.json`
   - inserts users, workspaces, members, accounts, plans, invites, audit logs
6. Add repository/storage interface: in progress
   - JSON store for local MVP
   - PostgreSQL store for production
7. Update tests to use isolated test database or test store. Integration foundation added; runtime cutover remains.

## Commands

```powershell
npm run db:migrate
npm run db:import-json
```

Import refuses a populated database by default. A deliberate replacement requires `npm run db:import-json -- --replace`. Take and verify a backup before using replacement against any non-test database.

## Data mapping

`accounts` should become `whatsapp_numbers` in SQL, but API can still expose them as accounts until frontend naming is fully migrated.

| JSON field | PostgreSQL table |
| --- | --- |
| users | users |
| workspaces | workspaces |
| workspaceMembers | workspace_members |
| accounts | whatsapp_numbers |
| plans | plans |
| invites | invites |
| audit | audit_logs |

## Production requirements

- automated daily backups
- restore drill before first paid customer
- encrypted backups
- migration rollback plan
- no browser profile data in database

## Environment

```env
DATABASE_URL=postgresql://user:password@host:5432/wa_client_hub
STORE_DRIVER=json
# Switch only after the async API repository cutover is complete:
# STORE_DRIVER=postgres
```
