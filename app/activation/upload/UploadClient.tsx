"use client";

import { useState } from "react";
import BackButton from "../../components/BackButton";

type UploadResultItem = {
  id?: string;
  customer_name: string | null;
  retail_customer: string | null;
  legal_name: string | null;
  org_name: string | null;
  location: string | null;
  ordered_by: string | null;
  amount: number | null;
  currency: string | null;
  matched_customer_id: string | null;
  match_name: string | null;
};

type UploadResult = {
  fileId: string;
  itemCount: number;
  matchedCount: number;
  items: UploadResultItem[];
};

export default function UploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<"auto" | "new" | "old">("auto");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onUpload() {
    if (!file) return setMsg("Please choose a PDF file");
    setMsg(null);
    setLoading(true);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("style", style);

      const res = await fetch("/api/activation/subscriptions/upload-cost", {
        method: "POST",
        body,
      });

      const j = await res.json();
      setLoading(false);

      if (!res.ok) return setMsg(j?.error ?? "Upload failed");

      setResult(j);
      setMsg("Upload complete ✅");
    } catch (err) {
      console.error(err);
      setLoading(false);
      setMsg("Upload failed");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <BackButton />
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Upload Subscription Data
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Upload new or old style subscription PDFs. We will extract cost data and match customers.
        </p>
      </header>

      <section style={{ background: "#f9fafb", padding: 16, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", maxWidth: 640, color: "#000" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontWeight: 700 }}>Choose PDF file</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.2)",
              background: "#fff",
              color: "#000",
            }}
          />
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as "auto" | "new" | "old")}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)" }}
          >
            <option value="auto">Auto-detect style</option>
            <option value="new">New style</option>
            <option value="old">Old style</option>
          </select>
          <button
            onClick={onUpload}
            disabled={loading}
            style={{
              padding: "10px 16px",
              background: "#367C2B",
              color: "#FFC72C",
              borderRadius: 8,
              border: "2px solid #FFC72C",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {loading ? "Uploading..." : "Upload PDF"}
          </button>
        </div>

        {msg && (
          <div style={{ marginTop: 10, color: "#111827", fontWeight: 700 }}>
            {msg}
          </div>
        )}
      </section>

      {result && (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Parsed items: {result.itemCount} · Matched: {result.matchedCount}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {result.items.map((it, idx) => (
              <div
                key={idx}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  padding: 10,
                  border: "1px solid rgba(0,0,0,0.08)",
                  display: "grid",
                  gridTemplateColumns: "1.5fr 140px 140px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800 }}>
                    {it.customer_name ?? it.retail_customer ?? it.legal_name ?? "(unknown customer)"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Org: {it.org_name ?? "—"} · Location: {it.location ?? "—"} · Ordered By: {it.ordered_by ?? "—"}
                  </div>
                </div>
                <div style={{ fontWeight: 800 }}>{formatMoney(it.amount)}</div>
                <div style={{ color: it.matched_customer_id ? "#16a34a" : "#dc2626", fontWeight: 800 }}>
                  {it.matched_customer_id ? "Matched" : "Unmatched"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatMoney(value: number | null) {
  if (!value) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
