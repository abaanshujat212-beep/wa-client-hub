# Security checklist

## Production environment

Required in production:

```env
NODE_ENV=production
SESSION_SECRET=use-a-unique-random-secret-longer-than-32-characters
COOKIE_SECURE=true
```

If `REMOTE_DESKTOP_URL` is configured in production, it must use HTTPS.

## Authentication

Implemented:

- Bcrypt password hashing.
- Session cookies are HTTP-only.
- CSRF token required for mutating authenticated requests.
- Login rate limiting.
- Failed login audit event.
- Server-side role checks for admin/workspace actions.

Still future work:

- Email delivery for invites.
- 2FA for admin accounts.
- Stronger account lockout policy.
- Device/session management screen.

## Remote desktop

- Never expose raw RDP `3389` publicly.
- Use VPN, Cloudflare Access, Guacamole behind HTTPS, or another secured gateway.
- Rotate remote desktop credentials when a client leaves.

## Data handling

- Never commit `.env`, `data/`, `runtime/`, or browser profile backups.
- Browser profiles contain sensitive WhatsApp session data.
- Encrypt backups before storing externally.
