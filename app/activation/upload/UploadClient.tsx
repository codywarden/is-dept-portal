"use client";

import { useState } from "react";

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
  uploadNumber: number;
  itemCount: number;
  reconcliedCount: number;
  items: UploadResultItem[];
};

type SoldUploadResultItem = {
  id?: string;
  invoice_number?: string | null;
  customer_name: string | null;
  retail_price: number | null;
  description?: string | null;
  serial_number?: string | null;
  invoice_date: string | null;
  location: string | null;
  matched_customer_id: string | null;
};

type SoldUploadResult = {
  fileId: string;
  uploadNumber: number;
  itemCount: number;
  reconcliedCount: number;
  items: SoldUploadResultItem[];
};

type Role = "admin" | "manager" | "user" | "guest";

export default function UploadClient({ role }: { role: Role }) {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<"auto" | "new" | "old">("auto");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const [soldFile, setSoldFile] = useState<File | null>(null);
  const [soldMsg, setSoldMsg] = useState<string | null>(null);
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldResult, setSoldResult] = useState<SoldUploadResult | null>(null);

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

      if (!res.ok) {
        const duplicates = Array.isArray(j?.duplicates) ? (j.duplicates as string[]) : [];
        if (duplicates.length > 0) {
          const preview = duplicates.slice(0, 10).join(", ");
          const suffix = duplicates.length > 10 ? "…" : "";
          return setMsg(`Already uploaded. Duplicate Order #s: ${preview}${suffix}`);
        }
        return setMsg(j?.error ?? "Upload failed");
      }

      setResult(j);
      setMsg("Upload complete ✅");
    } catch (err) {
      console.error(err);
      setLoading(false);
      setMsg("Upload failed");
    }
  }

  async function onSoldUpload() {
    if (!soldFile) return setSoldMsg("Please choose a PDF or CSV file");
    setSoldMsg(null);
    setSoldLoading(true);
    setSoldResult(null);

    try {
      const body = new FormData();
      body.append("file", soldFile);

      const res = await fetch("/api/activation/subscriptions/upload-sold", {
        method: "POST",
        body,
      });

      const j = await res.json();
      setSoldLoading(false);

      if (!res.ok) return setSoldMsg(j?.error ?? "Upload failed");

      setSoldResult(j);
      setSoldMsg("Upload complete ✅");
    } catch (err) {
      console.error(err);
      setSoldLoading(false);
      setSoldMsg("Upload failed");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Upload Data
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Upload subscription cost PDFs and sold-to PDFs/CSVs. We will extract cost data and mark Reconclied customers.
        </p>
      </header>

      {(role === "user" || role === "guest") && (
        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fef9c3", border: "1px solid #fbbf24", color: "#92400e", fontWeight: 700, marginBottom: 16 }}>
          You have view-only access. Uploads are disabled.
        </div>
      )}

      <section style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", opacity: (role === "user" || role === "guest") ? 0.5 : 1, pointerEvents: (role === "user" || role === "guest") ? "none" : "auto" }}>
        <div style={{ background: "#f9fafb", padding: 16, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", color: "#000" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Cost Upload</div>
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
              className="btn-primary"
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
        </div>

        <div style={{ background: "#f9fafb", padding: 16, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)", color: "#000" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Sold-To Upload</div>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontWeight: 700 }}>Choose PDF or CSV file</label>
            <input
              type="file"
              accept="application/pdf,text/csv,.csv"
              onChange={(e) => setSoldFile(e.target.files?.[0] ?? null)}
              style={{
                padding: 8,
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                background: "#fff",
                color: "#000",
              }}
            />
            <button
              className="btn-primary"
              onClick={onSoldUpload}
              disabled={soldLoading}
              style={{
                padding: "10px 16px",
                background: "#367C2B",
                color: "#FFC72C",
                borderRadius: 8,
                border: "2px solid #FFC72C",
                cursor: soldLoading ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {soldLoading ? "Uploading..." : "Upload PDF/CSV"}
            </button>
          </div>

          {soldMsg && (
            <div style={{ marginTop: 10, color: "#111827", fontWeight: 700 }}>
              {soldMsg}
            </div>
          )}
        </div>
      </section>

      {result && (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            {role === "admin" ? `Upload #: ${formatUploadLabel("cost", result.uploadNumber)} · ` : ""}Parsed items: {result.itemCount} · Reconclied: {result.reconcliedCount}
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
                  {it.matched_customer_id ? "Reconclied" : "Not Reconclied"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {soldResult && (
        <section style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            {role === "admin" ? `Sold Upload #: ${formatUploadLabel("sold", soldResult.uploadNumber)} · ` : ""}Parsed items: {soldResult.itemCount} · Reconclied: {soldResult.reconcliedCount}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {soldResult.items.map((it, idx) => (
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
                    {it.customer_name ?? "(unknown customer)"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Location: {it.location ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Invoice Date: {it.invoice_date ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    Invoice #: {it.invoice_number ?? "—"}
                  </div>
                </div>
                <div style={{ fontWeight: 800 }}>{formatMoney(it.retail_price)}</div>
                <div style={{ color: it.matched_customer_id ? "#16a34a" : "#dc2626", fontWeight: 800 }}>
                  {it.matched_customer_id ? "Reconclied" : "Not Reconclied"}
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

function formatUploadLabel(kind: "cost" | "sold", uploadNumber: number | null | undefined) {
  if (!uploadNumber) return "—";
  const year = new Date().getFullYear();
  const prefix = kind === "cost" ? "C" : "R";
  return `${prefix}-${year}-${uploadNumber}`;
}
