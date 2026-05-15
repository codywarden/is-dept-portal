-- Allow ota_update in planter_commands and make value nullable
ALTER TABLE planter_commands
  DROP CONSTRAINT IF EXISTS planter_commands_command_check;

ALTER TABLE planter_commands
  ADD CONSTRAINT planter_commands_command_check
  CHECK (command IN ('set_height_en', 'set_sentinel_en', 'set_seed_en', 'set_vac_en', 'ota_update'));

ALTER TABLE planter_commands
  ALTER COLUMN value DROP NOT NULL;

-- Planter-specific firmware releases table (separate from enter-button)
CREATE TABLE IF NOT EXISTS planter_firmware_releases (
  id           BIGSERIAL PRIMARY KEY,
  version      TEXT NOT NULL UNIQUE,
  storage_path TEXT NOT NULL,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT false,
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planter_firmware_active
  ON planter_firmware_releases(is_active);

ALTER TABLE planter_firmware_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages planter firmware"
  ON planter_firmware_releases FOR ALL USING (true);
