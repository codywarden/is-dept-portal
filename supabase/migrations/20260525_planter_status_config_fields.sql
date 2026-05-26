-- Add config value columns to planter_status so the ESP32 can report its current settings
ALTER TABLE planter_status
  ADD COLUMN IF NOT EXISTS cfg_min_speed       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS cfg_seed_delay      INTEGER,
  ADD COLUMN IF NOT EXISTS cfg_vac_delay       INTEGER,
  ADD COLUMN IF NOT EXISTS cfg_sent_delay      INTEGER,
  ADD COLUMN IF NOT EXISTS cfg_output_hold     INTEGER,
  ADD COLUMN IF NOT EXISTS cfg_fallback_thresh INTEGER,
  ADD COLUMN IF NOT EXISTS cfg_sentinel_scale  INTEGER;
