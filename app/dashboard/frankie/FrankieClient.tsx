"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface FrankieClientProps {
  role: "admin" | "verifier" | "viewer";
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

export default function FrankieClient({ role, profile }: FrankieClientProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [lastCommand, setLastCommand] = useState<string>("");
  const [esp32Status, setEsp32Status] = useState<ESP32Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [smallMovePixels, setSmallMovePixels] = useState(200);
  const [largeMovePixels, setLargeMovePixels] = useState(500);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [trackpadSensitivity, setTrackpadSensitivity] = useState(2);

  // Only admin and verifier can control Frankie (defined early — used in hooks below)
  const canControl = role === "admin" || role === "verifier";

  // Realtime channel ref (stable across renders)
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Trackpad state (refs to avoid stale closures in pointer handlers)
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

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") setRealtimeStatus("connected");
      else if (status === "CLOSED" || status === "CHANNEL_ERROR") setRealtimeStatus("disconnected");
    });

    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast a command directly via Realtime (no DB write — for high-freq mouse moves)
  const broadcastCommand = useCallback((payload: Record<string, unknown>) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "command", payload });
  }, []);

  // ── Trackpad pointer handlers ─────────────────────────────────────────────
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
    if (now - lastSendTime.current < 16) return; // cap at ~60fps
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
    // If barely moved, treat as a click
    const totalDx = Math.abs(e.clientX - dragStartPos.current.x);
    const totalDy = Math.abs(e.clientY - dragStartPos.current.y);
    if (totalDx < 5 && totalDy < 5 && canControl) {
      broadcastCommand({ command: "mouse_click" });
      setLastCommand(`mouse_click (tap) - ${new Date().toLocaleTimeString()}`);
    }
  }, [canControl, broadcastCommand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll ESP32 status every 10 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/frankie/status");
        if (response.ok) {
          const data = await response.json();
          setEsp32Status(data);
          if (role === "admin") fetchFirmwareData(data.firmware_version);
        }
      } catch (error) {
        console.error("Failed to fetch ESP32 status:", error);
      } finally {
        setStatusLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFirmwareData = async (deviceVersion?: string | null) => {
    try {
      const [releasesRes, checkRes] = await Promise.all([
        fetch("/api/frankie/firmware"),
        fetch(`/api/frankie/firmware?version=${deviceVersion ?? ""}`),
      ]);
      if (releasesRes.ok) {
        // Reuse the check endpoint but get all releases via supabase client
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data } = await supabase
          .from("frankie_firmware_releases")
          .select("id, version, notes, is_active, created_at")
          .order("created_at", { ascending: false });
        if (data) setFirmwareReleases(data);
      }
      if (checkRes.ok) {
        setFirmwareCheck(await checkRes.json());
      }
    } catch (e) {
      console.error("Failed to fetch firmware data:", e);
    }
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
      setFirmwareMsg(`v${data.version} uploaded successfully`);
      setFirmwareFile(null);
      setFirmwareVersion("");
      setFirmwareNotes("");
      fetchFirmwareData(esp32Status?.firmware_version);
    } catch (e: any) {
      setFirmwareMsg(`Error: ${e.message}`);
    } finally {
      setFirmwareUploading(false);
    }
  };

  const activateRelease = async (id: number) => {
    const res = await fetch("/api/frankie/firmware", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setFirmwareMsg("Release activated");
      fetchFirmwareData(esp32Status?.firmware_version);
    }
  };

  const pushOTAUpdate = () => sendCommand("ota_update");

  // mouse_move goes direct via Realtime (no DB write — can be high-frequency)
  // enter / mouse_click / ota_update go through the API route (saved to DB + broadcast)
  const sendMouseMove = useCallback((x: number, y: number) => {
    if (!canControl) return;
    broadcastCommand({ command: "mouse_move", x, y, relative: true });
    setLastCommand(`mouse_move (${x > 0 ? "+" : ""}${x}, ${y > 0 ? "+" : ""}${y}) - ${new Date().toLocaleTimeString()}`);
  }, [canControl, broadcastCommand]);

  const sendCommand = async (command: "enter" | "mouse_click" | "ota_update") => {
    setLoading(true);
    setStatus("Sending command...");
    try {
      const response = await fetch("/api/frankie/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!response.ok) throw new Error("Failed to send command");
      setLastCommand(`${command} - ${new Date().toLocaleTimeString()}`);
      setStatus(`✅ ${command.replace(/_/g, " ").toUpperCase()} sent!`);
      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      setStatus("❌ Error sending command");
      console.error(error);
      setTimeout(() => setStatus(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-green-800 mb-2">
            🚜 Frankie the Autonomous Tractor
          </h1>
          <p className="text-xl text-green-700">Remote Control Dashboard</p>
          <p className="text-sm text-green-600 mt-2">
            Welcome, {profile.firstName} ({role})
          </p>
        </div>

        {/* Permission Check */}
        {!canControl && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-8 rounded">
            <p className="text-yellow-700">
              ⚠️ Your role ({role}) does not have permission to control Frankie.
            </p>
          </div>
        )}

        {/* Control Panel */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8 border-t-4 border-green-700">
          <h2 className="text-2xl font-semibold text-green-800 mb-6">Control Panel</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Enter Button */}
            <button
              onClick={() => sendCommand("enter")}
              disabled={loading || !canControl}
              className={`py-6 px-8 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 active:scale-95 ${
                canControl
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              } ${loading ? "opacity-75" : ""}`}
            >
              ⌨️ Enter Button
            </button>

            {/* Mouse Click */}
            <button
              onClick={() => {
                broadcastCommand({ command: "mouse_click" });
                setLastCommand(`mouse_click - ${new Date().toLocaleTimeString()}`);
              }}
              disabled={!canControl}
              className={`py-6 px-8 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 active:scale-95 ${
                canControl
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              🖱️ Mouse Click
            </button>
          </div>

          {/* Live Trackpad */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-green-800">Live Trackpad</h3>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span>Sensitivity:</span>
                {[1, 2, 3, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setTrackpadSensitivity(s)}
                    className={`px-2 py-0.5 rounded text-xs font-semibold border transition-all ${
                      trackpadSensitivity === s
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-green-700 border-green-300 hover:bg-green-50"
                    }`}
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
              className={`w-full h-48 rounded-xl border-2 flex items-center justify-center select-none transition-colors ${
                canControl
                  ? "border-green-400 bg-green-50 cursor-crosshair hover:bg-green-100 active:bg-green-200"
                  : "border-gray-200 bg-gray-50 cursor-not-allowed"
              }`}
              style={{ touchAction: "none" }}
            >
              <p className={`text-sm pointer-events-none ${canControl ? "text-green-500" : "text-gray-400"}`}>
                {canControl ? "drag to move mouse · tap to click" : "no permission"}
              </p>
            </div>
          </div>

          {/* Directional Nudge Buttons */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-green-800 mb-4">Nudge</h3>
            <div className="flex justify-center gap-20">
              {/* Small */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-blue-600">Small</span>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => sendMouseMove(0, -smallMovePixels)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>↑</button>
                  <div className="flex gap-1">
                    <button onClick={() => sendMouseMove(-smallMovePixels, 0)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>←</button>
                    <button onClick={() => sendMouseMove(smallMovePixels, 0)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>→</button>
                  </div>
                  <button onClick={() => sendMouseMove(0, smallMovePixels)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>↓</button>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <label className="text-xs text-green-700">px:</label>
                  <input type="number" min="1" max="1000" value={smallMovePixels} onChange={(e) => setSmallMovePixels(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))} className="w-14 px-1 py-0.5 border border-green-300 rounded text-xs" disabled={!canControl} />
                </div>
              </div>
              {/* Large */}
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-purple-600">Large</span>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => sendMouseMove(0, -largeMovePixels)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-purple-500 hover:bg-purple-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>↑</button>
                  <div className="flex gap-1">
                    <button onClick={() => sendMouseMove(-largeMovePixels, 0)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-purple-500 hover:bg-purple-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>←</button>
                    <button onClick={() => sendMouseMove(largeMovePixels, 0)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-purple-500 hover:bg-purple-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>→</button>
                  </div>
                  <button onClick={() => sendMouseMove(0, largeMovePixels)} disabled={!canControl} className={`py-1 px-3 rounded text-xs font-semibold ${canControl ? "bg-purple-500 hover:bg-purple-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>↓</button>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <label className="text-xs text-green-700">px:</label>
                  <input type="number" min="1" max="1000" value={largeMovePixels} onChange={(e) => setLargeMovePixels(Math.max(1, Math.min(1000, parseInt(e.target.value) || 1)))} className="w-14 px-1 py-0.5 border border-green-300 rounded text-xs" disabled={!canControl} />
                </div>
              </div>
            </div>
          </div>

          {/* Status Display */}
          {status && (
            <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded mb-6">
              <p className="text-green-700 font-semibold">{status}</p>
            </div>
          )}

          {/* Last Command */}
          {lastCommand && (
            <div className="bg-gray-50 border-l-4 border-green-600 p-4 rounded">
              <p className="text-gray-600 text-sm">
                Last command: <span className="font-semibold text-green-700">{lastCommand}</span>
              </p>
            </div>
          )}
        </div>

        {/* Firmware Management - Admin Only */}
        {role === "admin" && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8 border-t-4 border-yellow-500">
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Firmware Management</h2>

            {/* Update available banner */}
            {firmwareCheck?.update_available && (
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded mb-6 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-yellow-800">Update available: v{firmwareCheck.version}</p>
                  {firmwareCheck.notes && <p className="text-sm text-yellow-700">{firmwareCheck.notes}</p>}
                  <p className="text-xs text-yellow-600 mt-1">Device is running v{esp32Status?.firmware_version ?? "unknown"}</p>
                </div>
                <button
                  onClick={pushOTAUpdate}
                  disabled={loading || esp32Status?.status !== "online"}
                  className="ml-4 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Push Update
                </button>
              </div>
            )}

            {/* Upload new firmware */}
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 mb-3">Upload New Firmware</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Version (e.g. 1.0.1)</label>
                  <input
                    type="text"
                    placeholder="1.0.1"
                    value={firmwareVersion}
                    onChange={(e) => setFirmwareVersion(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Firmware File (.bin)</label>
                  <input
                    type="file"
                    accept=".bin"
                    onChange={(e) => setFirmwareFile(e.target.files?.[0] ?? null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm text-gray-600 mb-1">Release Notes (optional)</label>
                <input
                  type="text"
                  placeholder="What changed in this version?"
                  value={firmwareNotes}
                  onChange={(e) => setFirmwareNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={firmwareSetActive}
                    onChange={(e) => setFirmwareSetActive(e.target.checked)}
                    className="w-4 h-4"
                  />
                  Set as active update target
                </label>
                <button
                  onClick={uploadFirmware}
                  disabled={firmwareUploading || !firmwareFile || !firmwareVersion}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {firmwareUploading ? "Uploading..." : "Upload Firmware"}
                </button>
              </div>
              {firmwareMsg && (
                <p className="mt-2 text-sm text-gray-600">{firmwareMsg}</p>
              )}
            </div>

            {/* Release history */}
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
                              : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Inactive</span>
                            }
                          </td>
                          <td className="py-2">
                            {!r.is_active && (
                              <button
                                onClick={() => activateRelease(r.id)}
                                className="text-xs px-2 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded"
                              >
                                Activate
                              </button>
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

        {/* Info Section - John Deere Green */}
        <div className="bg-green-700 rounded-lg p-8 border border-green-800 text-white">
          <h3 className="font-semibold text-green-100 mb-4">📡 Connection Status</h3>
          <div className="space-y-2 text-sm text-green-100">
            {/* ESP32 Connection Status */}
            <div className="flex items-center space-x-2">
              {statusLoading ? (
                <span className="text-yellow-300">⏳ Checking ESP32 status...</span>
              ) : esp32Status?.status === "online" ? (
                <span className="text-green-300">🟢 ESP32 Online</span>
              ) : (
                <span className="text-red-300">🔴 ESP32 Offline</span>
              )}
            </div>

            {esp32Status && (
              <div className="text-xs text-green-200 space-y-1">
                {esp32Status.ip_address && (
                  <p>IP: {esp32Status.ip_address}</p>
                )}
                {esp32Status.wifi_ssid && (
                  <p>WiFi: {esp32Status.wifi_ssid}</p>
                )}
                {esp32Status.last_seen && (
                  <p>Last seen: {new Date(esp32Status.last_seen).toLocaleTimeString()}</p>
                )}
                {esp32Status.seconds_since_last_seen !== undefined && (
                  <p>Seconds ago: {esp32Status.seconds_since_last_seen}</p>
                )}
                {esp32Status.firmware_version && (
                  <p>Firmware: v{esp32Status.firmware_version}
                    {firmwareCheck?.update_available && (
                      <span className="ml-2 text-yellow-300">(v{firmwareCheck.version} available)</span>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center space-x-2">
              {realtimeStatus === "connected" ? (
                <span className="text-green-300">🟢 Realtime: live (~50ms)</span>
              ) : realtimeStatus === "connecting" ? (
                <span className="text-yellow-300">⏳ Realtime: connecting...</span>
              ) : (
                <span className="text-red-300">🔴 Realtime: disconnected</span>
              )}
            </div>
            <p>🖱️ Trackpad streams mouse movement directly</p>
            <p>⌨️ Enter &amp; OTA saved to database + broadcast</p>
          </div>
        </div>
      </div>
    </div>
  );
}
