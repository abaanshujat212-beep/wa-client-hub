CREATE TABLE meta_signup_rate_limits (
  bucket_key TEXT PRIMARY KEY CHECK (bucket_key ~ '^[a-f0-9]{64}$'),
  hits INTEGER NOT NULL CHECK (hits >= 1 AND hits <= 1001),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_meta_signup_rate_expiry ON meta_signup_rate_limits(expires_at);
