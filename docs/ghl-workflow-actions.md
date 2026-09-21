# 10x WA workflow actions

Implemented: three authenticated actions, with existing canonical consent, suppression, approval, session-window and idempotency checks. These are synchronous sends, not a new bulk queue. Use GHL workflow enrollment/drip pacing for campaigns. Marketplace configurations are saved through the official CLI. Real workflow enrollment and callback delivery still require end-to-end verification.

## Verification — 2026-09-21

Live CLI reads confirm all three actions and both triggers are published, active version 1.0. Local action files still show draft status; use the remote status as authoritative. Docker app, PostgreSQL and Redis are healthy. Ten targeted action/trigger tests pass. All three public endpoints reject requests without credentials with HTTP 401.

The running database has zero workflow subscriptions and zero deliveries. Actual GHL workflow enrollment and callback delivery remain unverified. An authenticated public dry run was not executed because automatic approval review blocked transmitting database-derived contact data and the app credential without specific approval. No WhatsApp message was sent during verification.

## Shared settings

- API, POST: `https://wa.10xcollab.com/webhooks/ghl/workflow-action`
- Body: Default (GHL supplies `data`, `extras.locationId`, `extras.contactId`, `extras.workflowId`, `meta.key`).
- Branches OFF. Pause execution OFF.
- Header `Content-Type`: `application/json`.
- Header `x-tenx-workflow-key`: developer-controlled app credential configured by CLI for installed locations. Never use the Meta token.
- While signed into the main app as administrator, open `/api/ghl/workflow-config?locationId=XATuRqXAuNpHyAST9U1b`. Copy `value` into the header. This credential can send for this location; keep it private. Reinstallation/location removal disables sends. To rotate all workflow credentials, set a new server-only `GHL_WORKFLOW_SECRET` and reconfigure each header.
- A workflow cannot choose a different contact's phone or another location's sender.

Common fields on ALL three actions:

| Name | Type | Required | Reference | Default / help |
|---|---|---|---|---|
| From WhatsApp Number | String | Yes | from_number | Blank; connected number including +country code |
| Recipient Phone | String | Yes | recipient_phone | Use GHL picker: Contact → Phone; international format |
| Request ID | String | Yes | request_id | Stable business event ID, unique per intended send, e.g. order ID + reminder stage or campaign ID + step. Same on retries. Contact and workflow are added by server. Never a new random value on retry. |
| Dry Run | Toggle | No | dry_run | True during setup; false for actual sends |

If using the same action twice in one workflow, give each step a distinct Request ID suffix. A repeat enrollment for a new intended message must use a new event ID. No assumed undocumented GHL execution variable is required. Dry run validates syntax, authentication and contact/number binding; it does not claim Meta delivery or full send-policy eligibility.

Phone fields: Valid Phone Number validation; help `Use country code, with no spaces or dashes.` Alters dynamic field OFF for these static fields.

## Send Template

Name: `10x WA — Send Template`

Key: `tenx_wa_send_template`

Short description: `Send an approved WhatsApp template to a workflow contact.`

Summary: `Select a connected number, enter the approved template name and language, and map body variables to contact fields. Messages use the existing WhatsApp consent and suppression checks and sync to GHL.`

| Name | Type | Required | Reference | Default / help |
|---|---|---|---|---|
| Template Name | String | Yes | template_name | Exact approved Meta template name |
| Template Language | String | Yes | template_language | en_US; change to the template's actual language |
| Variable 1 | String | No | variable_1 | Value for body {{1}} |
| Variable 2 | String | No | variable_2 | Value for body {{2}} |
| Variable 3 | String | No | variable_3 | Value for body {{3}} |

Sender, approved template and language use dynamic dropdowns from `/webhooks/ghl/workflow-fields`. Selecting a template loads its named or positional body variables (up to 20). The three variable rows above are illustrative; the live UI generates the required fields. Do not leave gaps. Media headers, carousel components and dynamic buttons are excluded.

## Send Message

Name: `10x WA — Send Message`

Key: `tenx_wa_send_message`

Short description: `Send a WhatsApp text reply within an eligible conversation window.`

Summary: `Send personalized text to the workflow contact using a connected WhatsApp number. The app checks the customer service window, consent and suppression before sending.`

Additional field: Name `Message`, Type `Textarea`, Required Yes, Reference `message`, Default blank, Help `Enter your reply or map GHL contact fields.`

## Send Media

Name: `10x WA — Send Media`

Key: `tenx_wa_send_media`

Short description: `Send uploaded WhatsApp media within an eligible conversation window.`

Summary: `Send an image, audio, video or document using its uploaded Meta Media ID. The app applies conversation-window, consent and suppression checks.`

| Name | Type | Required | Reference | Options / help |
|---|---|---|---|---|
| Media Type | Select, Constants | Yes | media_type | Image=image; Audio=audio; Video=video; Document=document |
| Meta Media ID | String | Yes | media_id | ID returned by a Meta upload for the connected account; NOT a file URL |
| Caption | Textarea | No | caption | Optional image/video/document caption; leave blank for audio |
| File Name | String | No | filename | Optional document filename, e.g. invoice.pdf |

Arbitrary URL downloading/uploading is not supported by this action. Existing app Meta media upload can supply the ID.

## Response data and custom variables

Use this illustrative schema, then replace it with the actual successful test response:

```json
{"success":true,"status":"validated","message_id":null,"duplicate":false,"error_code":null}
```

Custom variables: Success → success; Status → status; Message ID → message_id; Duplicate → duplicate; Error Code → error_code. Select references using the GHL response picker. `validated` is dry-run only; `sent`/`accepted` is NOT proof of delivery/read. Failures use non-2xx HTTP with `success:false` and a stable error code.

Test using the installed location and an actual contact from that location, with Dry Run ON. The default payload must include contactId and workflowId; an incomplete Marketplace test payload is rejected. Run an enrolled test workflow if the test panel cannot supply them. Live testing sends real messages, so explicitly choose the recipient/content first. Do not submit for review until that test is verified.

## Triggers

Implemented names are `10x WA — Message Received` / `tenx_wa_message_received` and `10x WA — Message Status Updated` / `tenx_wa_message_status_updated`. The authenticated `/webhooks/ghl/workflow-subscription` endpoint handles CREATED, UPDATED and DELETED. Database migration 030 captures new incoming messages and outbound sent/delivered/read/failed transitions into a durable delivery outbox. Filters select sender and status. Events wait for the mapped GHL contact. Imported historical inserts are excluded; duplicate statuses are deduplicated. HTTP 429 retries after five minutes. Ambiguous network/5xx responses are marked uncertain for reconciliation rather than blindly firing workflows twice. Both trigger version 1.0 configurations are published. No real workflow subscription has been received yet; real callback delivery remains unverified.

Reference: https://marketplace.gohighlevel.com/docs/marketplace-modules/CustomActions/index.html

