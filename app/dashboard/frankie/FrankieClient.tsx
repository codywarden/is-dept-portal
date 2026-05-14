"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import FirmwareCard from "./FirmwareCard";
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
  canManageFirmware?: boolean;
}

interface ESP32Status {
  status: "online" | "offline";
  last_seen: string | null;
  ip_address: string | null;
  wifi_ssid: string | null;
  firmware_version: string | null;
  seconds_since_last_seen: number;
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

export default function FrankieClient({ role, profile, canManageFirmware = false }: FrankieClientProps) {
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

  const canControl = role === "admin" || profile.pagePermissions?.["frankie"] === true || profile.pagePermissions?.["frankie/remote"] === true;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const lastSendTime = useRef(0);

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
        }
      } catch (e) { console.error(e); }
      finally { setStatusLoading(false); }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
          <h1 className="text-4xl font-bold text-green-800 mb-1">🎮 Remote</h1>
          <p className="text-green-700">Frankie Remote Control</p>
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
                  <p>Firmware: v{esp32Status.firmware_version}</p>
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

        <FirmwareCard canManageFirmware={canManageFirmware} />

      </div>
    </div>
  );
}
