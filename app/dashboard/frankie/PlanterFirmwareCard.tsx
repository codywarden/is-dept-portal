"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";

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

interface Device {
  id: string;
  name: string | null;
}

export default function PlanterFirmwareCard({ canManage }: { canManage: boolean }) {
  const [open, setOpen]                     = useState(false);
  const [devices, setDevices]               = useState<Device[]>([]);
  const [otaTargets, setOtaTargets]         = useState<string[]>([]);
  const [esp32Version, setEsp32Version]     = useState<string | null>(null);
  const [esp32Online, setEsp32Online]       = useState(false);
  const [releases, setReleases]             = useState<FirmwareRelease[]>([]);
  const [firmwareCheck, setFirmwareCheck]   = useState<FirmwareCheck | null>(null);
  const [firmwareFile, setFirmwareFile]     = useState<File | null>(null);
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [firmwareNotes, setFirmwareNotes]   = useState("");
  const [setActive, setSetActive]           = useState(true);
  const [uploading, setUploading]           = useState(false);
  const [pushing, setPushing]               = useState(false);
  const [msg, setMsg]                       = useState("");

  type CmdStatus = { deviceId: string; name: string; commandId: number; status: "pending" | "processed" | "failed" };
  const [otaCmdStatus, setOtaCmdStatus]     = useState<CmdStatus[]>([]);
  const pollRef                             = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll command statuses until all are resolved
  useEffect(() => {
    const pending = otaCmdStatus.filter(c => c.status === "pending");
    if (pending.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(async () => {
      const ids = otaCmdStatus.map(c => c.commandId).join(",");
      const res = await fetch(`/api/frankie/planter/commands/status?ids=${ids}`);
      if (!res.ok) return;
      const rows: { id: number; status: string }[] = await res.json();
      setOtaCmdStatus(prev => prev.map(c => {
        const updated = rows.find(r => r.id === c.commandId);
        return updated ? { ...c, status: updated.status as CmdStatus["status"] } : c;
      }));
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [otaCmdStatus]);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // The device used for status/version display is always the first OTA target
  const viewDevice = otaTargets[0] ?? "default";

  const toggleTarget = (id: string) => {
    setOtaTargets(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  // Fetch device list once on mount
  useEffect(() => {
    if (!canManage) return;
    fetch("/api/frankie/planter/devices")
      .then(r => r.ok ? r.json() : [])
      .then((d: Device[]) => {
        setDevices(d);
        // Default: select all boards as OTA targets
        setOtaTargets(d.map(dev => dev.id));
      })
      .catch(console.error);
  }, [canManage]);

  const fetchAll = useCallback(async (deviceId: string) => {
    try {
      const q = `device_id=${deviceId}`;
      const statusRes = await fetch(`/api/frankie/planter?${q}`);
      const statusData = statusRes.ok ? await statusRes.json() : null;
      const version = statusData?.firmware_version ?? null;
      setEsp32Version(version);
      setEsp32Online(statusData?.status === "online");

      const checkRes = await fetch(`/api/frankie/planter/firmware?version=${version ?? ""}`);
      if (checkRes.ok) setFirmwareCheck(await checkRes.json());

      const { data } = await supabase
        .from("planter_firmware_releases")
        .select("id, version, notes, is_active, created_at")
        .order("created_at", { ascending: false });
      if (data) setReleases(data);
    } catch (e) { console.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (canManage) fetchAll(viewDevice); }, [canManage, viewDevice, fetchAll]);

  if (!canManage) return null;

  const upload = async () => {
    if (!firmwareFile || !firmwareVersion) return;
    setUploading(true);
    setMsg("Uploading...");
    const form = new FormData();
    form.append("file", firmwareFile);
    form.append("version", firmwareVersion);
    form.append("notes", firmwareNotes);
    form.append("set_active", String(setActive));
    try {
      const res = await fetch("/api/frankie/planter/firmware", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`v${data.version} uploaded`);
      setFirmwareFile(null); setFirmwareVersion(""); setFirmwareNotes("");
      fetchAll(viewDevice);
    } catch (e: unknown) {
      setMsg(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally { setUploading(false); }
  };

  const activate = async (id: number) => {
    const res = await fetch("/api/frankie/planter/firmware", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { setMsg("Release activated"); fetchAll(viewDevice); }
  };

  const pushOTA = async () => {
    if (otaTargets.length === 0) return;
    setPushing(true);
    setMsg("");
    setOtaCmdStatus([]);
    try {
      const results = await Promise.all(
        otaTargets.map(async deviceId => {
          const r = await fetch("/api/frankie/planter/commands", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "ota_update", device_id: deviceId }),
          });
          const data = r.ok ? await r.json() : null;
          return { deviceId, ok: r.ok, commandId: data?.command?.id ?? null };
        })
      );
      const statuses: CmdStatus[] = results
        .filter(r => r.ok && r.commandId)
        .map(r => ({
          deviceId: r.deviceId,
          name: devices.find(d => d.id === r.deviceId)?.name ?? r.deviceId,
          commandId: r.commandId,
          status: "pending" as const,
        }));
      setOtaCmdStatus(statuses);
      const failed = results.filter(r => !r.ok);
      setMsg(failed.length === 0
        ? `OTA queued for ${otaTargets.length} board${otaTargets.length > 1 ? "s" : ""} — watching status below`
        : `Queued ${results.length - failed.length}/${results.length} — ${failed.length} failed to send`
      );
    } catch {
      setMsg("Error sending OTA command");
    } finally { setPushing(false); }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border-t-4 border-green-600 overflow-hidden mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-green-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-800">🌱 Planter Firmware</span>
          {firmwareCheck?.update_available && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-semibold">
              Update available
            </span>
          )}
          {esp32Version && (
            <span className="text-xs text-gray-400">running v{esp32Version}</span>
          )}
        </div>
        <span className="text-gray-400 text-xl">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-6 pb-6">

          {/* Device selector — checkboxes so you can push to multiple boards at once */}
          {devices.length > 1 && (
            <div className="mb-4">
              <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">
                OTA Target Boards
              </span>
              <div className="flex flex-wrap gap-3">
                {devices.map(d => {
                  const label = d.name ?? d.id.charAt(0).toUpperCase() + d.id.slice(1);
                  const checked = otaTargets.includes(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border transition-colors ${
                        checked
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-green-400 hover:text-green-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTarget(d.id)}
                        className="sr-only"
                      />
                      {checked ? "✓ " : ""}{label}
                    </label>
                  );
                })}
              </div>
              {otaTargets.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">Select at least one board to push OTA.</p>
              )}
            </div>
          )}

          {/* Update available banner */}
          {firmwareCheck?.update_available && (
            <div className="bg-green-50 border-l-4 border-green-600 p-4 rounded mb-6 flex items-center justify-between">
              <div>
                <p className="font-semibold text-green-800">
                  v{firmwareCheck.version} available for Frankie Planter
                </p>
                {firmwareCheck.notes && (
                  <p className="text-sm text-green-700">{firmwareCheck.notes}</p>
                )}
                <p className="text-xs text-green-600 mt-1">
                  Planter currently running v{esp32Version ?? "unknown"}
                </p>
              </div>
              <button
                onClick={pushOTA}
                disabled={pushing || otaTargets.length === 0}
                title={otaTargets.length === 0 ? "Select at least one board" : `Push OTA to ${otaTargets.length} board${otaTargets.length > 1 ? "s" : ""}`}
                className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pushing ? "Sending..." : otaTargets.length > 1 ? `Push to ${otaTargets.length} Boards` : "Push to Planter"}
              </button>
            </div>
          )}

          {/* Offline warning */}
          {!esp32Online && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded mb-4 text-sm text-yellow-800">
              Planter is offline — OTA push will queue and apply when it reconnects.
            </div>
          )}

          {/* OTA command status tracker */}
          {otaCmdStatus.length > 0 && (
            <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">OTA Status</p>
              </div>
              {otaCmdStatus.map(c => (
                <div key={c.commandId} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0">
                  <span className="text-sm text-gray-700 font-medium">{c.name}</span>
                  {c.status === "pending" && (
                    <span className="flex items-center gap-1.5 text-xs text-yellow-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      Waiting for board to pick up…
                    </span>
                  )}
                  {c.status === "processed" && (
                    <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Applied ✓
                    </span>
                  )}
                  {c.status === "failed" && (
                    <span className="flex items-center gap-1.5 text-xs text-red-600 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Failed — board rejected the update
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload form */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 mb-3">Upload New Planter Firmware</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Version (X.Y.Z)</label>
                <input
                  type="text"
                  placeholder="2.7.0"
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-400"
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
                placeholder="What changed?"
                value={firmwareNotes}
                onChange={(e) => setFirmwareNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setActive}
                  onChange={(e) => setSetActive(e.target.checked)}
                  className="w-4 h-4"
                />
                Set as active release
              </label>
              <button
                onClick={upload}
                disabled={uploading || !firmwareFile || !firmwareVersion}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
          </div>

          {/* Release history */}
          {releases.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-3">Release History — Frankie Planter</h3>
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
                    {releases.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono font-semibold">v{r.version}</td>
                        <td className="py-2 pr-4 text-gray-500">{r.notes ?? "—"}</td>
                        <td className="py-2 pr-4 text-gray-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2 pr-4">
                          {r.is_active
                            ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-semibold">Active</span>
                            : <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Inactive</span>}
                        </td>
                        <td className="py-2">
                          {!r.is_active && (
                            <button
                              onClick={() => activate(r.id)}
                              className="text-xs px-2 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded"
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
    </div>
  );
}
