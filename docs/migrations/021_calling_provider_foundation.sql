CREATE UNIQUE INDEX IF NOT EXISTS uq_call_events_provider_event
  ON call_events(provider_connection_id, external_event_id)
  WHERE external_event_id IS NOT NULL;
