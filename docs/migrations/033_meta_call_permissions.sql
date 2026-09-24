CREATE TABLE meta_call_permissions (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 recipient TEXT NOT NULL,
 status TEXT NOT NULL,
 expires_at TIMESTAMPTZ,
 occurred_at TIMESTAMPTZ NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('webhook','api')),
 response_source TEXT,
 external_event_id TEXT NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(provider_connection_id,external_event_id)
);
CREATE INDEX meta_call_permissions_recipient ON meta_call_permissions(workspace_id,provider_connection_id,recipient,occurred_at DESC);
