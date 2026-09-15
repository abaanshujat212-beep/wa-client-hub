# Meta-only customer onboarding

The customer-facing Workspaces screen now uses Meta Embedded Signup as the primary and visible WhatsApp connection method. Legacy OpenWA code and data remain in the repository, but the runtime/UI feature gate defaults to `OPENWA_ENABLED=false`.

When enabled and correctly configured, the flow is:

`workspace → Connect WhatsApp with Meta → Meta Embedded Signup → verified WABA/phone → official WhatsApp Cloud connection`

The Meta flow derives the phone number and WABA assets from Meta's FINISH payload and preserves the backend WABA/phone ownership verification. Customers are not asked to type a phone number. The normal UI exposes only a safe label, display phone number, provider (`Meta / WhatsApp Cloud`), and connection status; WABA IDs, tokens, and secrets remain server-side.

OpenWA is opt-in only. Normal `docker compose up -d` does not start the `openwa` service because it remains behind the `openwa` Compose profile. The OpenWA API also fails closed unless `OPENWA_ENABLED=true`.

## Owner deployment steps

1. Copy `.env.docker.example` to `.env.docker` and replace all placeholders.
2. Keep `OPENWA_ENABLED=false`.
3. Set `META_SIGNUP_ENABLED=true`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, and `META_EMBEDDED_SIGNUP_CONFIG_ID`.
4. Configure the Meta dashboard JavaScript SDK domain and callback/webhook URLs for the deployed HTTPS origin.
5. Run `Run-WA-Client-Hub.bat`; it repairs retained-volume password drift, migrates, then starts the app.
6. Sign in, open Workspaces, choose a workspace, and click **Connect WhatsApp with Meta**.

## Manual Meta E2E procedure

1. Open the deployed HTTPS dashboard in a normal browser and sign in.
2. Confirm the Workspaces screen loads the Meta panel and does not show Add number, Link account, Open WhatsApp, QR, or Enable automation controls.
3. Select the target workspace and click **Connect WhatsApp with Meta**.
4. Complete Meta Embedded Signup with a test business account.
5. Select the WABA and phone number in Meta; do not type a phone number into WA Client Hub.
6. Verify that Meta sends the FINISH event and the OAuth code, in either order.
7. Confirm the dashboard shows the official connection with label, display phone number, `Meta / WhatsApp Cloud`, and active status.
8. Verify one test send through the canonical Meta route and confirm the Meta webhook delivers an inbound/status event to the same workspace.
9. Repeat once with FINISH before the OAuth code and once with the popup cancelled; confirm the UI resolves cleanly and no duplicate connection is created.
