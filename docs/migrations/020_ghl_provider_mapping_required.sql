ALTER TABLE ghl_number_mappings ADD CONSTRAINT ghl_mapping_conversation_provider_required CHECK (conversation_provider_id IS NOT NULL) NOT VALID;
