-- Firmware release registry for Frankie OTA updates
CREATE TABLE IF NOT EXISTS frankie_firmware_releases (
  id            BIGSERIAL PRIMARY KEY,
  version       TEXT NOT NULL UNIQUE,
  storage_path  TEXT NOT NULL,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT false,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only one firmware can be active at a time
CREATE UNIQUE INDEX idx_frankie_firmware_one_active
  ON frankie_firmware_releases (is_active)
  WHERE is_active = true;

CREATE INDEX idx_frankie_firmware_created ON frankie_firmware_releases(created_at DESC);

ALTER TABLE frankie_firmware_releases ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins full access to firmware" ON frankie_firmware_releases
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- Authenticated users can read
CREATE POLICY "Authenticated users can read firmware" ON frankie_firmware_releases
  FOR SELECT USING (auth.uid() IS NOT NULL);
