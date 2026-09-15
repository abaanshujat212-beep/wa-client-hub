ALTER TABLE meta_signup_states
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE meta_signup_states
  DROP CONSTRAINT IF EXISTS meta_signup_states_status_check;
ALTER TABLE meta_signup_states
  ADD CONSTRAINT meta_signup_states_status_check
  CHECK (status IN ('pending','processing'));

CREATE INDEX IF NOT EXISTS idx_meta_signup_states_processing
  ON meta_signup_states(status, processing_started_at)
  WHERE status = 'processing';
