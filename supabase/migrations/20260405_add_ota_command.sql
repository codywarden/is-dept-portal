-- Add ota_update to the allowed commands
ALTER TABLE frankie_commands
  DROP CONSTRAINT IF EXISTS frankie_commands_command_check;

ALTER TABLE frankie_commands
  ADD CONSTRAINT frankie_commands_command_check
  CHECK (command IN ('enter', 'mouse_click', 'mouse_move', 'ota_update'));
