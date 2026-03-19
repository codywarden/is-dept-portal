"use client";

import { useEffect, useState } from "react";

type PrintFile = {
  id: string;
  title: string;
  request_count: number;
  created_at: string;
};

export default function FilesClient() {
  const [files, setFiles] = useState<PrintFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const res = await fetch("/api/activation/subscriptions/location-change-files");
        const j = (await res.json()) as { files?: PrintFile[]; error?: string };
        if (!res.ok) {
          setMsg(j?.error ?? "Failed to load reprint files");
        } else {
          setFiles(j.files ?? []);
        }
      } catch (err) {
        console.error(err);
        setMsg("Failed to load reprint files");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function reprintFile(id: string) {
    setMsg(null);
    try {
      const res = await fetch(`/api/activation/subscriptions/location-change-files?id=${id}`);
      const j = (await res.json()) as { file?: { html_content?: string }; error?: string };
      if (!res.ok || !j.file?.html_content) {
        setMsg(j?.error ?? "Failed to open reprint file");
        return;
      }

      const newWindow = window.open();
      if (!newWindow) {
        setMsg("Popup blocked. Please allow popups and try again.");
        return;
      }

      // Inject watermark CSS into the HTML content
      const watermarkCSS = `
        <style>
          body::before {
            content: "REPRINT";
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 120px;
            font-weight: bold;
            color: rgba(0, 0, 0, 0.08);
            pointer-events: none;
            white-space: nowrap;
            z-index: 1;
            font-family: Arial, sans-serif;
          }
          @media print {
            body::before {
              position: fixed;
            }
          }
        </style>
      `;

      // Insert watermark CSS after the opening <head> tag
      const htmlWithWatermark = j.file.html_content.replace(
        /<head>/i,
        `<head>${watermarkCSS}`
      );

      newWindow.document.write(htmlWithWatermark);
      newWindow.document.close();
      setTimeout(() => newWindow.print(), 250);
    } catch (err) {
      console.error(err);
      setMsg("Failed to open reprint file");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Reprint Files
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Saved approval PDFs from Print New Approved.
        </p>
      </header>

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

      {loading && (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
          Loading files...
        </div>
      )}

      {!loading && files.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
          No reprint files found.
        </div>
      )}

      {!loading && files.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {files.map((file) => (
            <div
              key={file.id}
              style={{
                background: "#fff",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 10,
                padding: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: "#111827" }}>{file.title}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                  Approved Requests: {file.request_count}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  Saved: {new Date(file.created_at).toLocaleString()}
                </div>
              </div>

              <button
                className="btn-primary btn-sm"
                onClick={() => reprintFile(file.id)}
                style={{
                  padding: "8px 14px",
                  background: "#367C2B",
                  color: "#FFC72C",
                  borderRadius: 8,
                  border: "2px solid #FFC72C",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                Reprint
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
