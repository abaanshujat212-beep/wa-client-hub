CREATE TABLE ghl_message_sync (
 mapping_id TEXT NOT NULL REFERENCES ghl_number_mappings(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('preparing','importing','synced','existing','retry','blocked','uncertain')),
 ghl_message_id TEXT,
 error_code TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(mapping_id,message_id)
);
CREATE INDEX ghl_message_sync_retry ON ghl_message_sync(state,retry_at);
