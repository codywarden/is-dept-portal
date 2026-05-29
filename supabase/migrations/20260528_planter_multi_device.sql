-- Multi-device support: scope commands and fault log to individual boards
ALTER TABLE planter_commands
  ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE planter_fault_log
  ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_planter_commands_device
  ON planter_commands(device_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_planter_fault_log_device
  ON planter_fault_log(device_id, occurred_at DESC);
