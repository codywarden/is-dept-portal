"use client";

import { useState } from "react";
import Link from "next/link";

type Role = "admin" | "manager" | "user" | "guest";

export default function AdminDashboard({ role }: { role: Role }) {
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  async function deleteAllActivationData() {
    setDeleteMsg(null);

    const confirmed = confirm(
      "WARNING: This will clear ALL Activation data (cost, retail, and location changes). Continue?",
    );
    if (!confirmed) return;

    const confirmationText = prompt('Type "WEB DEV ONLY" to confirm:');
    if (confirmationText !== "WEB DEV ONLY") {
      setDeleteMsg('Confirmation did not match. Type exactly "WEB DEV ONLY".');
      return;
    }

    setDeletingAll(true);
    try {
      const res = await fetch("/api/admin/clear-activation-data", { method: "POST" });
      const j = await res.json();

      if (!res.ok) {
        setDeleteMsg(j?.error ?? "Failed to clear Activation data");
        return;
      }

      setDeleteMsg("All Activation data deleted ✅");
    } catch {
      setDeleteMsg("Failed to clear Activation data");
    } finally {
      setDeletingAll(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: "#367C2B", marginBottom: 12 }}>
          Admin Panel
        </h1>
        <p style={{ fontSize: 16, color: "#374151", margin: 0 }}>
          Select an option to manage the department
        </p>
        {deleteMsg && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#fef2f2",
              border: "1px solid rgba(220,38,38,0.2)",
              color: "#991b1b",
              fontWeight: 700,
              maxWidth: 900,
            }}
          >
            {deleteMsg}
          </div>
        )}
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 24,
          maxWidth: 900,
        }}
      >
        {/* Users Management Card */}
        <Link href="/admin/users" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "white",
              border: "2px solid #367C2B",
              borderRadius: 12,
              padding: 24,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 8px 16px rgba(54, 124, 43, 0.2)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 2px 8px rgba(0,0,0,0.1)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#367C2B", marginBottom: 8 }}>
                👥 Manage Users
              </h2>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                Add, edit, delete users and manage roles and locations
              </p>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: 10,
                background: "#f0f7ed",
                borderRadius: 8,
                color: "#367C2B",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              Go to Users →
            </div>
          </div>
        </Link>

        {/* Settings/Locations Card */}
        <Link href="/admin/settings" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "white",
              border: "2px solid #FFC72C",
              borderRadius: 12,
              padding: 24,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 8px 16px rgba(255, 199, 44, 0.2)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 2px 8px rgba(0,0,0,0.1)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#FFC72C", marginBottom: 8 }}>
                ⚙️ Settings
              </h2>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                Manage locations and other department settings
              </p>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: 10,
                background: "#fffbf0",
                borderRadius: 8,
                color: "#FFC72C",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              Go to Settings →
            </div>
          </div>
        </Link>

        {/* Development Notes Card */}
        <Link href="/admin/notes" style={{ textDecoration: "none" }}>
          <div
            style={{
              background: "white",
              border: "2px solid #111827",
              borderRadius: 12,
              padding: 24,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 8px 16px rgba(17, 24, 39, 0.2)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow =
                "0 2px 8px rgba(0,0,0,0.1)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 8 }}>
                📝 Development Notes
              </h2>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                Track follow-ups and fixes for later
              </p>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: 10,
                background: "#f3f4f6",
                borderRadius: 8,
                color: "#111827",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              Go to Notes →
            </div>
          </div>
        </Link>

        {role === "admin" && (
          <div
            style={{
              background: "white",
              border: "2px solid #dc2626",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: "#dc2626", marginBottom: 8 }}>
                🗑️ Delete All Activation Data
              </h2>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
                WEB DEV ONLY. Clears all activation uploads and related activation records.
              </p>
            </div>
            <button
              type="button"
              onClick={deleteAllActivationData}
              disabled={deletingAll}
              style={{
                marginTop: 16,
                padding: 10,
                background: "#fef2f2",
                borderRadius: 8,
                color: "#dc2626",
                border: "1px solid rgba(220,38,38,0.35)",
                fontWeight: 800,
                textAlign: "center",
                cursor: deletingAll ? "not-allowed" : "pointer",
                opacity: deletingAll ? 0.7 : 1,
              }}
            >
              {deletingAll ? "Deleting..." : "Delete All →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
