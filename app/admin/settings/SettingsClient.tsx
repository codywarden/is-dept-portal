"use client";

import { useEffect, useState } from "react";
import BackButton from "../../components/BackButton";

export default function SettingsClient() {
  const [msg, setMsg] = useState<string | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/locations");
        if (!res.ok) return;
        const j = await res.json();
        const rows = j?.data ?? [];
        setLocations(rows.map((r: { name: string }) => r.name));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addLocation() {
    setMsg(null);
    const name = newLocation.trim();
    if (!name) return setMsg("Location name required");
    const res = await fetch("/api/admin/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to add location");
    setLocations((prev) => [j.data.name, ...prev.filter((p) => p !== j.data.name)]);
    setNewLocation("");
    setMsg("Location added ✅");
  }

  async function deleteLocation(name: string) {
    setMsg(null);
    if (!confirm(`Delete location ${name}?`)) return;
    const res = await fetch("/api/admin/locations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to delete location");
    setLocations((prev) => prev.filter((p) => p !== name));
    setMsg("Location removed ✅");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#FFC72C", marginBottom: 8 }}>
          Settings
        </h1>
      </header>

      <div style={{ maxWidth: 600 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: "#111827" }}>
            Manage Locations
          </h2>
          <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
            Manage available locations used by user profiles.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="New location name"
              style={{
                padding: 10,
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.12)",
                minWidth: 220,
                background: "white",
                color: "#111827",
                fontWeight: 500,
              }}
            />
            <button
              onClick={addLocation}
              style={{
                padding: "10px 16px",
                background: "#FFC72C",
                color: "#111827",
                borderRadius: 8,
                border: "2px solid #FFC72C",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Add Location
            </button>
          </div>

          {msg && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 10,
                background: "#f9fafb",
                border: "1px solid rgba(0,0,0,0.12)",
                color: "#111827",
                fontWeight: 700,
              }}
            >
              {msg}
            </div>
          )}

          {loading ? (
            <div style={{ color: "#6b7280" }}>Loading locations...</div>
          ) : locations.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No locations yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {locations.map((l) => (
                <div
                  key={l}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "#fff",
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#000000" }}>{l}</div>
                  <button
                    onClick={() => deleteLocation(l)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#dc2626",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
