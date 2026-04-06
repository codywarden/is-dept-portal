# 🚜 Frankie the Autonomous Tractor - Setup Guide

## Overview
Frankie is a remote control system for an ESP32 microcontroller that simulates keyboard (Enter key) and mouse clicks. It integrates with your IS Dept Portal via Supabase for command management.

## Features

- ✅ **Live Connection Status** - Dashboard shows ESP32 online/offline in real-time
- ✅ **Heartbeat Monitoring** - ESP32 sends status updates every 60 seconds
- ✅ **WiFi Manager** - Easy WiFi setup via captive portal
- ✅ **Secure HTTPS** - All communication encrypted
- ✅ **Role-based Access** - Only admin/verifier can send commands
- ✅ **Command Tracking** - Full audit trail of all commands
- ✅ **Mouse Control** - Full mouse click and movement support

## Architecture

```
Website (Dashboard)
    ↓
    └→ User clicks "Enter" / "Mouse Click" button
    ↓
Next.js API Route (/api/frankie/commands)
    ↓
Supabase Database (frankie_commands table)
    ↓
ESP32 (polls API every ~1 second)
    ↓
USB HID Output → Computer
```

## Setup Steps

### 1. Create Supabase Tables

Run this SQL in your Supabase SQL editor:

```sql
-- Copy the contents of supabase/migrations/20260404_create_frankie_commands.sql
-- This creates both frankie_commands and frankie_status tables
```

Or use the Supabase CLI:

```bash
cd /Users/codywarden/dev/is-dept-portal
supabase db push
```

**Tables Created:**
- `frankie_commands` - Stores remote control commands
- `frankie_status` - Tracks ESP32 online/offline status

### 2. Website Page

✅ Already created:
- `/app/dashboard/frankie/page.tsx` - Server component (auth check)
- `/app/dashboard/frankie/FrankieClient.tsx` - Client component (control buttons)
- `/app/api/frankie/commands/route.ts` - API endpoints for commands
- Updated `/app/dashboard/DashboardClient.tsx` - Added Frankie card

### 3. Test the Website

1. Push changes to GitHub:
   ```bash
   cd /Users/codywarden/dev/is-dept-portal
   git add .
   git commit -m "Add Frankie autonomous tractor control"
   git push
   ```

2. Vercel will auto-deploy
3. Go to your portal and look for "🚜 Frankie the Autonomous Tractor" card
4. Click to open the control panel

### 4. ESP32 Firmware

See the corresponding ESP32 project for firmware updates:
- WiFi Manager for easy WiFi setup
- HTTPS polling to `/api/frankie/commands`
- USB HID keyboard/mouse emulation
- Status reporting

## API Endpoints

### POST /api/frankie/commands
Send a command (requires authentication)

**Mouse Movement Example:**
```bash
curl -X POST https://your-domain.com/api/frankie/commands \
  -H "Content-Type: application/json" \
  -b "cookies.txt" \
  -d '{"command": "mouse_move", "mouse_x": 50, "mouse_y": -25, "mouse_relative": true}'
```

Response:
```json
{
  "success": true,
  "command": {
    "id": 123,
    "command": "enter",
    "status": "pending",
    "created_at": "2026-04-04T12:00:00Z"
  }
}
```

### GET /api/frankie/commands
Fetch next pending command (ESP32 polling)

```bash
curl https://your-domain.com/api/frankie/commands
```

Response:
```json
{
  "command": {
    "id": 123,
    "command": "enter",
    "status": "pending"
  }
}
```

### PATCH /api/frankie/commands
Mark command as processed (ESP32 callback)

```bash
curl -X PATCH https://your-domain.com/api/frankie/commands \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "status": "processed"}'
```

### GET /api/frankie/status
Get ESP32 connection status (dashboard polling)

```json
{
  "status": "online",
  "last_seen": "2026-04-04T12:00:00Z",
  "ip_address": "192.168.1.100",
  "wifi_ssid": "Your_Network",
  "seconds_since_last_seen": 5
}
```

### POST /api/frankie/status
ESP32 heartbeat (updates online status)

## What You'll See

**Dashboard Features:**
- 🚜 Frankie card in main dashboard (admin/verifier only)
- 🟢 Live ESP32 connection status (online/offline)
- ⌨️ Enter Button & 🖱️ Mouse Click controls
- �️ Mouse Movement - Directional buttons and coordinate input
- �📊 Real-time command status updates
- 🔒 Role-based permissions

**ESP32 Features:**
- 🌐 WiFi Manager captive portal setup
- 💓 Heartbeat every 60 seconds
- 📡 HTTPS polling every 1 second
- ⌨️ Keyboard emulation
- 📊 Serial debug output

- ✅ Only **admin** and **verifier** roles can send commands
- ✅ Supabase Row Level Security (RLS) on commands table
- ✅ User IDs tracked for each command
- ✅ All API calls go through authenticated sessions

## Troubleshooting

### Commands not appearing on ESP32
- Check ESP32 WiFi connection
- Verify API URL matches your domain
- Check browser console for errors
- Review Supabase logs for RLS violations

### Permission Denied
- Make sure your user role is "admin" or "verifier"
- Check `page_permissions.frankie` setting in profiles

### Database Migration Failed
- Ensure Supabase CLI is installed: `npm install -g @supabase/cli`
- Run: `supabase db push` with correct project setup

## Next Steps

1. Update ESP32 firmware (see esp32-enter-button project)
2. Test WiFi provisioning on ESP32
3. Deploy to Vercel
4. Connect ESP32 and test end-to-end
