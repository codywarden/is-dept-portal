"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface FrankieClientProps {
  role: "admin" | "manager" | "user" | "guest";
  profile: {
    email: string;
    firstName: string;
    lastName: string;
    locations: string[];
    pagePermissions: Record<string, boolean> | null;
  };
}

interface ESP32Status {
  status: "online" | "offline";
  last_seen: string | null;
  ip_address: string | null;
  wifi_ssid: string | null;
  firmware_version: string | null;
  seconds_since_last_seen: number;
}

interface FirmwareRelease {
  id: number;
  version: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface FirmwareCheck {
  update_available: boolean;
  version?: string;
  notes?: string | null;
}

const KEYBOARD_ROWS = [
  ["1","2","3","4","5","6","7","8","9","0","Bksp"],
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L","Enter"],
  ["Shift","Z","X","C","V","B","N","M",",",".","Shift"],
  ["Tab","Space","Esc"],
];

const SHIFT_MAP: Record<string, string> = {
  "1":"!","2":"@","3":"#","4":"$","5":"%",
  "6":"^","7":"&","8":"*","9":"(","0":")",
  ",":"<",".":">",
};

export default function FrankieClient({ role, profile }: FrankieClientProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [lastCommand, setLastCommand] = useState<string>("");
  const [esp32Status, setEsp32Status] = useState<ESP32Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [smallMovePixels, setSmallMovePixels] = useState(150);
  const [largeMovePixels, setLargeMovePixels] = useState(250);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [trackpadSensitivity, setTrackpadSensitivity] = useState(2);
  const [shiftActive, setShiftActive] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [firmwareOpen, setFirmwareOpen] = useState(false);

  // Only admin and verifier can control Frankie
  // Anyone who can reach this page either is admin or has the frankie page permission
  const canControl = role === "admin" || profile.pagePermissions?.["frankie"] === true;
  const canManageFirmware = role === "admin" || profile.pagePermissions?.["frankie_firmware"] === true;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const lastSendTime = useRef(0);

  // Firmware state
  const [firmwareReleases, setFirmwareReleases] = useState<FirmwareRelease[]>([]);
  const [firmwareCheck, setFirmwareCheck] = useState<FirmwareCheck | null>(null);
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [firmwareNotes, setFirmwareNotes] = useState("");
  const [firmwareSetActive, setFirmwareSetActive] = useState(true);
  const [firmwareUploading, setFirmwareUploading] = useState(false);
  const [firmwareMsg, setFirmwareMsg] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ── Supabase Realtime channel ─────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase.channel("frankie");
    channelRef.current = ch;
    ch.subscribe((s) => {
      if (s === "SUBSCRIBED") setRealtimeStatus("connected");
      else if (s === "CLOSED" || s === "CHANNEL_ERROR") setRealtimeStatus("disconnected");
    });
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const broadcastCommand = useCallback((payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event: "command", payload });
  }, []);

  // ── Trackpad ──────────────────────────────────────────────────────────────
  const onTrackpadPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!canControl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDragging.current = true;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current   = { x: e.clientX, y: e.clientY };
    lastSendTime.current   = 0;
  }, [canControl]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTrackpadPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !canControl) return;
    const now = Date.now();
    if (now - lastSendTime.current < 16) return;
    const dx = Math.round((e.clientX - lastPointerPos.current.x) * trackpadSensitivity);
    const dy = Math.round((e.clientY - lastPointerPos.current.y) * trackpadSensitivity);
    if (dx !== 0 || dy !== 0) {
      broadcastCommand({ command: "mouse_move", x: dx, y: dy });
      setLastCommand(`mouse_move (${dx > 0 ? "+" : ""}${dx}, ${dy > 0 ? "+" : ""}${dy}) - ${new Date().toLocaleTimeString()}`);
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      lastSendTime.current = now;
    }
  }, [canControl, trackpadSensitivity, broadcastCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTrackpadPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const totalDx = Math.abs(e.clientX - dragStartPos.current.x);
    const totalDy = Math.abs(e.clientY - dragStartPos.current.y);
    if (totalDx < 5 && totalDy < 5 && canControl) {
      broadcastCommand({ command: "mouse_click" });
      setLastCommand(`mouse_click (tap) - ${new Date().toLocaleTimeString()}`);
    }
  }, [canControl, broadcastCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const pressKey = useCallback((label: string) => {
    if (!canControl) return;
    let key = label;
    if (label === "Bksp")  { key = "backspace"; }
    else if (label === "Space") { key = " "; }
    else if (label === "Enter") { key = "enter"; }
    else if (label === "Tab")   { key = "tab"; }
    else if (label === "Esc")   { key = "escape"; }
    else if (label === "Shift") { setShiftActive((v) => !v); return; }
    else if (label.length === 1) {
      key = shiftActive
        ? (SHIFT_MAP[label] ?? label.toUpperCase())
        : label.toLowerCase();
      setShiftActive(false); // one-shot shift
    }
    broadcastCommand({ command: "key_press", key });
    setLastCommand(`key: ${key} - ${new Date().toLocaleTimeString()}`);
  }, [canControl, shiftActive, broadcastCommand]);

  // ── Status polling ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/frankie/status");
        if (res.ok) {
          const data = await res.json();
          setEsp32Status(data);
          if (canManageFirmware) fetchFirmwareData(data.firmware_version);
        }
      } catch (e) { console.error(e); }
      finally { setStatusLoading(false); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFirmwareData = async (deviceVersion?: string | null) => {
    try {
      const [, checkRes] = await Promise.all([
        fetch("/api/frankie/firmware"),
        fetch(`/api/frankie/firmware?version=${deviceVersion ?? ""}`),
      ]);
      const { data } = await supabase
        .from("frankie_firmware_releases")
        .select("id, version, notes, is_active, created_at")
        .order("created_at", { ascending: false });
      if (data) setFirmwareReleases(data);
      if (checkRes.ok) setFirmwareCheck(await checkRes.json());
    } catch (e) { console.error(e); }
  };

  const uploadFirmware = async () => {
    if (!firmwareFile || !firmwareVersion) return;
    setFirmwareUploading(true);
    setFirmwareMsg("Uploading...");
    const form = new FormData();
    form.append("file", firmwareFile);
    form.append("version", firmwareVersion);
    form.append("notes", firmwareNotes);
    form.append("set_active", String(firmwareSetActive));
    try {
      const res = await fetch("/api/frankie/firmware", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFirmwareMsg(`v${data.version} uploaded`);
      setFirmwareFile(null); setFirmwareVersion(""); setFirmwareNotes("");
      fetchFirmwareData(esp32Status?.firmware_version);
    } catch (e: any) { setFirmwareMsg(`Error: ${e.message}`); }
    finally { setFirmwareUploading(false); }
  };

  const activateRelease = async (id: number) => {
    const res = await fetch("/api/frankie/firmware", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { setFirmwareMsg("Release activated"); fetchFirmwareData(esp32Status?.firmware_version); }
  };

  const pushOTAUpdate = () => sendCommand("ota_update");

  const sendMouseMove = useCallback((x: number, y: number) => {
    if (!canControl) return;
    broadcastCommand({ command: "mouse_move", x, y, relative: true });
    setLastCommand(`mouse_move (${x > 0 ? "+" : ""}${x}, ${y > 0 ? "+" : ""}${y}) - ${new Date().toLocaleTimeString()}`);
  }, [canControl, broadcastCommand]);

  const sendCommand = async (command: "enter" | "mouse_click" | "ota_update") => {
    setLoading(true);
    setStatus("Sending...");
    try {
      const res = await fetch("/api/frankie/commands", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) throw new Error("Failed");
      setLastCommand(`${command} - ${new Date().toLocaleTimeString()}`);
      setStatus(`✅ ${command.replace(/_/g, " ").toUpperCase()} sent!`);
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("❌ Error"); setTimeout(() => setStatus(""), 3000);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-green-800 mb-1">🚜 Frankie</h1>
          <p className="text-green-700">Remote Control Dashboard</p>
          <p className="text-sm text-green-600 mt-1">
            Welcome, {profile.firstName} ({role})
            <span className="ml-2">
              {realtimeStatus === "connected" && esp32Status?.status === "online"
                ? <span className="text-green-500">● connected</span>
                : realtimeStatus === "connecting" || statusLoading
                ? <span className="text-yellow-500">● connecting</span>
                : <span className="text-red-500">● offline</span>}
            </span>
          </p>
        </div>

        {!canControl && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
            <p className="text-yellow-700">⚠️ Your role ({role}) does not have permission to control Frankie.</p>
          </div>
        )}

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-t-4 border-green-700">

          {/* Trackpad */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-green-800">Trackpad</h3>
              <div className="flex items-center gap-1 text-sm text-green-700">
                <span className="text-xs">Sensitivity:</span>
                {[1, 2, 3, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setTrackpadSensitivity(s)}
                    className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${trackpadSensitivity === s ? "bg-green-600 text-white border-green-600" : "bg-white text-green-700 border-green-300 hover:bg-green-50"}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <div
              onPointerDown={onTrackpadPointerDown}
              onPointerMove={onTrackpadPointerMove}
              onPointerUp={onTrackpadPointerUp}
              onPointerCancel={onTrackpadPointerUp}
              className={`w-full h-80 rounded-xl border-2 flex items-center justify-center select-none transition-colors ${canControl ? "border-green-400 bg-green-50 cursor-crosshair hover:bg-green-100 active:bg-green-200" : "border-gray-200 bg-gray-50 cursor-not-allowed"}`}
              style={{ touchAction: "none" }}
            >
              <p className={`text-sm pointer-events-none ${canControl ? "text-green-400" : "text-gray-300"}`}>
                {canControl ? "drag to move · tap to click" : "no permission"}
              </p>
            </div>
            <button
              onClick={() => { broadcastCommand({ command: "mouse_click" }); setLastCommand(`mouse_click - ${new Date().toLocaleTimeString()}`); }}
              disabled={!canControl}
              className={`mt-3 w-full py-3 rounded-lg font-semibold text-base transition-all active:scale-95 ${canControl ? "bg-green-600 hover:bg-green-700 text-white shadow-lg" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
            >
              🖱️ Click
            </button>
          </div>

          {/* Nudge */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-green-800 mb-3">Nudge</h3>
            <div className="flex justify-center gap-16">
              {[
                { label: "Small", color: "blue", px: smallMovePixels, set: setSmallMovePixels },
                { label: "Large", color: "purple", px: largeMovePixels, set: setLargeMovePixels },
              ].map(({ label, color, px, set }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <span className={`text-xs font-semibold text-${color}-600`}>{label}</span>
                  <div className="flex flex-col items-center gap-1">
                    <button onClick={() => sendMouseMove(0, -px)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? `bg-${color}-500 hover:bg-${color}-600 text-white` : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>↑</button>
                    <div className="flex gap-1">
                      <button onClick={() => sendMouseMove(-px, 0)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? `bg-${color}-500 hover:bg-${color}-600 text-white` : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>←</button>
                      <button onClick={() => sendMouseMove(px, 0)}  disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? `bg-${color}-500 hover:bg-${color}-600 text-white` : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>→</button>
                    </div>
                    <button onClick={() => sendMouseMove(0, px)}  disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? `bg-${color}-500 hover:bg-${color}-600 text-white` : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>↓</button>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <label className="text-xs text-green-700">px:</label>
                    <input type="number" min="1" max="1000" value={px} onChange={(e) => set(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))} className="w-14 px-1 py-0.5 border border-green-300 rounded text-xs" disabled={!canControl} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keyboard — collapsible */}
          <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setKeyboardOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <span className="text-base font-semibold text-green-800">
                ⌨️ Keyboard
                {shiftActive && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">SHIFT</span>}
              </span>
              <span className="text-gray-400">{keyboardOpen ? "▲" : "▼"}</span>
            </button>
            {keyboardOpen && (
              <div className="p-3 space-y-1">
                {KEYBOARD_ROWS.map((row, ri) => (
                  <div key={ri} className="flex gap-1 justify-center flex-wrap">
                    {row.map((key) => {
                      const isShift  = key === "Shift";
                      const isWide   = key === "Space" || key === "Enter" || key === "Bksp";
                      const isActive = isShift && shiftActive;
                      return (
                        <button
                          key={key}
                          onPointerDown={(e) => { e.preventDefault(); pressKey(key); }}
                          disabled={!canControl}
                          className={`
                            ${isWide ? "px-4 min-w-[64px]" : "w-9"} h-9 rounded text-xs font-semibold
                            transition-all active:scale-95 select-none
                            ${!canControl ? "bg-gray-100 text-gray-300 cursor-not-allowed" :
                              isActive ? "bg-blue-500 text-white shadow" :
                              isShift  ? "bg-gray-200 hover:bg-gray-300 text-gray-700" :
                              key === "Enter" ? "bg-green-600 hover:bg-green-700 text-white" :
                              key === "Bksp" || key === "Esc" ? "bg-red-100 hover:bg-red-200 text-red-700" :
                              "bg-gray-100 hover:bg-gray-200 text-gray-800"
                            }
                          `}
                        >
                          {key === "Shift" ? "⇧" : key === "Bksp" ? "⌫" : key}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          {status && <div className="bg-green-50 border-l-4 border-green-600 p-3 rounded mb-4"><p className="text-green-700 font-semibold text-sm">{status}</p></div>}
          {lastCommand && (
            <div className="bg-gray-50 border-l-4 border-green-600 p-3 rounded">
              <p className="text-gray-500 text-xs">Last: <span className="font-semibold text-green-700">{lastCommand}</span></p>
            </div>
          )}
        </div>

        {/* Connection Status */}
        <div className="bg-green-700 rounded-lg p-6 mb-6 text-white">
          <h3 className="font-semibold text-green-100 mb-3">📡 Connection Status</h3>
          <div className="space-y-1 text-sm text-green-100">
            {statusLoading ? <span className="text-yellow-300">⏳ Checking...</span>
              : esp32Status?.status === "online" ? <span className="text-green-300">🟢 ESP32 Online</span>
              : <span className="text-red-300">🔴 ESP32 Offline</span>}
            {esp32Status && (
              <div className="text-xs text-green-200 space-y-0.5 mt-1">
                {esp32Status.wifi_ssid && <p>WiFi: {esp32Status.wifi_ssid}</p>}
                {esp32Status.ip_address && <p>IP: {esp32Status.ip_address}</p>}
                {esp32Status.last_seen && <p>Last seen: {new Date(esp32Status.last_seen).toLocaleTimeString()}</p>}
                {esp32Status.firmware_version && (
                  <p>Firmware: v{esp32Status.firmware_version}
                    {firmwareCheck?.update_available && <span className="ml-1 text-yellow-300">(v{firmwareCheck.version} available)</span>}
                  </p>
                )}
              </div>
            )}
            <div className="mt-1">
              {realtimeStatus === "connected" ? <span className="text-green-300">🟢 Realtime: live</span>
                : realtimeStatus === "connecting" ? <span className="text-yellow-300">⏳ Realtime: connecting...</span>
                : <span className="text-red-300">🔴 Realtime: disconnected</span>}
            </div>
          </div>
        </div>

        {/* Firmware Management - Admin Only, collapsible */}
        {canManageFirmware && (
          <div className="bg-white rounded-lg shadow-lg mb-8 border-t-4 border-yellow-500 overflow-hidden">
            <button
              onClick={() => setFirmwareOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-yellow-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-800">⚙️ Firmware Management</span>
                {firmwareCheck?.update_available && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-semibold">Update available</span>
                )}
              </div>
              <span className="text-gray-400 text-xl">{firmwareOpen ? "▲" : "▼"}</span>
            </button>

            {firmwareOpen && (
              <div className="px-6 pb-6">
                {firmwareCheck?.update_available && (
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded mb-6 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-yellow-800">v{firmwareCheck.version} available</p>
                      {firmwareCheck.notes && <p className="text-sm text-yellow-700">{firmwareCheck.notes}</p>}
                      <p className="text-xs text-yellow-600 mt-1">Running v{esp32Status?.firmware_version ?? "unknown"}</p>
                    </div>
                    <button onClick={pushOTAUpdate} disabled={loading || esp32Status?.status !== "online"} className="ml-4 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed">
                      Push Update
                    </button>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-semibold text-gray-700 mb-3">Upload New Firmware</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Version</label>
                      <input type="text" placeholder="1.0.1" value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Firmware File (.bin)</label>
                      <input type="file" accept=".bin" onChange={(e) => setFirmwareFile(e.target.files?.[0] ?? null)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-1">Release Notes (optional)</label>
                    <input type="text" placeholder="What changed?" value={firmwareNotes} onChange={(e) => setFirmwareNotes(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={firmwareSetActive} onChange={(e) => setFirmwareSetActive(e.target.checked)} className="w-4 h-4" />
                      Set as active
                    </label>
                    <button onClick={uploadFirmware} disabled={firmwareUploading || !firmwareFile || !firmwareVersion} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed">
                      {firmwareUploading ? "Uploading..." : "Upload"}
                    </button>
                  </div>
                  {firmwareMsg && <p className="mt-2 text-sm text-gray-600">{firmwareMsg}</p>}
                </div>

                {firmwareReleases.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3">Release History</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-gray-500">
                            <th className="pb-2 pr-4">Version</th>
                            <th className="pb-2 pr-4">Notes</th>
                            <th className="pb-2 pr-4">Uploaded</th>
                            <th className="pb-2 pr-4">Status</th>
                            <th className="pb-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {firmwareReleases.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-2 pr-4 font-mono font-semibold">v{r.version}</td>
                              <td className="py-2 pr-4 text-gray-500">{r.notes ?? "—"}</td>
                              <td className="py-2 pr-4 text-gray-500">{new Date(r.created_at).toLocaleDateString()}</td>
                              <td className="py-2 pr-4">
                                {r.is_active
                                  ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">Active</span>
                                  : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Inactive</span>}
                              </td>
                              <td className="py-2">
                                {!r.is_active && (
                                  <button onClick={() => activateRelease(r.id)} className="text-xs px-2 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded">Activate</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
