CREATE TABLE whatsapp_message_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp_cloud','ycloud')),
  official_template_id TEXT,
  waba_id TEXT,
  name TEXT NOT NULL CHECK (name ~ '^[a-z0-9_]{1,512}$'),
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  category TEXT NOT NULL CHECK (category IN ('AUTHENTICATION','MARKETING','UTILITY')),
  status TEXT NOT NULL CHECK (status IN ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED','ARCHIVED')),
  parameter_format TEXT NOT NULL DEFAULT 'POSITIONAL' CHECK (parameter_format IN ('POSITIONAL','NAMED')),
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_connection_id,whatsapp_number_id,name,language)
);

CREATE FUNCTION enforce_official_template_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM provider_connections p
    JOIN whatsapp_numbers n
      ON n.provider_connection_id = p.id
     AND n.workspace_id = p.workspace_id
    WHERE p.id = NEW.provider_connection_id
      AND p.workspace_id = NEW.workspace_id
      AND p.provider = NEW.provider
      AND p.provider IN ('whatsapp_cloud','ycloud')
      AND n.id = NEW.whatsapp_number_id
      AND n.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'Invalid official template workspace, provider connection, provider and number binding';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_official_template_binding
BEFORE INSERT OR UPDATE ON whatsapp_message_templates
FOR EACH ROW EXECUTE FUNCTION enforce_official_template_binding();

CREATE INDEX idx_whatsapp_templates_workspace ON whatsapp_message_templates(workspace_id,provider,status,name);
CREATE INDEX idx_whatsapp_templates_exact ON whatsapp_message_templates(workspace_id,provider_connection_id,whatsapp_number_id,status);
