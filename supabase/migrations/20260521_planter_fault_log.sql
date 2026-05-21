-- Fault log: one row per fault event (inserted when a fault first triggers)
CREATE TABLE IF NOT EXISTS planter_fault_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  output_on    BOOLEAN,
  output_reason TEXT,
  seed_fault   BOOLEAN,
  seed_fault_row INTEGER,
  vac_fault    BOOLEAN,
  sentinel_alarm BOOLEAN
);

CREATE INDEX idx_planter_fault_log_occurred_at ON planter_fault_log(occurred_at DESC);

ALTER TABLE planter_fault_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fault log" ON planter_fault_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Enable realtime so the dashboard gets live inserts
ALTER PUBLICATION supabase_realtime ADD TABLE planter_fault_log;
