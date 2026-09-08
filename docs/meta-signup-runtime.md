# Main-server Meta signup integration — #24 / #32 / #31

`src/main.js` is now the package start/dev entrypoint. It imports the existing server without triggering standalone startup, appends the protected POST router at `/api/meta/signup`, then starts the existing application. `META_SIGNUP_ENABLED=false` remains the documented default. Only the exact string `true` enables it; disabled mode does not access PostgreSQL, Meta, the vault or timers.

Enabled startup fails before listening unless storage is PostgreSQL, `APP_ORIGIN` is one exact HTTPS origin, Graph version is explicit, app ID/secret pass format sanity checks, the existing vault accepts the 32-byte server key and cleanup interval is bounded. No secret is held by frontend/mobile or logged by cleanup.

After successful startup, the runtime performs one bounded cleanup and schedules later passes. Starts/stops are idempotent, the timer is unreferenced, and shutdown clears it before closing HTTP/dependencies/storage. Success logs counts only; failures use a fixed message and timestamp-only in-process status. The status is not exposed publicly in this slice. Existing readiness behavior is unchanged.

The existing global JSON parser precedes this late composition. A narrow post-router error boundary converts only signup parser failures to fixed 400/413 JSON while forwarding unrelated errors to existing handling. The legacy GET fallback cannot consume these POST routes.

Before setting the switch: complete owner Meta app/Embedded Signup v4 setup, live test-assets E2E, deployment proxy/session/cookie review, secret rotation, cleanup monitoring and lifecycle/activation work. This does not merge/deploy/enable the PR or activate connections. #51 still gates #55.
