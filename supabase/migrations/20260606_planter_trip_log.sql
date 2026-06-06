-- Trip log: one row per actual 12V relay fire reported by the ESP32
-- device_uptime is the HH:MM:SS uptime string from the device at the moment
-- of the trip; used with device_id to deduplicate repeated telemetry sends.
CREATE TABLE IF NOT EXISTS planter_trip_log (
  id           BIGSERIAL PRIMARY KEY,
  device_id    TEXT NOT NULL DEFAULT 'default',
  received_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  device_uptime TEXT NOT NULL,
  reason       TEXT
);

-- Prevent the same trip from being inserted twice (each telemetry POST resends
-- last 10 trips; we only want to store each unique trip once per device).
CREATE UNIQUE INDEX IF NOT EXISTS idx_planter_trip_log_unique
  ON planter_trip_log (device_id, device_uptime);

CREATE INDEX IF NOT EXISTS idx_planter_trip_log_received_at
  ON planter_trip_log (device_id, received_at DESC);

ALTER TABLE planter_trip_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read trip log" ON planter_trip_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Real-time so the dashboard sees new trips immediately
ALTER PUBLICATION supabase_realtime ADD TABLE planter_trip_log;
