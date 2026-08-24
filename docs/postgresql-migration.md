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

## Suggested stack

Use one of:

- Prisma + PostgreSQL
- Drizzle + PostgreSQL
- node-postgres with SQL migrations

Recommended first implementation: **Prisma**, because schema/migrations are easier to maintain.

## Migration steps

1. Add `DATABASE_URL` to `.env`.
2. Add PostgreSQL client/ORM dependency.
3. Create schema matching current JSON store.
4. Add migration scripts.
5. Add JSON import script:
   - reads `data/store.json`
   - inserts users, workspaces, members, accounts, plans, invites, audit logs
6. Add repository/storage interface:
   - JSON store for local MVP
   - PostgreSQL store for production
7. Update tests to use isolated test database or test store.

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
# future: STORE_DRIVER=postgres
```
