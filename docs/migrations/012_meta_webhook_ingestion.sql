ALTER TABLE webhook_receipts ADD COLUMN next_attempt_at TIMESTAMPTZ;
ALTER TABLE webhook_receipts ADD COLUMN last_attempt_at TIMESTAMPTZ;
UPDATE webhook_receipts SET next_attempt_at=received_at WHERE next_attempt_at IS NULL;
ALTER TABLE webhook_receipts ALTER COLUMN next_attempt_at SET DEFAULT now();
ALTER TABLE webhook_receipts ALTER COLUMN next_attempt_at SET NOT NULL;
CREATE INDEX idx_meta_webhook_retry ON webhook_receipts(status,next_attempt_at,received_at) WHERE source='meta_whatsapp';
CREATE UNIQUE INDEX uq_message_status_external_event ON message_status_events(message_id,external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX idx_meta_asset_webhook_lookup ON meta_connection_assets(waba_id,phone_number_id,workspace_id) WHERE disconnected_at IS NULL;
