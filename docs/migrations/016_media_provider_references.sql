ALTER TABLE message_attachments
  ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL,
  ADD COLUMN provider_media_id TEXT;
