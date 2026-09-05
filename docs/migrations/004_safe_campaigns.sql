CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  whatsapp_number_id TEXT NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  template TEXT NOT NULL CHECK (char_length(template) BETWEEN 1 AND 4096),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','paused','cancelled','completed')),
  scheduled_at TIMESTAMPTZ,
  quiet_start SMALLINT CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end SMALLINT CHECK (quiet_end BETWEEN 0 AND 23),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaign_recipients (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  personalized_body TEXT NOT NULL CHECK (char_length(personalized_body) BETWEEN 1 AND 4096),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','delivered','read','failed','suppressed','unconsented','cancelled','dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

CREATE TABLE campaign_recipient_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_workspace_suppression ON suppressions(workspace_id, phone_e164) WHERE scope='workspace';
CREATE UNIQUE INDEX uq_global_suppression ON suppressions(phone_e164) WHERE scope='global';
CREATE INDEX idx_campaign_queue ON campaign_recipients(status,next_attempt_at,campaign_id);
CREATE INDEX idx_campaign_workspace ON campaigns(workspace_id,created_at DESC);
CREATE INDEX idx_campaign_events ON campaign_recipient_events(campaign_id,created_at DESC);
