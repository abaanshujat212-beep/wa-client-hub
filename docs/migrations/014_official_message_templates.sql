CREATE TABLE whatsapp_message_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
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
  UNIQUE(provider_connection_id,name,language)
);
CREATE INDEX idx_whatsapp_templates_workspace ON whatsapp_message_templates(workspace_id,provider,status,name);
