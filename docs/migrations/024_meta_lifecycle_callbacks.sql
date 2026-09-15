ALTER TABLE meta_connection_assets
  ADD COLUMN IF NOT EXISTS meta_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_meta_assets_meta_user
  ON meta_connection_assets(meta_user_id)
  WHERE meta_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS meta_lifecycle_requests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('data_deletion')),
  meta_user_id TEXT NOT NULL,
  confirmation_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_meta_lifecycle_user
  ON meta_lifecycle_requests(meta_user_id, created_at DESC);
