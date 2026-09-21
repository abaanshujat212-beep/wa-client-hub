CREATE TABLE ghl_workflow_subscriptions (
 location_id TEXT NOT NULL, trigger_id TEXT NOT NULL, workflow_id TEXT NOT NULL,
 trigger_key TEXT NOT NULL, target_url TEXT, filters JSONB NOT NULL DEFAULT '[]',
 active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(location_id,trigger_id)
);
CREATE TABLE ghl_workflow_deliveries (
 id BIGSERIAL PRIMARY KEY, location_id TEXT NOT NULL, trigger_id TEXT NOT NULL,
 mapping_id TEXT NOT NULL REFERENCES ghl_number_mappings(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 event_key TEXT NOT NULL, event_status TEXT NOT NULL, occurred_at TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','delivered','skipped','failed','uncertain')),
 error_code TEXT, retry_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(location_id,trigger_id,message_id,event_key,event_status),
 FOREIGN KEY(location_id,trigger_id) REFERENCES ghl_workflow_subscriptions(location_id,trigger_id) ON DELETE CASCADE
);
CREATE INDEX ghl_workflow_pending ON ghl_workflow_deliveries(state,retry_at);
CREATE FUNCTION capture_ghl_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k TEXT;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.direction='inbound' AND TG_OP='INSERT' THEN k='tenx_wa_message_received';
 ELSIF NEW.direction='outbound' AND NEW.status IN ('sent','delivered','read','failed') THEN k='tenx_wa_message_status_updated';
 ELSE RETURN NEW; END IF;
 INSERT INTO ghl_workflow_deliveries(location_id,trigger_id,mapping_id,message_id,event_key,event_status,occurred_at)
 SELECT s.location_id,s.trigger_id,g.id,NEW.id,k,NEW.status,CASE WHEN TG_OP='INSERT' THEN NEW.occurred_at ELSE now() END
 FROM conversations c JOIN ghl_number_mappings g ON g.whatsapp_number_id=c.whatsapp_number_id AND g.workspace_id=c.workspace_id
 JOIN ghl_installations i ON i.id=g.installation_id AND i.status='active'
 JOIN ghl_workflow_subscriptions s ON s.location_id=g.location_id AND s.active AND s.trigger_key=k
 WHERE c.id=NEW.conversation_id AND c.workspace_id=NEW.workspace_id
 AND (TG_OP='UPDATE' OR NEW.occurred_at>=s.created_at)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER ghl_workflow_message_event AFTER INSERT OR UPDATE OF status ON messages
 FOR EACH ROW EXECUTE FUNCTION capture_ghl_workflow_event();
