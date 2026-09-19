CREATE TABLE IF NOT EXISTS ghl_agency_installations (
  company_id TEXT PRIMARY KEY,
  encrypted_credentials BYTEA NOT NULL,
  encryption_key_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
