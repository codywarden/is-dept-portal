"use client";

import { useState, useEffect, useRef } from "react";

interface User {
  id: string;
  name: string;
  email: string | null;
}

interface BoardRow {
  id: string;
  name: string | null;
  location: string | null;
  notes: string | null;
  allowed_users: string[] | null;
  online: boolean;
  last_seen: string | null;
  firmware_version: string | null;
  ip_address: string | null;
  wifi_ssid: string | null;
}

type EditState = {
  name: string;
  location: string;
  notes: string;
  allowed_users: string[];
};

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
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [pickerOpen, setPickerOpen] = useState<Record<string, boolean>>({});
  const pickerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/frankie/planter/devices")
      .then(r => r.ok ? r.json() : [])
      .then(setBoards)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/frankie/planter/users")
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(console.error);
  }, [canManage]);

  // Close user picker when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      for (const [id, ref] of Object.entries(pickerRefs.current)) {
        if (ref && !ref.contains(e.target as Node)) {
          setPickerOpen(prev => prev[id] ? { ...prev, [id]: false } : prev);
        }
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const startEdit = (b: BoardRow) => {
    setEditing(prev => ({
      ...prev,
      [b.id]: {
        name: b.name ?? "",
        location: b.location ?? "",
        notes: b.notes ?? "",
        allowed_users: b.allowed_users ?? [],
      },
    }));
  };

  const cancelEdit = (id: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n; });
    setPickerOpen(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const saveBoard = async (id: string) => {
    const vals = editing[id];
    if (!vals) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/frankie/planter/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: vals.name || null,
          location: vals.location || null,
          notes: vals.notes || null,
          allowed_users: vals.allowed_users.length > 0 ? vals.allowed_users : null,
        }),
      });
      if (res.ok) {
        setBoards(prev => prev.map(b => b.id === id ? {
          ...b,
          name: vals.name || null,
          location: vals.location || null,
          notes: vals.notes || null,
          allowed_users: vals.allowed_users.length > 0 ? vals.allowed_users : null,
        } : b));
        cancelEdit(id);
        setSaved(prev => ({ ...prev, [id]: true }));
        setTimeout(() => setSaved(prev => { const n = { ...prev }; delete n[id]; return n; }), 2000);

        if (vals.name) {
          fetch("/api/frankie/planter/commands", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: "set_device_name", string_value: vals.name, device_id: id }),
          }).catch(console.error);
        }
      }
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  };

  const toggleUser = (boardId: string, userId: string) => {
    setEditing(prev => {
      const current = prev[boardId];
      if (!current) return prev;
      const already = current.allowed_users.includes(userId);
      return {
        ...prev,
        [boardId]: {
          ...current,
          allowed_users: already
            ? current.allowed_users.filter(u => u !== userId)
            : [...current.allowed_users, userId],
        },
      };
    });
  };

  const getUserLabel = (allowed: string[] | null): string => {
    if (!allowed || allowed.length === 0) return "All users";
    return allowed
      .map(uid => users.find(u => u.id === uid)?.name ?? uid)
      .join(", ");
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
              const isPickerOpen = !!pickerOpen[b.id];
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

                    {/* User access — visible to managers at all times, editable when editing */}
                    {canManage && (
                      <div className="col-span-2 md:col-span-3 mt-1">
                        <span className="text-gray-400">User Access</span>
                        <div className="mt-0.5">
                          {isEditing ? (
                            <div
                              className="relative"
                              ref={el => { pickerRefs.current[b.id] = el; }}
                            >
                              <button
                                type="button"
                                onClick={() => setPickerOpen(prev => ({ ...prev, [b.id]: !prev[b.id] }))}
                                className="flex items-center gap-1.5 border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 hover:border-green-500 focus:outline-none focus:border-green-500 w-full text-left"
                              >
                                <span className="flex-1 truncate">
                                  {vals.allowed_users.length === 0
                                    ? "All users with planter access"
                                    : `${vals.allowed_users.length} user${vals.allowed_users.length !== 1 ? "s" : ""} selected`}
                                </span>
                                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isPickerOpen ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                </svg>
                              </button>
                              {isPickerOpen && (
                                <div className="absolute z-10 left-0 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-y-auto">
                                  {users.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-gray-400 italic">Loading users…</p>
                                  ) : (
                                    users.map(u => (
                                      <label
                                        key={u.id}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={vals.allowed_users.includes(u.id)}
                                          onChange={() => toggleUser(b.id, u.id)}
                                          className="w-3 h-3 rounded accent-green-600"
                                        />
                                        <span className="text-xs text-gray-800 font-medium flex-1">{u.name}</span>
                                        {u.email && <span className="text-xs text-gray-400 truncate max-w-[120px]">{u.email}</span>}
                                      </label>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className={`text-xs font-medium ${!b.allowed_users || b.allowed_users.length === 0 ? "text-gray-400 italic" : "text-gray-700"}`}>
                              {getUserLabel(b.allowed_users)}
                            </span>
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
