"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface FaultEntry {
  id: number;
  occurred_at: string;
  output_on: boolean | null;
  output_reason: string | null;
  seed_fault: boolean | null;
  seed_fault_row: number | null;
  vac_fault: boolean | null;
  sentinel_alarm: boolean | null;
}

function describeFault(entry: FaultEntry): string {
  const parts: string[] = [];
  if (entry.output_on) parts.push(entry.output_reason ? `Stop: ${entry.output_reason}` : "Tractor Stop");
  if (entry.seed_fault) parts.push(`Seeding Row ${entry.seed_fault_row ?? "?"}`);
  if (entry.vac_fault) parts.push("Vacuum");
  if (entry.sentinel_alarm) parts.push("Sentinel");
  return parts.join(" · ") || "Unknown";
}

function timeAgo(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

interface PlanterStatus {
  status: "online" | "offline";
  last_seen: string | null;
  seconds_since_last_seen: number;
  firmware_version: string | null;
  ip_address: string | null;
  wifi_ssid: string | null;
  speed_mph: number | null;
  armed: boolean | null;
  height: string | null;
  height_en: boolean | null;
  output_on: boolean | null;
  output_reason: string | null;
  seed_fault: boolean | null;
  seed_fault_row: number | null;
  vac_fault: boolean | null;
  sentinel_alarm: boolean | null;
  sentinel_target_gal: number | null;
  sentinel_avg_gal: number | null;
  live_thresh: number | null;
  sentinel_en: boolean | null;
  seed_en: boolean | null;
  vac_en: boolean | null;
}

function deriveStatus(row: any): PlanterStatus {
  const secondsSinceLastSeen = row.last_seen
    ? (Date.now() - new Date(row.last_seen).getTime()) / 1000
    : Infinity;
  return {
    ...row,
    status: secondsSinceLastSeen < 90 ? "online" : "offline",
    seconds_since_last_seen: Math.round(secondsSinceLastSeen),
  };
}

const CONFIG_FIELDS = [
  { label: "Min Speed",          command: "set_min_speed",       unit: "MPH", min: 0.5,  max: 15,     step: 0.1, desc: "Speed below which faults are suppressed" },
  { label: "Seed Fault Delay",   command: "set_seed_delay",      unit: "sec", min: 1,    max: 120,    step: 1,   desc: "Delay before seed fault triggers stop output" },
  { label: "Vacuum Fault Delay", command: "set_vac_delay",       unit: "sec", min: 1,    max: 120,    step: 1,   desc: "Delay before vacuum fault triggers stop output" },
  { label: "Sentinel Delay",     command: "set_sent_delay",      unit: "sec", min: 1,    max: 120,    step: 1,   desc: "Delay before Sentinel alarm triggers stop output" },
  { label: "Output Hold",        command: "set_output_hold",     unit: "sec", min: 0,    max: 3600,   step: 1,   desc: "Hold time after fault clears (0 = latch until reset)" },
  { label: "Fallback Threshold", command: "set_fallback_thresh", unit: "%",   min: 1,    max: 99,     step: 1,   desc: "% threshold used if not received on CAN bus" },
  { label: "Sentinel Scale",     command: "set_sentinel_scale",  unit: "",    min: 1000, max: 999999, step: 1,   desc: "Raw CAN units per gal/ac" },
] as const;

export default function PlanterCard({ canControl = false }: { canControl?: boolean }) {
  const [planter, setPlanter] = useState<PlanterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>({});
  const [faultLog, setFaultLog] = useState<FaultEntry[]>([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [configVals, setConfigVals] = useState<Record<string, string>>({});
  const [configMsg, setConfigMsg] = useState<Record<string, { text: string; ok: boolean } | null>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetch("/api/frankie/planter")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPlanter(d); })
      .catch(console.error)
      .finally(() => setLoading(false));

    fetch("/api/frankie/planter/faults")
      .then(r => r.ok ? r.json() : [])
      .then(d => setFaultLog(d))
      .catch(console.error);

    const ch = supabase
      .channel("planter_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planter_status" },
        (payload) => { if (payload.new) setPlanter(deriveStatus(payload.new)); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planter_fault_log" },
        (payload) => {
          if (payload.new) setFaultLog(prev => [payload.new as FaultEntry, ...prev].slice(0, 10));
        }
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED")   setRealtimeStatus("connected");
        else if (s === "CLOSED" || s === "CHANNEL_ERROR") setRealtimeStatus("disconnected");
      });

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendToggle = async (command: string, value: boolean) => {
    setPendingToggles(prev => ({ ...prev, [command]: true }));
    try {
      await fetch("/api/frankie/planter/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, value }),
      });
    } finally {
      setPendingToggles(prev => { const n = { ...prev }; delete n[command]; return n; });
    }
  };

  const sendConfig = async (command: string, num_value: number) => {
    setConfigMsg(prev => ({ ...prev, [command]: null }));
    try {
      const res = await fetch("/api/frankie/planter/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, num_value }),
      });
      const ok = res.ok;
      setConfigMsg(prev => ({ ...prev, [command]: { text: ok ? "Queued" : "Error", ok } }));
      setTimeout(() => setConfigMsg(prev => ({ ...prev, [command]: null })), 3000);
    } catch {
      setConfigMsg(prev => ({ ...prev, [command]: { text: "Network error", ok: false } }));
      setTimeout(() => setConfigMsg(prev => ({ ...prev, [command]: null })), 3000);
    }
  };

  const online   = planter?.status === "online";
  const anyFault = planter?.output_on || planter?.seed_fault || planter?.vac_fault || planter?.sentinel_alarm;

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden border-t-4 ${anyFault ? "border-red-500" : online ? "border-green-600" : "border-gray-300"}`}>

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">🌱 Frankie Planter</h3>
        <div className="flex items-center gap-2 text-sm">
          {loading ? <span className="text-yellow-500">● checking...</span>
            : online ? <span className="text-green-500">● online</span>
            : <span className="text-red-400">● offline</span>}
          {planter?.firmware_version && (
            <span className="text-xs text-gray-400">v{planter.firmware_version}</span>
          )}
        </div>
      </div>

      <div className="px-6 py-4">

        {/* Triggered alert */}
        {online && planter?.output_on && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded mb-5">
            <p className="text-red-700 font-semibold text-sm">
              🚨 TRACTOR STOP TRIGGERED
              {planter.output_reason ? ` — ${planter.output_reason}` : ""}
            </p>
          </div>
        )}

        {/* Section: Field Metrics */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Field</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <StatusCard
            label="SPEED"
            value={online && planter?.speed_mph != null ? `${planter.speed_mph.toFixed(1)} MPH` : "—"}
            dim={!online}
          />
          <StatusCard
            label="HEIGHT"
            value={online && planter ? (planter.height ?? "—") : "—"}
            highlight={online && planter?.height === "DOWN"}
            dim={!online}
          />
          <StatusCard
            label="ARMED"
            value={!online ? "—" : planter?.output_on ? "TRIGGERED" : planter?.armed ? "ARMED" : "NOT ARMED"}
            alarm={online && !!planter?.output_on}
            ok={online && !!planter?.armed && !planter?.output_on}
            warn={online && !planter?.armed && !planter?.output_on}
            dim={!online}
          />
        </div>

        {/* Section: Sensors */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sensors</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <StatusCard
            label="SENTINEL"
            value={!online ? "—" : !planter?.sentinel_en ? "OFF" : !planter?.armed ? "NOT ARMED" : planter?.sentinel_alarm ? "ALARM" : "OK"}
            alarm={online && !!planter?.sentinel_alarm}
            ok={online && planter?.sentinel_en === true && !!planter?.armed && !planter?.sentinel_alarm}
            warn={online && planter?.sentinel_en === true && !planter?.armed}
            dim={!online || !planter?.sentinel_en}
          />
          <StatusCard
            label="SEEDING"
            value={!online ? "—" : !planter?.seed_en ? "OFF" : !planter?.armed ? "NOT ARMED" : planter?.seed_fault ? `ROW ${planter.seed_fault_row}` : "OK"}
            alarm={online && !!planter?.seed_fault}
            ok={online && planter?.seed_en === true && !!planter?.armed && !planter?.seed_fault}
            warn={online && planter?.seed_en === true && !planter?.armed}
            dim={!online || !planter?.seed_en}
          />
          <StatusCard
            label="VACUUM"
            value={!online ? "—" : !planter?.vac_en ? "OFF" : !planter?.armed ? "NOT ARMED" : planter?.vac_fault ? "FAULT" : "OK"}
            alarm={online && !!planter?.vac_fault}
            ok={online && planter?.vac_en === true && !!planter?.armed && !planter?.vac_fault}
            warn={online && planter?.vac_en === true && !planter?.armed}
            dim={!online || !planter?.vac_en}
          />
        </div>

        {/* Section: Application Rates */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Application Rates</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <StatusCard
            label="TARGET RATE"
            value={online && planter?.sentinel_target_gal != null ? `${planter.sentinel_target_gal.toFixed(2)} gal/ac` : "—"}
            dim={!online || !planter?.sentinel_en}
          />
          <StatusCard
            label="AVG ACTUAL"
            value={online && planter?.sentinel_avg_gal != null ? `${planter.sentinel_avg_gal.toFixed(2)} gal/ac` : "—"}
            dim={!online || !planter?.sentinel_en}
          />
          <StatusCard
            label="SENTINEL THRESH HOLD %"
            value={online && planter?.live_thresh != null ? `${planter.live_thresh}%` : "—"}
            dim={!online || !planter?.sentinel_en}
          />
        </div>

        {/* Section: Fault Log */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fault Log</p>
        <div className="mb-5">
          {faultLog.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No faults recorded.</p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
              {faultLog.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 px-3 py-2 bg-white hover:bg-gray-50">
                  <span className="text-xs text-red-400 mt-0.5 flex-shrink-0">⚠</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{describeFault(entry)}</p>
                    <p className="text-xs text-gray-400">{new Date(entry.occurred_at).toLocaleString()} · {timeAgo(entry.occurred_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section: Controls */}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Controls</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "HEIGHT", command: "set_height_en", value: planter?.height_en },
            { label: "SENTINEL", command: "set_sentinel_en", value: planter?.sentinel_en },
            { label: "SEEDING", command: "set_seed_en", value: planter?.seed_en },
            { label: "VACUUM", command: "set_vac_en", value: planter?.vac_en },
          ].map(({ label, command, value }) => {
            const pending = !!pendingToggles[command];
            const disabled = !online || !canControl || pending;
            const isOn = value === true;
            return (
              <div key={command} className="border rounded-lg p-3 border-gray-200 bg-gray-50">
                <div className="text-xs text-gray-400 mb-2">{label}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => !disabled && sendToggle(command, !value)}
                    disabled={disabled}
                    aria-label={`Toggle ${label}`}
                    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 bg-gray-900 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-all duration-200 ${isOn ? "translate-x-6 bg-green-400" : "translate-x-0 bg-gray-500"}`} />
                  </button>
                  <span className={`text-xs font-semibold ${!online ? "text-gray-400" : isOn ? "text-green-700" : "text-gray-400"}`}>
                    {pending ? "..." : !online ? "—" : value == null ? "—" : isOn ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {!canControl && online && (
          <p className="text-xs text-gray-400 mb-4">View only — no control permission</p>
        )}

        {/* Section: Config */}
        {canControl && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Config</p>
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-5">
              <button
                onClick={() => setConfigOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="text-sm font-semibold text-gray-700">⚙️ Planter Settings</span>
                <span className="text-gray-400 text-xs">{configOpen ? "▲ hide" : "▼ show"}</span>
              </button>
              {configOpen && (
                <div className="divide-y divide-gray-100">
                  {CONFIG_FIELDS.map(({ label, command, unit, min, max, step, desc }) => {
                    const val = configVals[command] ?? "";
                    const msg = configMsg[command];
                    const numVal = parseFloat(val);
                    const valid = val !== "" && !isNaN(numVal) && numVal >= min && numVal <= max;
                    return (
                      <div key={command} className="px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-700">{label}{unit ? ` (${unit})` : ""}</div>
                          <div className="text-xs text-gray-400">{desc} · {min}–{max}</div>
                        </div>
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={val}
                          placeholder="—"
                          onChange={e => setConfigVals(prev => ({ ...prev, [command]: e.target.value }))}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-green-500"
                          disabled={!online}
                        />
                        <button
                          onClick={() => valid && sendConfig(command, numVal)}
                          disabled={!valid || !online}
                          className={`px-3 py-1 rounded text-xs font-semibold transition-all ${valid && online ? "bg-green-600 hover:bg-green-700 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
                        >
                          Set
                        </button>
                        {msg && (
                          <span className={`text-xs font-semibold w-16 text-right ${msg.ok ? "text-green-600" : "text-red-500"}`}>
                            {msg.text}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center text-xs text-gray-400 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            {online
              ? <span className="text-green-500">● Connected</span>
              : <span className="text-red-400">● Not Connected</span>}
            {planter?.wifi_ssid && <span>· {planter.wifi_ssid}</span>}
          </div>
          {planter?.last_seen ? (
            <span>updated {new Date(planter.last_seen).toLocaleTimeString()}</span>
          ) : (
            <span>never connected</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ label, value, alarm, ok, warn, dim, highlight }: {
  label: string; value: string;
  alarm?: boolean; ok?: boolean; warn?: boolean; dim?: boolean; highlight?: boolean;
}) {
  const border = alarm     ? "border-red-300 bg-red-50"
    : ok        ? "border-green-300 bg-green-50"
    : warn      ? "border-yellow-300 bg-yellow-50"
    : highlight ? "border-green-400 bg-green-50"
    : "border-gray-200 bg-gray-50";
  const text = alarm ? "text-red-600"
    : ok   ? "text-green-700"
    : warn ? "text-yellow-700"
    : dim  ? "text-gray-400"
    : "text-gray-700";
  return (
    <div className={`border rounded-lg p-3 ${border}`}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`font-semibold text-sm ${text}`}>{value}</div>
    </div>
  );
}
