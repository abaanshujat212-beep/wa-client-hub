# M4 safe campaigns and bulk messaging

M4 adds a consent-first campaign engine on PostgreSQL, Redis, and the internal OpenWA adapter.

## Safety gates

- CSV imports require `phone`, `consent_source`, `policy_version`, and `consent_captured_at` on every row.
- Phone numbers are normalized and duplicate recipients are removed per campaign.
- Global and workspace suppressions are checked during import and again immediately before send.
- The latest WhatsApp consent record must be granted and unexpired immediately before send.
- Exact inbound opt-out keywords (`STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`) create a workspace suppression during verified webhook processing.
- Pause/cancel state is checked after a worker claim and before OpenWA is called.
- Quiet hours use UTC and defer sends.
- Redis atomic counters enforce both workspace and WhatsApp-number limits across concurrent workers.
- Failed sends use bounded exponential retry and then enter `dead_letter`.
- Every import, claim, retry, block, send, cancellation, and provider delivery transition is stored in `campaign_recipient_events`.

## CSV example

```csv
phone,name,consent_source,policy_version,consent_captured_at,consent_evidence
+923001112222,Ada,checkout-checkbox,v2,2026-09-01T10:00:00Z,order-123
```

## Runtime settings

- `CAMPAIGN_WORKSPACE_PER_MINUTE` defaults to `20`.
- `CAMPAIGN_NUMBER_PER_MINUTE` defaults to `10`.
- PostgreSQL stores the durable queue and audit ledger; Redis provides shared atomic rate gates.

Actual sends still require a live, automation-enabled OpenWA number. Use dedicated opted-in test recipients during pilot validation.
