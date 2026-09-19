CREATE TABLE ghl_media_folders (
 location_id TEXT PRIMARY KEY,
 folder_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('creating','ready','uncertain')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ghl_media_archive (
 id TEXT PRIMARY KEY,
 installation_id TEXT NOT NULL,
 location_id TEXT NOT NULL,
 workspace_id TEXT NOT NULL,
 source_key TEXT NOT NULL,
 file_id TEXT,
 url TEXT,
 state TEXT NOT NULL CHECK(state IN ('uploading','ready','uncertain','expired')),
 expires_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(location_id,source_key)
);
CREATE INDEX ghl_media_archive_expiry ON ghl_media_archive(expires_at) WHERE state='ready';
