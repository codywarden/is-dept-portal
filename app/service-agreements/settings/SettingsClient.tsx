"use client";

import BackButton from "../../components/BackButton";
import { useState } from "react";

export default function SettingsClient() {
  const [msg, setMsg] = useState<string | null>(null);
  const [agreementsEnabled, setAgreementsEnabled] = useState(true);

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Service Agreements • Settings
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Admin-only settings for service agreements.
        </p>
      </header>

      <section style={{ background: "#f9fafb", padding: 20, borderRadius: 10 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 700, marginRight: 8 }}>Enable agreements:</label>
          <input type="checkbox" checked={agreementsEnabled} onChange={(e) => setAgreementsEnabled(e.target.checked)} />
        </div>

        <div>
          <button
            onClick={() => setMsg("Settings saved ✅")}
            style={{ padding: "8px 12px", background: "#367C2B", color: "#FFC72C", borderRadius: 8, border: "2px solid #FFC72C", cursor: "pointer", fontWeight: 700 }}
          >
            Save
          </button>
        </div>

        {msg && <div style={{ marginTop: 12, color: "#111827", fontWeight: 700 }}>{msg}</div>}
      </section>
    </div>
  );
}
