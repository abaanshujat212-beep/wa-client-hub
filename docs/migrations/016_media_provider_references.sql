ALTER TABLE message_attachments
  ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN provider_media_id TEXT;

CREATE UNIQUE INDEX uq_message_attachment_provider_media
  ON message_attachments(provider_connection_id, provider_media_id)
  WHERE provider_connection_id IS NOT NULL AND provider_media_id IS NOT NULL;
