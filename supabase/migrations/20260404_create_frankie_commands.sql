-- Create frankie_commands table for tractor control
CREATE TABLE IF NOT EXISTS frankie_commands (
  id BIGSERIAL PRIMARY KEY,
  command TEXT NOT NULL CHECK (command IN ('enter', 'mouse_click', 'mouse_move')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  sent_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  esp32_device_id TEXT,
  notes TEXT,
  -- Mouse movement parameters
  mouse_x INTEGER,
  mouse_y INTEGER,
  mouse_relative BOOLEAN DEFAULT true
);

-- Create frankie_status table for ESP32 heartbeat
CREATE TABLE IF NOT EXISTS frankie_status (
  id BIGSERIAL PRIMARY KEY,
  esp32_device_id TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  wifi_ssid TEXT,
  firmware_version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create unique index for device status
CREATE UNIQUE INDEX idx_frankie_status_device ON frankie_status(esp32_device_id);

-- Create index for efficient polling
CREATE INDEX idx_frankie_commands_status_created ON frankie_commands(status, created_at);
CREATE INDEX idx_frankie_commands_sent_by ON frankie_commands(sent_by);

-- Enable Row Level Security
ALTER TABLE frankie_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE frankie_status ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own commands and admins/verifiers can view all
CREATE POLICY "Users can view own commands" ON frankie_commands
  FOR SELECT USING (
    auth.uid() = sent_by OR
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'verifier')
  );

-- Policy: Only admins and verifiers can insert
CREATE POLICY "Only admins and verifiers can insert" ON frankie_commands
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'verifier')
  );

-- Policy: Only admins and verifiers can update
CREATE POLICY "Only admins and verifiers can update" ON frankie_commands
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'verifier')
  ) WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'verifier')
  );

-- Policy: Anyone can view status (for dashboard display)
CREATE POLICY "Anyone can view status" ON frankie_status
  FOR SELECT USING (true);

-- Policy: ESP32 can update status (via API)
CREATE POLICY "ESP32 can update status" ON frankie_status
  FOR ALL USING (true) WITH CHECK (true);

-- Allow ESP32 to read/update with API KEY (unauthenticated via service role)
-- This will be handled via the API route with service role key
