ALTER TABLE connector_connections
  ADD COLUMN scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN conflict_policy TEXT NOT NULL DEFAULT 'latest_wins' CHECK (conflict_policy IN ('source_wins','latest_wins','manual_review')),
  ADD COLUMN last_error TEXT,
  ADD COLUMN last_sync_at TIMESTAMPTZ,
  ADD COLUMN revoked_at TIMESTAMPTZ;

ALTER TABLE outbox_events
  ADD COLUMN connector_connection_id TEXT REFERENCES connector_connections(id) ON DELETE CASCADE;

CREATE TABLE connector_inbox_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connector_connection_id TEXT NOT NULL REFERENCES connector_connections(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  external_occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','processed','ignored','failed','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE(connector_connection_id,external_event_id)
);

CREATE TABLE connector_conflicts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connector_connection_id TEXT NOT NULL REFERENCES connector_connections(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  local_value JSONB NOT NULL,
  remote_value JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_connector_inbox_pending ON connector_inbox_events(status,received_at);
CREATE INDEX idx_connector_outbox_pending ON outbox_events(connector_connection_id,status,available_at);
CREATE UNIQUE INDEX uq_connector_outbox_external_event ON outbox_events(connector_connection_id,(payload->>'externalEventId')) WHERE connector_connection_id IS NOT NULL;
CREATE INDEX idx_connector_conflicts_open ON connector_conflicts(workspace_id,status,created_at DESC);
