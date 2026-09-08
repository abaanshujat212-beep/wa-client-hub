CREATE TABLE message_send_attempts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE RESTRICT,
  client_idempotency_key TEXT NOT NULL CHECK (char_length(client_idempotency_key) BETWEEN 1 AND 200),
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'dispatching', 'provider_accepted', 'accepted', 'failed')),
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  external_message_id TEXT,
  raw_provider_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, client_idempotency_key)
);

CREATE INDEX idx_message_send_attempts_conversation
  ON message_send_attempts(workspace_id, conversation_id, created_at DESC);

CREATE INDEX idx_message_send_attempts_status
  ON message_send_attempts(status, updated_at);
