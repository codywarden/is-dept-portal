"use client";

import { useEffect, useMemo, useState } from "react";
import BackButton from "../../components/BackButton";

type CostItem = {
  id: string;
  customer_name: string | null;
  retail_customer: string | null;
  legal_name: string | null;
  org_name: string | null;
  location: string | null;
  ordered_by: string | null;
  amount: number | null;
  currency: string | null;
  invoice_number: string | null;
  order_number: string | null;
  contract_start: string | null;
  contract_end: string | null;
  due_date: string | null;
  description: string | null;
  serial_number: string | null;
  matched_customer_id: string | null;
  matched_customer?: { name?: string | null } | null;
  created_at: string | null;
};

type Role = "admin" | "verifier" | "viewer";

export default function CostAccountClient({ role }: { role: Role }) {
  const [items, setItems] = useState<CostItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<CostItem>>({});
  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/activation/subscriptions/cost-items");
        if (!res.ok) {
          const j = await res.json();
          setError(j?.error ?? "Failed to load cost items");
          return;
        }
        const j = await res.json();
        setItems(j?.data ?? []);
      } catch (err) {
        console.error(err);
        setError("Failed to load cost items");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "matched" && !it.matched_customer_id) return false;
      if (filter === "unmatched" && it.matched_customer_id) return false;
      if (selectedLocation && (it.location ?? "") !== selectedLocation) return false;

      if (!q) return true;
      const name = (it.customer_name ?? "").toLowerCase();
      const retail = (it.retail_customer ?? "").toLowerCase();
      const legal = (it.legal_name ?? "").toLowerCase();
      const org = (it.org_name ?? "").toLowerCase();
      const loc = (it.location ?? "").toLowerCase();
      const orderedBy = (it.ordered_by ?? "").toLowerCase();
      const serial = (it.serial_number ?? "").toLowerCase();
      const invoice = (it.invoice_number ?? "").toLowerCase();
      const order = (it.order_number ?? "").toLowerCase();
      return (
        name.includes(q) ||
        retail.includes(q) ||
        legal.includes(q) ||
        org.includes(q) ||
        loc.includes(q) ||
        orderedBy.includes(q) ||
        serial.includes(q) ||
        invoice.includes(q) ||
        order.includes(q)
      );
    });
  }, [items, query, filter, selectedLocation]);

  const total = filtered.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const matchedCount = filtered.filter((it) => it.matched_customer_id).length;
  const unmatchedCount = filtered.length - matchedCount;

  function startEdit(item: CostItem) {
    setEditingId(item.id);
    setEditValues({
      customer_name: item.customer_name,
      retail_customer: item.retail_customer,
      legal_name: item.legal_name,
      org_name: item.org_name,
      location: item.location,
      ordered_by: item.ordered_by,
      amount: item.amount,
      currency: item.currency,
      invoice_number: item.invoice_number,
      order_number: item.order_number,
      description: item.description,
      serial_number: item.serial_number,
      contract_start: item.contract_start,
      contract_end: item.contract_end,
      due_date: item.due_date,
    });
  }

  async function saveEdit(id: string) {
    setError(null);
    const res = await fetch("/api/activation/subscriptions/cost-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch: editValues }),
    });

    const j = await res.json();
    if (!res.ok) {
      setError(j?.error ?? "Failed to update item");
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...j.data } : it)));
    setEditingId(null);
    setEditValues({});
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this cost item? This cannot be undone.")) return;
    setError(null);
    const res = await fetch("/api/activation/subscriptions/cost-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const j = await res.json();
    if (!res.ok) {
      setError(j?.error ?? "Failed to delete item");
      return;
    }

    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <BackButton />
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Cost Account
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Parsed subscription costs grouped by customer.
        </p>
      </header>

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid rgba(220,38,38,0.2)",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer, serial, invoice, order…"
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            minWidth: 280,
            background: "#f9fafb",
            color: "#111827",
            fontWeight: 600,
          }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "matched" | "unmatched")}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
          }}
        >
          <option value="all">All</option>
          <option value="matched">Matched</option>
          <option value="unmatched">Unmatched</option>
        </select>
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
          }}
        >
          <option value="">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#f9fafb",
            fontWeight: 700,
          }}
        >
          Total: {formatMoney(total)}
        </div>
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#f9fafb",
            fontWeight: 700,
          }}
        >
          Matched: {matchedCount} · Unmatched: {unmatchedCount}
        </div>
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No cost account items yet.</div>
        ) : (
          filtered.map((it) => (
            <div
              key={it.id}
              style={{
                background: "#fff",
                padding: 12,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.08)",
                display: "grid",
                gridTemplateColumns: role === "admin" ? "1.5fr 1fr 1fr 180px" : "1.5fr 1fr 1fr 140px",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: "#111827" }}>
                  {it.customer_name ?? it.retail_customer ?? it.legal_name ?? "(unknown customer)"}
                </div>
                <div style={{ fontSize: 12, color: "#000" }}>
                  Description: {it.description ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                  Invoice: {it.invoice_number ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                  Order #: {it.order_number ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                  Ordered By: {it.ordered_by ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                  Location: {it.location ?? "—"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#000" }}>
                Serial #: {it.serial_number ?? "—"}
              </div>
              <div style={{ fontSize: 12, color: "#000" }}>
                <div>Contract Start Date</div>
                <div>{it.contract_start ?? "—"}</div>
                <div style={{ marginTop: 6 }}>Contract End Date</div>
                <div>{it.contract_end ?? "—"}</div>
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontWeight: 800,
                  color: it.matched_customer_id ? "#16a34a" : "#dc2626",
                }}
              >
                {formatMoney(it.amount)}
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {it.matched_customer_id ? "Matched" : "Unmatched"}
                </div>
                {role === "admin" && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6, justifyItems: "end" }}>
                    {editingId === it.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(it.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "2px solid #367C2B",
                            background: "#367C2B",
                            color: "#fff",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditValues({});
                          }}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid rgba(0,0,0,0.2)",
                            background: "#fff",
                            color: "#111827",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(it)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "2px solid #367C2B",
                            background: "#fff",
                            color: "#367C2B",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Update
                        </button>
                        <button
                          onClick={() => deleteItem(it.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "2px solid rgba(220,38,38,0.9)",
                            background: "#fff",
                            color: "#dc2626",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {role === "admin" && editingId === it.id && (
                <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                    <Input label="Customer Name" value={editValues.customer_name ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, customer_name: v }))} />
                    <Input label="Retail Customer" value={editValues.retail_customer ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, retail_customer: v }))} />
                    <Input label="Legal Name" value={editValues.legal_name ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, legal_name: v }))} />
                    <Input label="Org Name" value={editValues.org_name ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, org_name: v }))} />
                    <SelectInput
                      label="Location"
                      value={editValues.location ?? ""}
                      options={locations}
                      onChange={(v) => setEditValues((p) => ({ ...p, location: v }))}
                    />
                    <Input label="Ordered By" value={editValues.ordered_by ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, ordered_by: v }))} />
                    <Input label="Amount" value={editValues.amount?.toString() ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, amount: v ? Number(v) : null }))} />
                    <Input label="Currency" value={editValues.currency ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, currency: v }))} />
                    <Input label="Invoice #" value={editValues.invoice_number ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, invoice_number: v }))} />
                    <Input label="Order #" value={editValues.order_number ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, order_number: v }))} />
                    <Input label="Description" value={editValues.description ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, description: v }))} />
                    <Input label="Serial" value={editValues.serial_number ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, serial_number: v }))} />
                    <Input label="Contract Start" value={editValues.contract_start ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, contract_start: v }))} />
                    <Input label="Contract End" value={editValues.contract_end ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, contract_end: v }))} />
                    <Input label="Due Date" value={editValues.due_date ?? ""} onChange={(v) => setEditValues((p) => ({ ...p, due_date: v }))} />
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#111827", fontWeight: 700 }}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(0,0,0,0.2)", background: "#fff", color: "#111827" }}
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#111827", fontWeight: 700 }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: 8, borderRadius: 6, border: "1px solid rgba(0,0,0,0.2)", background: "#fff", color: "#111827" }}
      >
        <option value="">Select location</option>
        {options.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatMoney(value: number | null) {
  if (!value) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}
