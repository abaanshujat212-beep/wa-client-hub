ALTER TABLE provider_connections
  ADD CONSTRAINT uq_provider_connections_exact_binding
  UNIQUE (id, workspace_id, provider);

ALTER TABLE whatsapp_numbers
  ADD CONSTRAINT uq_whatsapp_numbers_exact_binding
  UNIQUE (id, workspace_id, provider_connection_id);

CREATE TABLE whatsapp_message_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL,
  whatsapp_number_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp_cloud','ycloud')),
  official_template_id TEXT,
  waba_id TEXT,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 512 AND name ~ '^[a-z0-9_]+$'),
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  category TEXT NOT NULL CHECK (category IN ('AUTHENTICATION','MARKETING','UTILITY')),
  status TEXT NOT NULL CHECK (status IN ('APPROVED','PENDING','REJECTED','PAUSED','DISABLED','ARCHIVED')),
  parameter_format TEXT NOT NULL DEFAULT 'POSITIONAL' CHECK (parameter_format IN ('POSITIONAL','NAMED')),
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_template_provider_binding
    FOREIGN KEY (provider_connection_id, workspace_id, provider)
    REFERENCES provider_connections(id, workspace_id, provider)
    ON DELETE CASCADE,
  CONSTRAINT fk_template_number_binding
    FOREIGN KEY (whatsapp_number_id, workspace_id, provider_connection_id)
    REFERENCES whatsapp_numbers(id, workspace_id, provider_connection_id)
    ON DELETE CASCADE,
  UNIQUE(provider_connection_id,whatsapp_number_id,name,language)
);

CREATE INDEX idx_whatsapp_templates_workspace ON whatsapp_message_templates(workspace_id,provider,status,name);
CREATE INDEX idx_whatsapp_templates_exact ON whatsapp_message_templates(workspace_id,provider_connection_id,whatsapp_number_id,status);
