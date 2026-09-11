ALTER TABLE message_attachments
  ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN provider_media_id TEXT;

CREATE UNIQUE INDEX uq_message_attachment_message_provider_media
  ON message_attachments(message_id, provider_media_id)
  WHERE provider_media_id IS NOT NULL;
