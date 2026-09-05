CREATE UNIQUE INDEX IF NOT EXISTS uq_openwa_external_session
  ON whatsapp_numbers(external_session_id)
  WHERE external_session_id IS NOT NULL AND automation_enabled = true;

CREATE INDEX IF NOT EXISTS idx_webhook_receipts_connection_status
  ON webhook_receipts(provider_connection_id, status, received_at);
