CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connector_connection_id TEXT NOT NULL REFERENCES connector_connections(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  external_order_id TEXT NOT NULL,
  number TEXT,
  status TEXT NOT NULL,
  currency TEXT,
  total_amount NUMERIC(18,2),
  occurred_at TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connector_connection_id,external_order_id)
);
CREATE TABLE contact_timeline_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  connector_connection_id TEXT REFERENCES connector_connections(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connector_connection_id,external_event_id,type)
);
CREATE TABLE generic_api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE TABLE generic_api_usage (
  api_key_id TEXT NOT NULL REFERENCES generic_api_keys(id) ON DELETE CASCADE,
  minute_bucket TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(api_key_id,minute_bucket)
);
CREATE TABLE generic_idempotency (
  api_key_id TEXT NOT NULL REFERENCES generic_api_keys(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(api_key_id,idempotency_key)
);
CREATE INDEX idx_orders_contact ON orders(workspace_id,contact_id,occurred_at DESC);
CREATE INDEX idx_timeline_contact ON contact_timeline_events(workspace_id,contact_id,occurred_at DESC);
CREATE INDEX idx_generic_keys_prefix ON generic_api_keys(key_prefix) WHERE active;
