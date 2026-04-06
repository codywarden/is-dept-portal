"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Role = "admin" | "verifier" | "viewer";

type ProfileInfo = {
  email: string;
  firstName: string;
  lastName: string;
  locations: string[];
  pagePermissions: Record<string, boolean> | null;
};

export default function DashboardClient({
  role,
  profile,
}: {
  role: Role;
  profile: ProfileInfo;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      if (!data.session) {
        router.push("/login");
        return;
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [router, supabase]);

  const allCards = [
    { title: "Admin", href: "/admin", permKey: "admin", roles: ["admin"] as Role[] },
    { title: "See & Spray", href: "/see-spray", permKey: "see-spray", roles: ["admin", "verifier", "viewer"] as Role[] },
    { title: "Sprayers", href: "/sprayers", permKey: "sprayers", roles: ["admin", "verifier"] as Role[] },
    { title: "Activation", href: "/activation", permKey: "activation", roles: ["admin", "verifier", "viewer"] as Role[] },
    { title: "Service Agreements", href: "/service-agreements", permKey: "service-agreements", roles: ["admin", "verifier", "viewer"] as Role[] },
    { title: "🚜 Frankie the Autonomous Tractor", href: "/dashboard/frankie", permKey: "frankie", roles: ["admin", "verifier"] as Role[] },
    { title: "Protected", href: "/protected", permKey: null, roles: ["admin"] as Role[] },
    { title: "System Test", href: "/test", permKey: null, roles: ["admin"] as Role[] },
  ];

  const perms = profile.pagePermissions;
  const hasAnyPerm = perms && Object.keys(perms).length > 0;

  const cards = allCards.filter((c) => {
    if (!c.roles.includes(role)) return false;
    if (role === "admin") return true;
    // if no permissions configured, fall back to role-based defaults
    if (!hasAnyPerm || c.permKey === null) return true;
    return perms[c.permKey] === true;
  });

  if (loading) {
    return (
      <main style={{ padding: 32 }}>
        <p>Loading dashboard…</p>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#367C2B" }}>
          IS Dept Portal
        </h1>
        <p style={{ color: "#374151", marginTop: 4 }}>
          Precision Ag • Automation • Systems
        </p>

        <div style={{ marginTop: 10, color: "#111827", fontWeight: 700 }}>
          Welcome{profile.firstName ? `, ${profile.firstName}` : ""}!
        </div>
        <div style={{ marginTop: 4, color: "#111827", opacity: 0.8 }}>
          Location: <span style={{ fontWeight: 800 }}>{profile.locations.length > 0 ? profile.locations.join(", ") : "—"}</span>
        </div>


        {/* Keep this debug */}
        <div style={{ color: "red", marginTop: 8, fontWeight: 700 }}>
          ROLE: {role}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 20,
        }}
      >
        {cards.map((c) => (
            <Card key={c.href} title={c.title} href={c.href} />
          ))}
      </section>

      <div style={{ marginTop: 40 }}>
        <button
          className="btn-secondary"
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
          style={{
            backgroundColor: "#367C2B",
            color: "#FFC72C",
            padding: "10px 16px",
            borderRadius: 6,
            fontWeight: 600,
            border: "2px solid #FFC72C",
            cursor: "pointer",
            fontSize: "14px",
            transition: "all 0.2s ease",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#2d6a23";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(54, 124, 43, 0.3)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#367C2B";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Card({ title, href }: { title: string; href: string }) {
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
      }}
    >
      <div style={{ fontSize: 18 }}>{title}</div>
      <div style={{ marginTop: 8, color: "#367C2B", fontWeight: 800 }}>
        OPEN →
      </div>
    </a>
  );
}
