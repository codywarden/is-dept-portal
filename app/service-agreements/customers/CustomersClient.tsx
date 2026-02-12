"use client";

import BackButton from "../../components/BackButton";
import { useEffect, useState } from "react";

type Role = "admin" | "verifier" | "viewer";

type Customer = {
  id: string;
  name: string;
  email?: string;
  location?: string;
  level: "Premium" | "Remote";
  created_at?: string;
};

const DEFAULT_LOCATIONS = [
  "Bucklin",
  "Greensburg",
  "Ness City",
  "Pratt",
  "Hoxie",
  "Great Bend",
] as const;

export default function CustomersClient({ role }: { role: Role }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState<string[]>(Array.from(DEFAULT_LOCATIONS));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [level, setLevel] = useState<Customer["level"]>("Premium");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load customers from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/service-agreements/customers");
        if (!res.ok) return;
        const { data } = await res.json();
        setCustomers((data || []).filter((c: any) => c && c.id && c.name));
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

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
      }
    })();
  }, []);

  async function addCustomer() {
    if (!name.trim()) return setMsg("Name required");
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/service-agreements/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          location: location.trim() || null,
          level,
        }),
      });

      const { data, error } = await res.json();
      setLoading(false);

      if (!res.ok) return setMsg(error || "Failed to add customer");
      if (!data) return setMsg("Failed to add customer");

      setCustomers((s) => [data, ...s]);
      setName("");
      setEmail("");
      setLocation("");
      setMsg("Customer added ✅");
    } catch (err) {
      setLoading(false);
      setMsg("Error adding customer");
      console.error(err);
    }
  }

  async function removeCustomer(id: string) {
    try {
      const res = await fetch("/api/service-agreements/customers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) return setMsg("Failed to delete customer");
      setCustomers((s) => s.filter((c) => c.id !== id));
      setMsg("Customer deleted ✅");
    } catch (err) {
      setMsg("Error deleting customer");
      console.error(err);
    }
  }

  const visibleCustomers =
    role === "admin" && selectedLocation
      ? customers.filter((c) => c.location === selectedLocation)
      : customers;

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>Customers</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>Customers with service agreements and their level/location.</p>
      </header>

      {role === "admin" && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontWeight: 700, color: "#000" }}>Filter by location:</label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
      )}

      {role === "admin" && (
        <section style={{ marginBottom: 20, background: "#f9fafb", padding: 12, borderRadius: 10 }}>
          <h3 style={{ marginTop: 0, color: "#000" }}>Add Customer</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 160px", gap: 8 }}>
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }} />
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }} />
            <select value={location} onChange={(e) => setLocation(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}>
              <option value="">Select Location</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value as any)} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}>
              <option value="Premium">Premium</option>
              <option value="Remote">Remote</option>
            </select>
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={addCustomer} disabled={loading} style={{ padding: "8px 12px", background: "#367C2B", color: "#FFC72C", borderRadius: 8, border: "2px solid #FFC72C", cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, opacity: loading ? 0.6 : 1 }}>{loading ? "Adding..." : "Add"}</button>
          </div>
        </section>
      )}

      {msg && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", color: "#111827", fontWeight: 700 }}>
          {msg}
        </div>
      )}

      <section style={{ display: "grid", gap: 8 }}>
        {visibleCustomers.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No customers yet.</div>
        ) : (
          visibleCustomers.map((c) => c && c.id ? (
            <div key={c.id} style={{ background: "#fff", padding: 12, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, color: "#000" }}>{c.name ?? "(unnamed)"} <span style={{ fontWeight: 600, color: "#000" }}>({c.level})</span></div>
                <div style={{ fontSize: 13, color: "#000" }}>{c.email ?? "—"} • {c.location ?? "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {role === "admin" && (
                  <button onClick={() => removeCustomer(c.id)} style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontWeight: 700 }}>Delete</button>
                )}
              </div>
            </div>
          ) : null)
        )}
      </section>
    </div>
  );
}
