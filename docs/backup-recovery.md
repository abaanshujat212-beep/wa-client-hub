# Backup and disaster recovery

## What to back up

Required:

- Production database.
- `.env` secrets, stored securely outside Git.
- Deployment configuration.
- Guacamole/RDP connection configuration.

Optional / sensitive:

- Browser profiles in `runtime/chrome-profiles/`.

Browser profiles may contain WhatsApp session data. Only back them up if needed, and always encrypt them.

## What never goes to Git

Never commit:

- `.env`
- `data/`
- `runtime/`
- browser profiles
- backup archives
- logs with tokens or passwords

## Local MVP backup

For current JSON-store MVP:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path ".backups" | Out-Null
Compress-Archive -Path "data" -DestinationPath ".backups/data-$stamp.zip"
```

Store the zip somewhere secure. Do not commit `.backups/`.

## Restore local MVP backup

1. Stop app:

```powershell
pm2 stop wa-client-hub
```

2. Restore data folder:

```powershell
Remove-Item -Recurse -Force data
Expand-Archive .backups/data-YYYYMMDD-HHMMSS.zip -DestinationPath .
```

3. Start app:

```powershell
pm2 start ecosystem.config.cjs
```

## Production database backup

Recommended target after PostgreSQL migration:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M%S).sql
```

Encrypt before storing externally:

```bash
gpg -c backup-YYYYMMDD-HHMMSS.sql
```

## Restore drill

Run a restore test at least once before taking paid customers:

1. Create test server/database.
2. Restore latest backup.
3. Confirm admin login works.
4. Confirm workspaces, users, numbers, plans, and audit logs appear.
5. Confirm WhatsApp profile strategy is documented.

## Recovery priority

1. Bring dashboard online.
2. Restore database.
3. Reconnect/restore Remote Desktop access.
4. Re-link WhatsApp sessions if browser profiles were not restored.
5. Notify affected clients.
