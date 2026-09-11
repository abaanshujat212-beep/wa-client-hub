ALTER TABLE message_attachments
  ADD COLUMN provider_media_delete_after TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  ADD COLUMN provider_media_deleted_at TIMESTAMPTZ,
  ADD COLUMN provider_media_delete_attempts INTEGER NOT NULL DEFAULT 0 CHECK (provider_media_delete_attempts >= 0),
  ADD COLUMN provider_media_last_error TEXT;

CREATE INDEX idx_message_attachments_media_cleanup
  ON message_attachments(provider_media_delete_after, created_at)
  WHERE provider_media_id IS NOT NULL
    AND provider_media_deleted_at IS NULL
    AND provider_media_delete_attempts < 5;
