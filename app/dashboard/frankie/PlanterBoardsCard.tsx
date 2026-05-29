"use client";

import { useState, useEffect } from "react";

interface BoardRow {
  id: string;
  name: string | null;
  location: string | null;
  notes: string | null;
  online: boolean;
  last_seen: string | null;
  firmware_version: string | null;
  ip_address: string | null;
  wifi_ssid: string | null;
}

function timeAgo(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PlanterBoardsCard({ canManage = false }: { canManage?: boolean }) {
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, { name: string; location: string; notes: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/frankie/planter/devices")
      .then(r => r.ok ? r.json() : [])
      .then(setBoards)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const startEdit = (b: BoardRow) => {
    setEditing(prev => ({
      ...prev,
      [b.id]: { name: b.name ?? "", location: b.location ?? "", notes: b.notes ?? "" },
    }));
  };

  const cancelEdit = (id: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveBoard = async (id: string) => {
    const vals = editing[id];
    if (!vals) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/frankie/planter/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: vals.name || null, location: vals.location || null, notes: vals.notes || null }),
      });
      if (res.ok) {
        setBoards(prev => prev.map(b => b.id === id ? { ...b, name: vals.name || null, location: vals.location || null, notes: vals.notes || null } : b));
        cancelEdit(id);
        setSaved(prev => ({ ...prev, [id]: true }));
        setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[id]; return n; }), 2000);
      }
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden border-t-4 border-gray-300 mt-4">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">📋 Planter Boards</h3>
        <span className="text-xs text-gray-400">{boards.length} board{boards.length !== 1 ? "s" : ""} registered</span>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading boards…</p>
        ) : boards.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No boards have checked in yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {boards.map((b) => {
              const isEditing = !!editing[b.id];
              const vals = editing[b.id];
              const isSaving = !!saving[b.id];
              const justSaved = !!saved[b.id];
              const displayName = b.name ?? (b.id === "default" ? "Production" : b.id.charAt(0).toUpperCase() + b.id.slice(1));

              return (
                <div key={b.id} className="py-4">
                  {/* Row header */}
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b.online ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className="font-semibold text-gray-800 text-sm truncate">
                        {isEditing ? (
                          <input
                            className="border border-gray-300 rounded px-2 py-0.5 text-sm font-semibold focus:outline-none focus:border-green-500 w-44"
                            value={vals.name}
                            placeholder={displayName}
                            onChange={e => setEditing(prev => ({ ...prev, [b.id]: { ...prev[b.id], name: e.target.value } }))}
                          />
                        ) : (
                          displayName
                        )}
                      </span>
                      <span className="text-xs text-gray-400 font-mono bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">
                        id: {b.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {justSaved && <span className="text-xs text-green-600 font-semibold">Saved ✓</span>}
                      {canManage && !isEditing && (
                        <button
                          onClick={() => startEdit(b)}
                          className="text-xs text-gray-400 hover:text-green-700 font-semibold px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          Edit
                        </button>
                      )}
                      {isEditing && (
                        <>
                          <button
                            onClick={() => cancelEdit(b.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 font-semibold px-2 py-1 rounded hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveBoard(b.id)}
                            disabled={isSaving}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 pl-4 text-xs">
                    <div>
                      <span className="text-gray-400">Location</span>
                      <div className="text-gray-700 font-medium mt-0.5">
                        {isEditing ? (
                          <input
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs w-full focus:outline-none focus:border-green-500"
                            value={vals.location}
                            placeholder="e.g. North field, Shop"
                            onChange={e => setEditing(prev => ({ ...prev, [b.id]: { ...prev[b.id], location: e.target.value } }))}
                          />
                        ) : (
                          b.location ?? <span className="text-gray-400 italic">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">Status</span>
                      <div className={`font-medium mt-0.5 ${b.online ? "text-green-600" : "text-gray-400"}`}>
                        {b.online ? "Online" : b.last_seen ? `Offline · ${timeAgo(b.last_seen)}` : "Never connected"}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400">Firmware</span>
                      <div className="text-gray-700 font-medium mt-0.5">{b.firmware_version ? `v${b.firmware_version}` : "—"}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">IP Address</span>
                      <div className="text-gray-700 font-mono mt-0.5">{b.ip_address ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Wi-Fi</span>
                      <div className="text-gray-700 font-medium mt-0.5">{b.wifi_ssid ?? "—"}</div>
                    </div>
                    <div>
                      <span className="text-gray-400">Last Seen</span>
                      <div className="text-gray-700 font-medium mt-0.5">
                        {b.last_seen ? new Date(b.last_seen).toLocaleString() : "—"}
                      </div>
                    </div>
                    {(isEditing || b.notes) && (
                      <div className="col-span-2 md:col-span-3 mt-1">
                        <span className="text-gray-400">Notes</span>
                        <div className="mt-0.5">
                          {isEditing ? (
                            <input
                              className="border border-gray-300 rounded px-2 py-0.5 text-xs w-full focus:outline-none focus:border-green-500"
                              value={vals.notes}
                              placeholder="Any notes about this board…"
                              onChange={e => setEditing(prev => ({ ...prev, [b.id]: { ...prev[b.id], notes: e.target.value } }))}
                            />
                          ) : (
                            <span className="text-gray-700 font-medium">{b.notes}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
