CREATE TABLE meta_coexistence_jobs (
 provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
 step TEXT NOT NULL CHECK(step IN ('subscribe','smb_app_state_sync','history')),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed','uncertain','expired')),
 request_id TEXT, error_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(provider_connection_id,step)
);

-- Imported messages must never start workflows, even when timestamps are recent.
CREATE OR REPLACE FUNCTION capture_ghl_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k TEXT;
BEGIN
 IF NEW.metadata->>'history'='true' THEN RETURN NEW; END IF;
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
