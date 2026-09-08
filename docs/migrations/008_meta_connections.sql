CREATE UNIQUE INDEX uq_meta_provider_phone_number_id
  ON provider_connections ((settings->>'phoneNumberId'))
  WHERE provider = 'whatsapp_cloud'
    AND NULLIF(settings->>'phoneNumberId', '') IS NOT NULL;
