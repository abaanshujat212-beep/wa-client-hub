ALTER TABLE provider_connections
  ADD CONSTRAINT uq_provider_connection_workspace UNIQUE (id, workspace_id);

CREATE TABLE meta_connection_assets (
  provider_connection_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  business_portfolio_id TEXT,
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  verified_name TEXT,
  token_type TEXT NOT NULL DEFAULT 'business' CHECK (token_type IN ('business','system_user','unknown')),
  token_expires_at TIMESTAMPTZ,
  token_status TEXT NOT NULL DEFAULT 'unverified' CHECK (token_status IN ('unverified','valid','expiring','expired','invalid','revoked')),
  webhook_subscribed BOOLEAN NOT NULL DEFAULT false,
  account_status TEXT NOT NULL DEFAULT 'unknown',
  quality_rating TEXT,
  last_diagnostics_at TIMESTAMPTZ,
  last_diagnostics_code TEXT,
  credential_rotated_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_meta_asset_connection_workspace
    FOREIGN KEY (provider_connection_id, workspace_id)
    REFERENCES provider_connections(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT ck_meta_asset_public_ids CHECK (
    waba_id ~ '^[0-9]+$' AND phone_number_id ~ '^[0-9]+$'
    AND (business_portfolio_id IS NULL OR business_portfolio_id ~ '^[0-9]+$')
  )
);

CREATE UNIQUE INDEX uq_meta_asset_phone_number_id
  ON meta_connection_assets(phone_number_id);
CREATE INDEX idx_meta_assets_workspace
  ON meta_connection_assets(workspace_id, updated_at DESC);
CREATE UNIQUE INDEX uq_number_provider_connection
  ON whatsapp_numbers(provider_connection_id)
  WHERE provider_connection_id IS NOT NULL;

INSERT INTO meta_connection_assets (
  provider_connection_id, workspace_id, waba_id, phone_number_id,
  display_phone_number, token_status, created_at, updated_at
)
SELECT id, workspace_id, settings->>'businessAccountId', settings->>'phoneNumberId',
       NULL, 'unverified', created_at, updated_at
FROM provider_connections
WHERE provider='whatsapp_cloud'
  AND COALESCE(settings->>'businessAccountId','') ~ '^[0-9]+$'
  AND COALESCE(settings->>'phoneNumberId','') ~ '^[0-9]+$'
ON CONFLICT (provider_connection_id) DO NOTHING;
