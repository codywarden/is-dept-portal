-- Add height_en column to planter_status
ALTER TABLE planter_status ADD COLUMN IF NOT EXISTS height_en BOOLEAN;

-- Create planter_commands table (queue for dashboard → planter ESP32 commands)
CREATE TABLE IF NOT EXISTS planter_commands (
  id BIGSERIAL PRIMARY KEY,
  command TEXT NOT NULL CHECK (command IN ('set_height_en', 'set_sentinel_en', 'set_seed_en', 'set_vac_en')),
  value BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_planter_commands_status_created ON planter_commands(status, created_at);

ALTER TABLE planter_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage planter commands" ON planter_commands
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
