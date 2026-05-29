-- Stores user-assigned names and locations for each planter board
CREATE TABLE IF NOT EXISTS planter_devices (
  id          TEXT PRIMARY KEY, -- matches device_id posted in telemetry
  name        TEXT,
  location    TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default (production) board so it shows up even before the boards card is used
INSERT INTO planter_devices (id, name, location)
  VALUES ('default', 'Production', NULL)
  ON CONFLICT (id) DO NOTHING;
