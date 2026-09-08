-- Durable one-time claims; never store raw states, session IDs, codes or tokens.
CREATE TABLE meta_signup_states (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  session_hash TEXT NOT NULL CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (char_length(label) BETWEEN 2 AND 200),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_meta_signup_states_expiry ON meta_signup_states(expires_at);
