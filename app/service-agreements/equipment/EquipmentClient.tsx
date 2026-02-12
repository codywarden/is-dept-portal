"use client";

import BackButton from "../../components/BackButton";
import { useEffect, useState } from "react";

type Role = "admin" | "verifier" | "viewer";

type Equipment = {
  id: string;
  serial: string;
  model?: string;
  receiver_id?: string;
  updated_at?: string;
};

export default function EquipmentClient({ role }: { role: Role }) {
  const [items, setItems] = useState<Equipment[]>([]);
  const [serial, setSerial] = useState("");
  const [model, setModel] = useState("");
  const [receiver, setReceiver] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load equipment from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/service-agreements/equipment");
        if (!res.ok) return;
        const { data } = await res.json();
        setItems(data || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  async function addItem() {
    if (!serial.trim()) return setMsg("Serial required");
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/service-agreements/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial: serial.trim(),
          model: model.trim() || null,
          receiver_id: receiver.trim() || null,
        }),
      });

      const { data, error } = await res.json();
      setLoading(false);

      if (!res.ok) return setMsg(error || "Failed to add equipment");

      setItems((s) => [data, ...s]);
      setSerial("");
      setModel("");
      setReceiver("");
      setMsg("Equipment added ✅");
    } catch (err) {
      setLoading(false);
      setMsg("Error adding equipment");
      console.error(err);
    }
  }

  async function updateItem(id: string, patch: Partial<Pick<Equipment, "receiver_id">>) {
    try {
      const res = await fetch("/api/service-agreements/equipment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch }),
      });

      if (!res.ok) return setMsg("Failed to update equipment");
      setItems((s) => s.map((it) => (it.id === id ? { ...it, ...patch, updated_at: new Date().toISOString() } : it)));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />
      <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B", marginBottom: 16 }}>Equipment</h1>
      {msg && (
        <div
          style={{
            marginBottom: 12,
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

      {role === "viewer" && (
        <div style={{ marginBottom: 16, background: "#f9fafb", padding: 12, borderRadius: 10 }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, color: "#000" }}>Add Equipment</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}>
            <input
              placeholder="Serial #"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}
            />
            <input
              placeholder="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}
            />
            <input
              placeholder="Receiver ID"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}
            />
            <button
              onClick={addItem}
              disabled={loading}
              style={{
                backgroundColor: "#367C2B",
                color: "#FFC72C",
                padding: "10px 16px",
                borderRadius: 6,
                fontWeight: 600,
                border: "2px solid #FFC72C",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              background: "#f9fafb",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "#111827" }}>{it.serial}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                {it.model ?? "—"} • Receiver: {it.receiver_id ?? "—"}
              </div>
              {it.updated_at && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  Updated: {new Date(it.updated_at).toLocaleString()}
                </div>
              )}
            </div>
            {role === "viewer" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="Receiver ID"
                  value={it.receiver_id ?? ""}
                  onChange={(e) => updateItem(it.id, { receiver_id: e.target.value })}
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", minWidth: 120, background: "white", color: "#000", fontWeight: 500 }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
