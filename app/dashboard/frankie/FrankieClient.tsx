"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";

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

export default function FrankieClient({ role, profile }: FrankieClientProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [lastCommand, setLastCommand] = useState<string>("");
  const [esp32Status, setEsp32Status] = useState<ESP32Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [smallMovePixels, setSmallMovePixels] = useState(5);
  const [largeMovePixels, setLargeMovePixels] = useState(25);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Poll ESP32 status every 5 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/frankie/status");
        if (response.ok) {
          const data = await response.json();
          setEsp32Status(data);
        }
      } catch (error) {
        console.error("Failed to fetch ESP32 status:", error);
      } finally {
        setStatusLoading(false);
      }
    };

    // Initial fetch
    fetchStatus();

    // Set up polling
    const interval = setInterval(fetchStatus, 10000);  // 10 seconds (reduced from 5)

    return () => clearInterval(interval);
  }, []);

  const sendCommand = async (command: "enter" | "mouse_click" | "mouse_move", mouseX?: number, mouseY?: number) => {
    setLoading(true);
    setStatus("Sending command...");

    try {
      const payload: any = { command };
      if (command === "mouse_move") {
        payload.mouse_x = mouseX || 0;
        payload.mouse_y = mouseY || 0;
        payload.mouse_relative = true; // relative movement
      }

      const response = await fetch("/api/frankie/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to send command");
      }

      const data = await response.json();
      setLastCommand(`${command}${mouseX !== undefined ? ` (${mouseX},${mouseY})` : ""} - ${new Date().toLocaleTimeString()}`);
      setStatus(`✅ ${command.replace("_", " ").toUpperCase()} sent!`);

      setTimeout(() => setStatus(""), 2000);
    } catch (error) {
      setStatus("❌ Error sending command");
      console.error(error);
      setTimeout(() => setStatus(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Only admin and verifier can control Frankie
  const canControl = role === "admin" || role === "verifier";

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
              onClick={() => sendCommand("mouse_click")}
              disabled={loading || !canControl}
              className={`py-6 px-8 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 active:scale-95 ${
                canControl
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              } ${loading ? "opacity-75" : ""}`}
            >
              🖱️ Mouse Click
            </button>
          </div>

          {/* Mouse Movement Controls */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-green-800 mb-6">Mouse Movement</h3>
            
            {/* Two Column Layout */}
            <div className="flex justify-center gap-20 mb-8">
              {/* Small Moves Column */}
              <div className="flex flex-col items-center">
                <h4 className="font-semibold text-green-700 mb-3">Small Moves</h4>

                {/* Directional Buttons */}
                <div className="flex flex-col items-center justify-center gap-3 mb-4">
                  {/* Up */}
                  <button
                    onClick={() => sendCommand("mouse_move", 0, -smallMovePixels)}
                    disabled={loading || !canControl}
                    className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                      canControl
                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    } ${loading ? "opacity-75" : ""}`}
                  >
                    ↑
                  </button>

                  {/* Left and Right */}
                  <div className="flex gap-3 items-center">
                    <button
                      onClick={() => sendCommand("mouse_move", -smallMovePixels, 0)}
                      disabled={loading || !canControl}
                      className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                        canControl
                          ? "bg-blue-500 hover:bg-blue-600 text-white"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      } ${loading ? "opacity-75" : ""}`}
                    >
                      ←
                    </button>
                    <button
                      onClick={() => sendCommand("mouse_move", smallMovePixels, 0)}
                      disabled={loading || !canControl}
                      className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                        canControl
                          ? "bg-blue-500 hover:bg-blue-600 text-white"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      } ${loading ? "opacity-75" : ""}`}
                    >
                      →
                    </button>
                  </div>

                  {/* Down */}
                  <button
                    onClick={() => sendCommand("mouse_move", 0, smallMovePixels)}
                    disabled={loading || !canControl}
                    className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                      canControl
                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    } ${loading ? "opacity-75" : ""}`}
                  >
                    ↓
                  </button>
                </div>

                {/* Pixel Adjustment */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-green-700">Pixels:</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={smallMovePixels}
                    onChange={(e) => setSmallMovePixels(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    className="w-12 px-2 py-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    disabled={!canControl}
                  />
                </div>
              </div>

              {/* Large Moves Column */}
              <div className="flex flex-col items-center">
                <h4 className="font-semibold text-green-700 mb-3">Large Moves</h4>

                {/* Directional Buttons */}
                <div className="flex flex-col items-center justify-center gap-3 mb-4">
                  {/* Up */}
                  <button
                    onClick={() => sendCommand("mouse_move", 0, -largeMovePixels)}
                    disabled={loading || !canControl}
                    className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                      canControl
                        ? "bg-purple-500 hover:bg-purple-600 text-white"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    } ${loading ? "opacity-75" : ""}`}
                  >
                    ↑
                  </button>

                  {/* Left and Right */}
                  <div className="flex gap-3 items-center">
                    <button
                      onClick={() => sendCommand("mouse_move", -largeMovePixels, 0)}
                      disabled={loading || !canControl}
                      className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                        canControl
                          ? "bg-purple-500 hover:bg-purple-600 text-white"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      } ${loading ? "opacity-75" : ""}`}
                    >
                      ←
                    </button>
                    <button
                      onClick={() => sendCommand("mouse_move", largeMovePixels, 0)}
                      disabled={loading || !canControl}
                      className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                        canControl
                          ? "bg-purple-500 hover:bg-purple-600 text-white"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      } ${loading ? "opacity-75" : ""}`}
                    >
                      →
                    </button>
                  </div>

                  {/* Down */}
                  <button
                    onClick={() => sendCommand("mouse_move", 0, largeMovePixels)}
                    disabled={loading || !canControl}
                    className={`py-1 px-2 rounded font-semibold text-xs transition-all ${
                      canControl
                        ? "bg-purple-500 hover:bg-purple-600 text-white"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    } ${loading ? "opacity-75" : ""}`}
                  >
                    ↓
                  </button>
                </div>

                {/* Pixel Adjustment */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-green-700">Pixels:</label>
                  <input
                    type="number"
                    min="10"
                    max="50"
                    value={largeMovePixels}
                    onChange={(e) => setLargeMovePixels(Math.max(10, Math.min(50, parseInt(e.target.value) || 10)))}
                    className="w-12 px-2 py-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                    disabled={!canControl}
                  />
                </div>
              </div>
            </div>

            {/* Coordinate Input */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-green-700">X:</label>
                <input
                  type="number"
                  id="mouseX"
                  defaultValue="0"
                  className="w-20 px-3 py-2 border border-green-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={!canControl}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-green-700">Y:</label>
                <input
                  type="number"
                  id="mouseY"
                  defaultValue="0"
                  className="w-20 px-3 py-2 border border-green-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                  disabled={!canControl}
                />
              </div>
              <button
                onClick={() => {
                  const xInput = document.getElementById('mouseX') as HTMLInputElement;
                  const yInput = document.getElementById('mouseY') as HTMLInputElement;
                  const x = parseInt(xInput.value) || 0;
                  const y = parseInt(yInput.value) || 0;
                  sendCommand("mouse_move", x, y);
                }}
                disabled={loading || !canControl}
                className={`py-2 px-4 rounded font-semibold transition-all ${
                  canControl
                    ? "bg-blue-500 hover:bg-blue-600 text-white shadow"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                } ${loading ? "opacity-75" : ""}`}
              >
                Move Mouse
              </button>
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
              </div>
            )}

            <p>✅ Connected to Frankie control system</p>
            <p>🌐 Ready to receive commands</p>
            <p>⏱️ Commands processed in real-time</p>
          </div>
        </div>
      </div>
    </div>
  );
}
