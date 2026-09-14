ALTER TABLE ghl_installations
  ADD COLUMN IF NOT EXISTS installing_ghl_user_id TEXT,
  ADD COLUMN IF NOT EXISTS installing_ghl_role_type TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_activation_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ghl_oauth_states ALTER COLUMN workspace_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS ghl_external_users (
  id TEXT PRIMARY KEY,
  ghl_user_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  company_id TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  role_type TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(location_id, ghl_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ghl_external_users_user ON ghl_external_users(user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_external_users_location ON ghl_external_users(location_id);

CREATE TABLE IF NOT EXISTS ghl_embedded_bootstrap_states (
  id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ghl_embedded_bootstrap_expiry
  ON ghl_embedded_bootstrap_states(expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS password_activation_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_activation_expiry
  ON password_activation_tokens(expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS whatsapp_number_assignments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, whatsapp_number_id)
    REFERENCES whatsapp_numbers(workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_number_assignment_user
  ON whatsapp_number_assignments(workspace_id, user_id) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_number_assignment_number_user
  ON whatsapp_number_assignments(workspace_id, whatsapp_number_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_number_assignments_workspace_number
  ON whatsapp_number_assignments(workspace_id, whatsapp_number_id) WHERE removed_at IS NULL;
