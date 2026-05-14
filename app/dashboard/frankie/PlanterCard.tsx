"use client";

import { useState, useEffect, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

export default function PlanterCard() {
  const [planter, setPlanter] = useState<PlanterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
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

    const ch = supabase
      .channel("planter_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planter_status" },
        (payload) => { if (payload.new) setPlanter(deriveStatus(payload.new)); }
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED")   setRealtimeStatus("connected");
        else if (s === "CLOSED" || s === "CHANNEL_ERROR") setRealtimeStatus("disconnected");
      });

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); channelRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
