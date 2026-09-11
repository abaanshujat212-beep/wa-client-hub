CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_numbers_workspace_id ON whatsapp_numbers(workspace_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_workspace_id ON provider_connections(workspace_id,id);

CREATE TABLE ghl_oauth_states (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ghl_oauth_states_expiry ON ghl_oauth_states(expires_at) WHERE used_at IS NULL;

CREATE TABLE ghl_installations (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  company_id TEXT,
  location_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  encrypted_credentials BYTEA NOT NULL,
  encryption_key_id TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','degraded','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installation_id,location_id),
  UNIQUE(location_id)
);
CREATE INDEX idx_ghl_installations_workspace ON ghl_installations(workspace_id);

CREATE TABLE ghl_number_mappings (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES ghl_installations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  whatsapp_number_id TEXT NOT NULL,
  provider_connection_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installation_id,location_id),
  UNIQUE(workspace_id,whatsapp_number_id),
  FOREIGN KEY (workspace_id,whatsapp_number_id) REFERENCES whatsapp_numbers(workspace_id,id),
  FOREIGN KEY (workspace_id,provider_connection_id) REFERENCES provider_connections(workspace_id,id)
);
CREATE INDEX idx_ghl_number_mappings_location ON ghl_number_mappings(location_id);

CREATE TABLE ghl_conversation_links (
  id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL REFERENCES ghl_number_mappings(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL REFERENCES ghl_installations(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ghl_conversation_id TEXT NOT NULL,
  ghl_contact_id TEXT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL,
  provider_connection_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installation_id,location_id,ghl_conversation_id),
  UNIQUE(workspace_id,conversation_id),
  FOREIGN KEY (workspace_id,whatsapp_number_id) REFERENCES whatsapp_numbers(workspace_id,id),
  FOREIGN KEY (workspace_id,provider_connection_id) REFERENCES provider_connections(workspace_id,id)
);

CREATE TABLE ghl_message_correlations (
  id TEXT PRIMARY KEY,
  mapping_id TEXT NOT NULL REFERENCES ghl_number_mappings(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL REFERENCES ghl_installations(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL,
  provider_connection_id TEXT NOT NULL,
  ghl_message_id TEXT NOT NULL,
  ghl_conversation_id TEXT,
  ghl_contact_id TEXT,
  canonical_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  provider_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','read','failed')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(installation_id,location_id,ghl_message_id),
  UNIQUE(workspace_id,provider_connection_id,provider_message_id)
);
CREATE INDEX idx_ghl_correlations_status ON ghl_message_correlations(status,updated_at);
