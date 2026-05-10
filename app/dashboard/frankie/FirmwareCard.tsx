"use client";

import { useState, useEffect, useCallback } from "react";
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

export default function FirmwareCard({ canManageFirmware }: { canManageFirmware: boolean }) {
  const [open, setOpen] = useState(false);
  const [esp32Version, setEsp32Version] = useState<string | null>(null);
  const [esp32Online, setEsp32Online] = useState(false);
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [firmwareCheck, setFirmwareCheck] = useState<FirmwareCheck | null>(null);
  const [firmwareFile, setFirmwareFile] = useState<File | null>(null);
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [firmwareNotes, setFirmwareNotes] = useState("");
  const [setActive, setSetActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [msg, setMsg] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchAll = useCallback(async () => {
    try {
      const statusRes = await fetch("/api/frankie/status");
      const statusData = statusRes.ok ? await statusRes.json() : null;
      const version = statusData?.firmware_version ?? null;
      setEsp32Version(version);
      setEsp32Online(statusData?.status === "online");

      const [, checkRes] = await Promise.all([
        fetch("/api/frankie/firmware"),
        fetch(`/api/frankie/firmware?version=${version ?? ""}`),
      ]);
      const { data } = await supabase
        .from("frankie_firmware_releases")
        .select("id, version, notes, is_active, created_at")
        .order("created_at", { ascending: false });
      if (data) setReleases(data);
      if (checkRes.ok) setFirmwareCheck(await checkRes.json());
    } catch (e) { console.error(e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (canManageFirmware) fetchAll(); }, [canManageFirmware, fetchAll]);

  if (!canManageFirmware) return null;

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
      const res = await fetch("/api/frankie/firmware", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`v${data.version} uploaded`);
      setFirmwareFile(null); setFirmwareVersion(""); setFirmwareNotes("");
      fetchAll();
    } catch (e: any) { setMsg(`Error: ${e.message}`); }
    finally { setUploading(false); }
  };

  const activate = async (id: number) => {
    const res = await fetch("/api/frankie/firmware", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { setMsg("Release activated"); fetchAll(); }
  };

  const pushOTA = async () => {
    setPushing(true);
    try {
      const res = await fetch("/api/frankie/commands", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "ota_update" }),
      });
      if (!res.ok) throw new Error("Failed");
      setMsg("OTA update pushed ✅");
    } catch { setMsg("❌ Error pushing OTA"); }
    finally { setPushing(false); }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border-t-4 border-yellow-500 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-yellow-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-gray-800">⚙️ Firmware Management</span>
          {firmwareCheck?.update_available && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-semibold">Update available</span>
          )}
        </div>
        <span className="text-gray-400 text-xl">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-6 pb-6">
          {firmwareCheck?.update_available && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded mb-6 flex items-center justify-between">
              <div>
                <p className="font-semibold text-yellow-800">v{firmwareCheck.version} available</p>
                {firmwareCheck.notes && <p className="text-sm text-yellow-700">{firmwareCheck.notes}</p>}
                <p className="text-xs text-yellow-600 mt-1">Running v{esp32Version ?? "unknown"}</p>
              </div>
              <button
                onClick={pushOTA}
                disabled={pushing || !esp32Online}
                className="ml-4 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pushing ? "Pushing..." : "Push Update"}
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
                <input type="checkbox" checked={setActive} onChange={(e) => setSetActive(e.target.checked)} className="w-4 h-4" />
                Set as active
              </label>
              <button
                onClick={upload}
                disabled={uploading || !firmwareFile || !firmwareVersion}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
            {msg && <p className="mt-2 text-sm text-gray-600">{msg}</p>}
          </div>

          {releases.length > 0 && (
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
                    {releases.map((r) => (
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
                            <button onClick={() => activate(r.id)} className="text-xs px-2 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded">Activate</button>
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
