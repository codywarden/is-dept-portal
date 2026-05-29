-- Add string_value for text-based commands like set_device_name
ALTER TABLE planter_commands
  ADD COLUMN IF NOT EXISTS string_value TEXT;

-- Expand command constraint to include set_device_name
ALTER TABLE planter_commands
  DROP CONSTRAINT IF EXISTS planter_commands_command_check;

ALTER TABLE planter_commands
  ADD CONSTRAINT planter_commands_command_check
  CHECK (command IN (
    'set_height_en', 'set_sentinel_en', 'set_seed_en', 'set_vac_en', 'ota_update',
    'set_min_speed', 'set_seed_delay', 'set_vac_delay', 'set_sent_delay',
    'set_output_hold', 'set_fallback_thresh', 'set_sentinel_scale',
    'set_device_name'
  ));
