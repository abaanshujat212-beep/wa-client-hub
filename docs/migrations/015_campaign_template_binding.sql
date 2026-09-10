ALTER TABLE campaigns ADD COLUMN message_mode TEXT NOT NULL DEFAULT 'free_form' CHECK (message_mode IN ('free_form','official_template'));
ALTER TABLE campaigns ADD COLUMN official_template_name TEXT;
ALTER TABLE campaigns ADD COLUMN official_template_language TEXT;
ALTER TABLE campaigns ADD COLUMN official_template_parameters JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_template_mode_check CHECK ((message_mode='free_form' AND official_template_name IS NULL AND official_template_language IS NULL) OR (message_mode='official_template' AND official_template_name IS NOT NULL AND official_template_language IS NOT NULL));
