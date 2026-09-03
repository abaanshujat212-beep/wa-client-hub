# Messaging safety and consent policy

This policy is enforced by the control plane for every campaign and automated send, regardless of provider.

## Required checks before enqueue

1. Workspace and WhatsApp number are active and automation-enabled.
2. Contact has current, recorded consent for the requested purpose/channel.
3. Contact is absent from global and workspace suppression lists.
4. Message falls outside configured quiet hours for the contact's timezone, unless it is a permitted transactional exception.
5. Workspace, number, campaign, and contact frequency limits allow the send.
6. The same campaign/contact message has not already been accepted.

All checks run again immediately before provider dispatch. A queued job is not authorization to send later if consent or status changes.

## Consent evidence

Store purpose, source, capture time, expiry when applicable, actor, policy version, and supporting reference. Revocation takes effect immediately for new dispatches. Historical evidence remains auditable according to retention policy.

## Suppression and opt-out

- Opt-out keywords are normalized per configured language and channel.
- A detected opt-out creates a suppression entry and cancels pending promotional sends.
- Transactional exceptions must be explicitly classified and cannot be used for marketing.
- Administrators can pause a campaign, a number, a workspace, or all automation.

## Rate and failure controls

- Apply independent per-number, per-workspace, and per-campaign limits.
- Add jitter and bounded retries; never retry permanent recipient/provider failures.
- Automatically pause on abnormal failure, block, logout, or complaint signals.
- Cold-contact scraping, purchased-list blasting, and enforcement evasion are prohibited product features.
