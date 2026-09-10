ALTER TABLE provider_connections DROP CONSTRAINT provider_connections_provider_check;
ALTER TABLE provider_connections ADD CONSTRAINT provider_connections_provider_check CHECK (provider IN ('openwa','whatsapp_cloud','ycloud'));

CREATE TABLE ycloud_connection_assets (
  provider_connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL UNIQUE REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  business_phone_e164 TEXT NOT NULL CHECK (business_phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
  waba_id TEXT,
  channel_id TEXT,
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown','healthy','degraded','disabled')),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,business_phone_e164)
);
CREATE UNIQUE INDEX uq_ycloud_channel_id ON ycloud_connection_assets(channel_id) WHERE channel_id IS NOT NULL;
CREATE INDEX idx_ycloud_asset_exact ON ycloud_connection_assets(workspace_id,provider_connection_id,whatsapp_number_id);

CREATE FUNCTION enforce_ycloud_asset_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM provider_connections p JOIN whatsapp_numbers n ON n.provider_connection_id=p.id WHERE p.id=NEW.provider_connection_id AND p.workspace_id=NEW.workspace_id AND p.provider='ycloud' AND n.id=NEW.whatsapp_number_id AND n.workspace_id=NEW.workspace_id) THEN
    RAISE EXCEPTION 'Invalid YCloud workspace, connection and number binding';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ycloud_asset_binding BEFORE INSERT OR UPDATE ON ycloud_connection_assets FOR EACH ROW EXECUTE FUNCTION enforce_ycloud_asset_binding();
