"use client";

import BackButton from "../components/BackButton";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type Role = "admin" | "verifier" | "viewer";

export default function ServiceAgreementsClient({ role }: { role: Role }) {
  const router = useRouter();

  useEffect(() => {
    // minor client-side guard: if no role passed, redirect to dashboard
    if (!role) router.replace("/dashboard");
  }, [role, router]);

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />
      <header style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
            Service Agreements
          </h1>
          <p style={{ marginTop: 8, color: "#374151" }}>
            View and manage service agreements and contracts.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {role === "admin" && (
            <button
              onClick={() => router.push("/service-agreements/settings")}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "#367C2B",
                color: "#FFC72C",
                border: "2px solid #FFC72C",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Settings (admin)
            </button>
          )}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        <Card title="Customers" href="/service-agreements/customers" description="View customers with service agreements (level & location)." />
        <Card title="Tasks" href="/service-agreements/tasks" description="Yearly tasks and completion status (R/Y/G)." />
        <Card title="Equipment" href="/service-agreements/equipment" description="Add and manage equipment (viewers can add serials)." />
      </section>
    </div>
  );
}

function Card({ title, href, description }: { title: string; href: string; description: string }) {
  return (
    <a
      href={href}
      style={{
        background: "#f9fafb",
        border: "8px solid #367C2B",
        borderRadius: 10,
        padding: 20,
        textDecoration: "none",
        color: "#111827",
        fontWeight: 700,
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontSize: 18 }}>{title}</div>
        <div style={{ marginTop: 8, color: "#6b7280", fontWeight: 600 }}>{description}</div>
      </div>
      <div style={{ marginTop: 12, color: "#367C2B", fontWeight: 800 }}>OPEN →</div>
    </a>
  );
}
