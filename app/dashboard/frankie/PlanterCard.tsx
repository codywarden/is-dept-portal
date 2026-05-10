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
          <span className="text-xs text-gray-300">
            {realtimeStatus === "connected" ? "⚡ live" : realtimeStatus === "connecting" ? "⏳" : "○ polling"}
          </span>
        </div>
      </div>

      <div className="px-6 py-4">

        {/* Offline state */}
        {!online && !loading && (
          <p className="text-sm text-gray-400 text-center py-6">
            {planter?.last_seen
              ? `Last seen ${Math.round((planter.seconds_since_last_seen ?? 0) / 60)} min ago`
              : "Never connected"}
          </p>
        )}

        {online && planter && (
          <>
            {/* Triggered alert */}
            {planter.output_on && (
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
              <StatusCard label="SPEED" value={`${(planter.speed_mph ?? 0).toFixed(1)} MPH`} />
              <StatusCard
                label="HEIGHT"
                value={planter.height ?? "--"}
                highlight={planter.height === "DOWN"}
              />
              <StatusCard
                label="ARMED"
                value={planter.output_on ? "TRIGGERED" : planter.armed ? "ARMED" : "NOT ARMED"}
                alarm={!!planter.output_on}
                ok={!!planter.armed && !planter.output_on}
                warn={!planter.armed && !planter.output_on}
              />
            </div>

            {/* Section: Sensors */}
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sensors</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              <StatusCard
                label="SENTINEL"
                value={!planter.sentinel_en ? "OFF" : !planter.armed ? "NOT ARMED" : planter.sentinel_alarm ? "ALARM" : "OK"}
                alarm={!!planter.sentinel_alarm}
                ok={planter.sentinel_en === true && !!planter.armed && !planter.sentinel_alarm}
                warn={planter.sentinel_en === true && !planter.armed}
                dim={!planter.sentinel_en}
              />
              <StatusCard
                label="SEEDING"
                value={!planter.seed_en ? "OFF" : !planter.armed ? "NOT ARMED" : planter.seed_fault ? `ROW ${planter.seed_fault_row}` : "OK"}
                alarm={!!planter.seed_fault}
                ok={planter.seed_en === true && !!planter.armed && !planter.seed_fault}
                warn={planter.seed_en === true && !planter.armed}
                dim={!planter.seed_en}
              />
              <StatusCard
                label="VACUUM"
                value={!planter.vac_en ? "OFF" : !planter.armed ? "NOT ARMED" : planter.vac_fault ? "FAULT" : "OK"}
                alarm={!!planter.vac_fault}
                ok={planter.vac_en === true && !!planter.armed && !planter.vac_fault}
                warn={planter.vac_en === true && !planter.armed}
                dim={!planter.vac_en}
              />
            </div>

            {/* Section: Application Rates (sentinel only) */}
            {planter.sentinel_en && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Application Rates</p>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <StatusCard
                    label="TARGET RATE"
                    value={planter.sentinel_target_gal != null ? `${planter.sentinel_target_gal.toFixed(2)} gal/ac` : "--"}
                  />
                  <StatusCard
                    label="AVG ACTUAL"
                    value={planter.sentinel_avg_gal != null ? `${planter.sentinel_avg_gal.toFixed(2)} gal/ac` : "--"}
                  />
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex justify-between items-center text-xs text-gray-400 pt-3 border-t border-gray-100">
              <span>{planter.wifi_ssid ?? ""}</span>
              <span>thresh {planter.live_thresh ?? "--"}%</span>
              {planter.last_seen && (
                <span>updated {new Date(planter.last_seen).toLocaleTimeString()}</span>
              )}
            </div>
          </>
        )}
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
