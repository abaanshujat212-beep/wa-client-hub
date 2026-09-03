-- PostgreSQL target schema draft for WA Client Hub

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_limit INTEGER NOT NULL,
  number_limit INTEGER NOT NULL,
  user_limit INTEGER NOT NULL,
  custom BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE whatsapp_numbers (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_launched_at TIMESTAMPTZ
);

CREATE TABLE provider_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openwa', 'whatsapp_cloud')),
  label TEXT NOT NULL,
  encrypted_credentials BYTEA,
  encryption_key_id TEXT,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'connecting', 'active', 'degraded', 'offline')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_numbers
  ADD COLUMN provider_connection_id TEXT REFERENCES provider_connections(id),
  ADD COLUMN external_session_id TEXT,
  ADD COLUMN automation_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX uq_number_provider_session
  ON whatsapp_numbers(provider_connection_id, external_session_id)
  WHERE external_session_id IS NOT NULL;

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name TEXT,
  phone_e164 TEXT NOT NULL,
  email TEXT,
  timezone TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, phone_e164)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  assigned_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, whatsapp_number_id, contact_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  provider_connection_id TEXT REFERENCES provider_connections(id),
  external_message_id TEXT,
  client_idempotency_key TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  origin TEXT NOT NULL CHECK (origin IN ('contact', 'phone', 'browser', 'api', 'campaign', 'crm', 'system')),
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'reaction', 'other')),
  body TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('queued', 'accepted', 'sent', 'delivered', 'read', 'received', 'failed')),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciliation_confidence TEXT NOT NULL DEFAULT 'exact' CHECK (reconciliation_confidence IN ('exact', 'inferred', 'unknown')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX uq_message_external
  ON messages(provider_connection_id, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE UNIQUE INDEX uq_message_client_key
  ON messages(workspace_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE TABLE message_attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  storage_key TEXT,
  external_url TEXT,
  file_name TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_features (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('openwa', 'automation', 'campaigns', 'unified_inbox', 'manual_browser', 'crm_shopify', 'crm_ghl', 'crm_woocommerce', 'crm_generic')),
  enabled BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, feature)
);

CREATE TABLE message_status_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  external_event_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE call_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  provider_connection_id TEXT REFERENCES provider_connections(id),
  external_call_id TEXT,
  external_event_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  state TEXT NOT NULL CHECK (state IN ('started', 'answered', 'missed', 'ended', 'unknown')),
  media_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (media_kind IN ('voice', 'video', 'unknown')),
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('granted', 'revoked', 'expired')),
  source TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppressions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'workspace')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE connector_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('shopify', 'ghl', 'woocommerce', 'generic')),
  label TEXT NOT NULL,
  encrypted_credentials BYTEA,
  encryption_key_id TEXT,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'active', 'degraded', 'revoked')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_receipts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  provider_connection_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  signature_valid BOOLEAN,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(source, provider_connection_id, external_event_id)
);

CREATE TABLE outbox_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,
  event_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  correlation_id TEXT,
  causation_id TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'agent', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'expired')),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);
CREATE INDEX idx_workspace_features_enabled ON workspace_features(workspace_id, enabled);
CREATE INDEX idx_members_user ON workspace_members(user_id);
CREATE INDEX idx_numbers_workspace ON whatsapp_numbers(workspace_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_provider_connections_workspace ON provider_connections(workspace_id);
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_conversations_workspace_updated ON conversations(workspace_id, updated_at DESC);
CREATE INDEX idx_messages_conversation_time ON messages(conversation_id, occurred_at DESC);
CREATE INDEX idx_call_events_workspace_time ON call_events(workspace_id, occurred_at DESC);
CREATE INDEX idx_consent_contact ON consent_records(workspace_id, contact_id, captured_at DESC);
CREATE INDEX idx_suppressions_phone ON suppressions(phone_e164, workspace_id);
CREATE INDEX idx_connector_connections_workspace ON connector_connections(workspace_id);
CREATE INDEX idx_webhook_receipts_status ON webhook_receipts(status, received_at);
CREATE INDEX idx_outbox_pending ON outbox_events(status, available_at);
