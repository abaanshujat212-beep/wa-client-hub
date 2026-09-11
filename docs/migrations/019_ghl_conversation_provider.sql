ALTER TABLE ghl_number_mappings ADD COLUMN IF NOT EXISTS conversation_provider_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_mapping_provider_channel ON ghl_number_mappings(installation_id,location_id,conversation_provider_id) WHERE conversation_provider_id IS NOT NULL;
