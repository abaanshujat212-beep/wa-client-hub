CREATE TABLE IF NOT EXISTS ghl_marketplace_install_events (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL UNIQUE,
  app_id TEXT,
  version_id TEXT,
  install_type TEXT,
  event_type TEXT NOT NULL CHECK (event_type = 'INSTALL'),
  company_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ghl_marketplace_install_match
  ON ghl_marketplace_install_events(company_id, location_id, user_id, received_at)
  WHERE consumed_at IS NULL;
