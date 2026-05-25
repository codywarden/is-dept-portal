-- Add num_value column for numeric config commands
ALTER TABLE planter_commands
  ADD COLUMN IF NOT EXISTS num_value DOUBLE PRECISION;

-- Expand command constraint to include numeric config commands
ALTER TABLE planter_commands
  DROP CONSTRAINT IF EXISTS planter_commands_command_check;

ALTER TABLE planter_commands
  ADD CONSTRAINT planter_commands_command_check
  CHECK (command IN (
    'set_height_en', 'set_sentinel_en', 'set_seed_en', 'set_vac_en', 'ota_update',
    'set_min_speed', 'set_seed_delay', 'set_vac_delay', 'set_sent_delay',
    'set_output_hold', 'set_fallback_thresh', 'set_sentinel_scale'
  ));
