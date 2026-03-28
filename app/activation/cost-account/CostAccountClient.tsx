"use client";

import { useEffect, useMemo, useState } from "react";

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
  item_number?: string | number | null;
  matched_customer_id: string | null;
  matched_sold_item_id?: string | null;
  auto_reconclied?: boolean | null;
  matched_customer?: { name?: string | null } | null;
  file?: { upload_number?: number | null; original_filename?: string | null; uploaded_at?: string | null } | null;
  created_at: string | null;
};

type Role = "admin" | "verifier" | "viewer";

type LocationChangeRequest = {
  id: string;
  cost_item_id: string;
  from_location: string;
  to_location: string;
  status: "pending" | "approved" | "denied";
  denial_reason: string | null;
  created_at: string;
};

export default function CostAccountClient({ role }: { role: Role }) {
  const [items, setItems] = useState<CostItem[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "reconclied" | "not_reconclied">("all");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<CostItem>>({});
  const [locations, setLocations] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [locationChanges, setLocationChanges] = useState<Record<string, LocationChangeRequest | null>>({});
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedItemForLocation, setSelectedItemForLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [xidConsultants, setXidConsultants] = useState<Record<string, string>>({});

  useEffect(() => {
    let isMounted = true;

    const loadItems = async () => {
      try {
        const res = await fetch("/api/activation/subscriptions/cost-items");
        const j = await res.json();
        if (!res.ok) {
          if (isMounted) setError(j?.error ?? "Failed to load cost items");
          return;
        }

        if (isMounted) {
          setError(null);
          setItems(j?.data ?? []);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setError("Failed to load cost items");
      }
    };

    void loadItems();
    const interval = window.setInterval(() => {
      void loadItems();
    }, 20000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/activation/subscriptions/location-changes");
        const j = (await res.json()) as { requests?: LocationChangeRequest[] };
        if (res.ok && j.requests) {
          const byItemId: Record<string, LocationChangeRequest> = {};
          j.requests.forEach((r) => {
            if (!byItemId[r.cost_item_id]) {
              byItemId[r.cost_item_id] = r;
            }
          });
          setLocationChanges(byItemId);
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [items.length]);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/xid-consultants");
        if (!res.ok) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{ xid: string; name: string }>;
        setXidConsultants(
          rows.reduce<Record<string, string>>((acc, row) => {
            acc[row.xid.toUpperCase()] = row.name;
            return acc;
          }, {})
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "reconclied" && !it.matched_customer_id && !it.matched_sold_item_id) return false;
      if (filter === "not_reconclied" && (it.matched_customer_id || it.matched_sold_item_id)) return false;
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
  const reconcliedCount = items.filter((it) => it.matched_customer_id || it.matched_sold_item_id).length;
  const notReconcliedCount = items.length - reconcliedCount;

  const locationTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) {
      const loc = it.location?.trim() || "Unassigned";
      map[loc] = (map[loc] ?? 0) + (it.amount ?? 0);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

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
    setMsg(null);
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

  async function submitLocationChange(costItemId: string, currentLocation: string, newLocation: string) {
    if (currentLocation === newLocation) {
      setMsg("New location must be different from current location");
      setShowLocationModal(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/location-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          costItemId,
          fromLocation: currentLocation || "Unknown",
          toLocation: newLocation,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j?.error ?? "Failed to submit location change");
        setLoading(false);
        return;
      }

      setMsg("Location change request submitted successfully");
      setLocationChanges((prev) => ({
        ...prev,
        [costItemId]: j.request,
      }));
      setShowLocationModal(false);
      setSelectedItemForLocation(null);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Failed to submit location change");
      setLoading(false);
    }
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
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Cost Account
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Parsed subscription costs grouped by customer.
        </p>
      </header>

      {locationTotals.length > 0 && (
        <section style={{ marginBottom: 16, background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontWeight: 900, fontSize: 13, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Cost Total by Location</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {locationTotals.map(([loc, amt]) => (
              <div key={loc} style={{ padding: "6px 12px", borderRadius: 8, background: "white", border: "1px solid rgba(0,0,0,0.1)", fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: "#374151" }}>{loc}: </span>
                <span style={{ fontWeight: 900, color: "#111827" }}>{formatMoney(amt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

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
          onChange={(e) => setFilter(e.target.value as "all" | "reconclied" | "not_reconclied")}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            minWidth: 160,
            background: "#fff",
            fontWeight: 700,
          }}
        >
          <option value="all">All</option>
          <option value="reconclied">Reconclied</option>
          <option value="not_reconclied">Not Reconclied</option>
        </select>
        <select
          value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            minWidth: 160,
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
          <span style={{ color: "#16a34a" }}>Reconclied: {reconcliedCount}</span> · {" "}
          <span style={{ color: "#dc2626" }}>Not Reconclied: {notReconcliedCount}</span>
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
                <div style={{ fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                  {it.customer_name ?? it.retail_customer ?? it.legal_name ?? "(unknown customer)"}
                </div>
                {role === "admin" && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>
                    Upload #: {formatUploadLabel(it.file?.upload_number ?? null, it.file?.uploaded_at ?? null)}
                  </div>
                )}
                <div style={{ marginTop: 2, fontSize: 12, color: "#9ca3af" }}>
                  Item #: {formatItemLabel(it.item_number ?? null, it.created_at ?? null)}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  Description: {it.description ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
                  Invoice: {it.invoice_number ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
                  Order #: {it.order_number ?? "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
                  Ordered By: {it.ordered_by
                    ? (() => {
                        const xid = it.ordered_by.trim().toUpperCase();
                        const name = xidConsultants[xid];
                        return name ? `${name} (${it.ordered_by})` : it.ordered_by;
                      })()
                    : "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>
                  Location: {it.location ?? "—"}
                </div>
                {locationChanges[it.id] && (
                  <div style={{ marginTop: 5 }}>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                      Request: {locationChanges[it.id]?.from_location} → {locationChanges[it.id]?.to_location}
                    </div>
                    {locationChanges[it.id]?.status === "pending" && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "#fef3c7", padding: "3px 6px", borderRadius: 4, display: "inline-block" }}>
                        Pending Approval
                      </div>
                    )}
                    {locationChanges[it.id]?.status === "approved" && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", background: "#d1fae5", padding: "3px 6px", borderRadius: 4, display: "inline-block" }}>
                        ✓ Approved
                      </div>
                    )}
                    {locationChanges[it.id]?.status === "denied" && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "#fee2e2", padding: "3px 6px", borderRadius: 4, display: "inline-block" }}>
                        ✕ Denied
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Serial #: {it.serial_number ?? "—"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                <div>Contract Start Date</div>
                <div>{it.contract_start ?? "—"}</div>
                <div style={{ marginTop: 6 }}>Contract End Date</div>
                <div>{it.contract_end ?? "—"}</div>
              </div>
              <div
                style={{
                  textAlign: "right",
                  fontWeight: 800,
                  color: (it.matched_customer_id || it.matched_sold_item_id) ? "#16a34a" : "#dc2626",
                }}
              >
                {formatMoney(it.amount)}
                <div style={{ fontSize: 11, color: (it.matched_customer_id || it.matched_sold_item_id) ? "#16a34a" : "#dc2626" }}>
                  {(it.matched_customer_id || it.matched_sold_item_id) ? "Reconclied" : "Not Reconclied"}
                </div>
                {it.auto_reconclied && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", marginTop: 3, letterSpacing: "0.04em" }}>
                    AUTO REC.
                  </div>
                )}
                {role === "admin" && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6, justifyItems: "end" }}>
                    {editingId === it.id ? (
                      <>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => saveEdit(it.id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setEditingId(null);
                            setEditValues({});
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => startEdit(it)}
                        >
                          Update
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => deleteItem(it.id)}
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
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 12, color: "#111827", fontWeight: 700 }}>Location</div>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setSelectedItemForLocation(it.id);
                          setShowLocationModal(true);
                        }}
                        disabled={loading}
                        style={{
                          width: "fit-content",
                        }}
                      >
                        Change Location
                      </button>
                    </div>
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

      {/* Location Selection Modal */}
      {showLocationModal && selectedItemForLocation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setShowLocationModal(false);
            setSelectedItemForLocation(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: "#111827" }}>
              Select New Location
            </h2>
            <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {locations.map((loc) => (
                <button
                  className="btn-secondary"
                  key={loc}
                  onClick={() => {
                    const item = items.find((i) => i.id === selectedItemForLocation);
                    if (item) {
                      submitLocationChange(selectedItemForLocation, item.location || "", loc);
                    }
                  }}
                  disabled={loading}
                  style={{
                    padding: 12,
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 8,
                    cursor: loading ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                    textAlign: "left",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    const target = e.currentTarget;
                    target.style.background = "#367C2B";
                    target.style.color = "#FFC72C";
                  }}
                  onMouseLeave={(e) => {
                    const target = e.currentTarget;
                    target.style.background = "#f9fafb";
                    target.style.color = "#000";
                  }}
                >
                  {loc}
                </button>
              ))}
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                setShowLocationModal(false);
                setSelectedItemForLocation(null);
              }}
              style={{
                marginTop: 16,
                width: "100%",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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

function formatMoney(value: number | null) {
  if (!value) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatUploadLabel(uploadNumber: number | null | undefined, uploadedAt?: string | null) {
  if (!uploadNumber) return "—";
  const year = uploadedAt ? new Date(uploadedAt).getFullYear() : new Date().getFullYear();
  return `${year}-${uploadNumber}`;
}

function formatItemLabel(itemNumber: string | number | null | undefined, createdAt?: string | null) {
  if (!itemNumber) return "—";
  if (typeof itemNumber === "string") return itemNumber;
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `${year}-${itemNumber}`;
}
