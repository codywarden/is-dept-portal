"use client";

import Link from "next/link";
import BackButton from "../components/BackButton";

export default function AdminDashboard() {
  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: "#367C2B", marginBottom: 12 }}>
          Admin Panel
        </h1>
        <p style={{ fontSize: 16, color: "#374151", margin: 0 }}>
          Select an option to manage the department
        </p>
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
      </div>
    </div>
  );
}
