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

The project uses `node-postgres` (`pg`) with versioned SQL migrations. The first migration is the canonical schema in `docs/schema.sql`; applied migration checksums are recorded in `schema_migrations` and protected by a PostgreSQL advisory lock. JSON remains the zero-dependency local development default; production selects PostgreSQL with `STORE_DRIVER=postgres`.

PostgreSQL runtime mutations are serialized, applied transactionally, and rolled back in memory if persistence fails. Existing normalized conversation/message/call data is preserved when legacy workspace data changes. Run one application writer replica during this transitional repository implementation; horizontal multi-writer scaling will move each mutation to targeted SQL transactions in the control-plane phase.

## Migration steps

1. Add `DATABASE_URL` to `.env`. ✅
2. Add PostgreSQL client dependency. ✅
3. Create schema matching current JSON store and canonical event model. ✅
4. Add checksummed migration runner. ✅
5. Add JSON import script: ✅
   - reads `data/store.json`
   - inserts users, workspaces, members, accounts, plans, invites, audit logs
6. Add repository/storage interface: ✅
   - JSON store for local MVP
   - PostgreSQL store for production
7. Update tests to use isolated test database or test store. ✅
8. Wire server startup and durable sessions to PostgreSQL. ✅
9. Add JSON rollback export plus native backup/restore commands. ✅

## Commands

```powershell
npm run db:migrate
npm run db:import-json
npm run db:export-json
```

Import refuses a populated database by default. A deliberate replacement requires `npm run db:import-json -- --replace`. Take and verify a backup before using replacement against any non-test database.

Native PostgreSQL backups and restores are available through `scripts/backup-postgres.ps1` and `scripts/restore-postgres.ps1`. Restore requires the explicit `-ConfirmRestore` switch. Test restores against a separate database before any production cutover.

When PostgreSQL is selected, Express sessions use the `user_sessions` table through `connect-pg-simple`. Application shutdown drains HTTP connections and closes the database pool.

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
STORE_DRIVER=postgres
```
