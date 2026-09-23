CREATE TABLE meta_call_sessions (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 external_call_id TEXT,
 direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
 recipient TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'initiating',
 owner_user_id TEXT REFERENCES users(id),
 last_event_at TIMESTAMPTZ,
 remote_session BYTEA,
 remote_key_id TEXT,
 remote_expires_at TIMESTAMPTZ,
 answer_hash TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(provider_connection_id,external_call_id)
);
CREATE INDEX meta_call_sessions_workspace ON meta_call_sessions(workspace_id,provider_connection_id,created_at DESC);
CREATE TABLE meta_call_commands (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id),
 session_id TEXT REFERENCES meta_call_sessions(id),
 actor_id TEXT NOT NULL REFERENCES users(id),
 idempotency_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 action TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('sending','accepted','failed','uncertain')),
 result JSONB,
 error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(provider_connection_id,idempotency_key)
);
CREATE TABLE meta_call_session_events (
 id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL REFERENCES meta_call_sessions(id),
 receipt_id TEXT NOT NULL UNIQUE REFERENCES webhook_receipts(id),
 event TEXT NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL,
 error_code TEXT
);
