"use client";

import { useEffect, useMemo, useState } from "react";

function formatUploadLabel(uploadNumber: number | null | undefined) {
  if (!uploadNumber) return "—";
  const year = new Date().getFullYear();
  return `${year}-${uploadNumber}`;
}

type Role = "admin" | "manager" | "user" | "guest";

type SoldItem = {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  retail_price: number | null;
  description: string | null;
  serial_number: string | null;
  sold_by?: string | null;
  invoice_date: string | null;
  location: string | null;
  item_number: string | null;
  matched_customer_id?: string | null;
  matched_cost_item_id?: string | null;
  auto_reconclied?: boolean | null;
  file?: {
    upload_number: number | null;
    original_filename: string | null;
    uploaded_at: string | null;
    storage_path?: string | null;
  } | null;
};

type EditValues = {
  customer_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  location?: string;
  description?: string;
  serial_number?: string;
  sold_by?: string;
  retail_price?: string;
};

const SOLD_TO_CHANGE_LOCATION_KEY = "sold_to_change_location_enabled";

export default function SoldUploadClient({ role, userLocation }: { role: Role; userLocation: string | null }) {
  const [items, setItems] = useState<SoldItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "reconclied" | "not_reconclied">("all");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditValues>({});
  const [locations, setLocations] = useState<string[]>([]);
  const [soldToChangeLocationEnabled, setSoldToChangeLocationEnabled] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedItemForLocation, setSelectedItemForLocation] = useState<string | null>(null);
  const [locationChangeLoading, setLocationChangeLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadItems = async (showSpinner: boolean) => {
      if (showSpinner && isMounted) setLoading(true);
      try {
        const res = await fetch("/api/activation/subscriptions/sold-items");
        const j = await res.json();
        if (!res.ok) {
          if (isMounted) setMsg(j?.error ?? "Failed to load sold-to items");
        } else if (isMounted) {
          setMsg(null);
          setItems(j?.data ?? []);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) setMsg("Failed to load sold-to items");
      } finally {
        if (showSpinner && isMounted) setLoading(false);
      }
    };

    void loadItems(true);
    const interval = window.setInterval(() => {
      void loadItems(false);
    }, 20000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/app-settings?key=${SOLD_TO_CHANGE_LOCATION_KEY}`);
        if (!res.ok) return;
        const j = await res.json();
        const row = (j?.data ?? [])[0] as { value?: string | null } | undefined;
        setSoldToChangeLocationEnabled(row?.value === "true");
      } catch {
        // ignore
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "reconclied" && !it.matched_customer_id && !it.matched_cost_item_id) return false;
      if (filter === "not_reconclied" && (it.matched_customer_id || it.matched_cost_item_id)) return false;
      if (selectedLocation && (it.location ?? "") !== selectedLocation) return false;
      if (!q) return true;
      return (
        (it.invoice_number ?? "").toLowerCase().includes(q) ||
        (it.customer_name ?? "").toLowerCase().includes(q) ||
        (it.serial_number ?? "").toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q) ||
        (it.location ?? "").toLowerCase().includes(q) ||
        (it.item_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, filter, selectedLocation]);

  const reconcliedCount = filtered.filter((it) => it.matched_customer_id || it.matched_cost_item_id).length;
  const notReconcliedCount = filtered.length - reconcliedCount;
  const total = filtered.reduce((sum, it) => sum + (it.retail_price ?? 0), 0);

  const locationTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) {
      const loc = it.location?.trim() || "Unassigned";
      map[loc] = (map[loc] ?? 0) + (it.retail_price ?? 0);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  function canEdit(item: SoldItem) {
    if (role === "admin") return true;
    if (item.matched_customer_id || item.matched_cost_item_id) return false;
    if (!item.location || !userLocation) return false;
    return item.location === userLocation;
  }

  function startEdit(item: SoldItem) {
    if (!canEdit(item)) return;
    setEditingId(item.id);
    setEditValues({
      customer_name: item.customer_name ?? "",
      invoice_number: item.invoice_number ?? "",
      invoice_date: item.invoice_date ?? "",
      location: item.location ?? "",
      description: item.description ?? "",
      serial_number: item.serial_number ?? "",
      sold_by: item.sold_by ?? "",
      retail_price: item.retail_price !== null ? String(item.retail_price) : "",
    });
  }

  async function saveEdit(id: string) {
    setMsg(null);
    const patch: Record<string, string | number | null> = {};
    const fields: (keyof EditValues)[] = [
      "customer_name",
      "invoice_number",
      "invoice_date",
      "location",
      "description",
      "serial_number",
      "sold_by",
      "retail_price",
    ];

    fields.forEach((key) => {
      const value = editValues[key];
      if (value === undefined) return;
      if (key === "retail_price") {
        if (value === "") patch[key] = null;
        else {
          const parsed = Number(value);
          if (Number.isNaN(parsed)) return;
          patch[key] = parsed;
        }
        return;
      }
      if (key === "invoice_date") {
        const normalized = value === "" ? null : normalizeDateInput(value);
        patch[key] = normalized;
        return;
      }
      if (key === "sold_by") {
        patch[key] = value === "" ? null : normalizeSoldBy(value);
        return;
      }
      patch[key] = value === "" ? null : value;
    });

    if (Object.keys(patch).length === 0) {
      setEditingId(null);
      setEditValues({});
      return;
    }

    const res = await fetch("/api/activation/subscriptions/sold-items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });

    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to update item");

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...j.data } : it)));
    setEditingId(null);
    setEditValues({});
  }

  async function deleteItem(id: string) {
    if (role !== "admin") return;
    setMsg(null);
    if (!confirm("Delete this sold-to item?")) return;
    const res = await fetch("/api/activation/subscriptions/sold-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to delete item");
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function submitLocationChange(soldItemId: string, currentLocation: string, newLocation: string) {
    if (currentLocation === newLocation) {
      setMsg("New location must be different from current location");
      setShowLocationModal(false);
      return;
    }

    setLocationChangeLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/location-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          soldItemId,
          fromLocation: currentLocation || "Unknown",
          toLocation: newLocation,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to submit location change");
        return;
      }

      setMsg("Location change request submitted ✅");
      setShowLocationModal(false);
      setSelectedItemForLocation(null);
    } catch (err) {
      console.error(err);
      setMsg("Failed to submit location change");
    } finally {
      setLocationChangeLoading(false);
    }
  }

  async function openPdf(storagePath: string | null | undefined) {
    if (!storagePath) return;
    try {
      const res = await fetch("/api/activation/subscriptions/sold-files/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath }),
      });
      const j = await res.json();
      if (!res.ok) return setMsg(j?.error ?? "Failed to open PDF");
      window.open(j.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error(err);
      setMsg("Failed to open PDF");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Sold-To Data
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Review sold-to invoices parsed from uploaded PDFs.
        </p>
        <p style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
          Note: PDFs are currently stored for review. We can disable PDF storage and remove the PDF button later if you want only parsed data.
        </p>
      </header>

      {locationTotals.length > 0 && (
        <section style={{ marginBottom: 16, background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontWeight: 900, fontSize: 13, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sold Total by Location</div>
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

      <section style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice, customer, serial, location…"
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
          Items: {filtered.length}
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
      </section>

      {msg && (
        <div style={{ marginBottom: 12, color: "#111827", fontWeight: 700 }}>
          {msg}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#374151", fontWeight: 700 }}>Loading…</div>
      ) : (
        <section style={{ display: "grid", gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No sold-to items yet.</div>
          ) : (
            filtered.map((it) => (
              <div
                key={it.id}
                style={{
                  background: "#fff",
                  borderRadius: 10,
                  padding: 12,
                  border: "1px solid rgba(0,0,0,0.08)",
                  display: "grid",
                  gridTemplateColumns: role === "admin" ? "1.5fr 1fr 180px" : "1.5fr 1fr 140px",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: "#111827" }}>
                    {editingId === it.id ? (
                      <input
                        value={editValues.customer_name ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, customer_name: e.target.value }))}
                        placeholder="Customer name"
                        style={{
                          width: "100%",
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                        }}
                      />
                    ) : (
                      it.customer_name ?? "(unknown customer)"
                    )}
                  </div>
                  {role === "admin" && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                      Upload #: {formatUploadLabel(it.file?.upload_number ?? null)}
                    </div>
                  )}
                  <div style={{ marginTop: 2, fontSize: 12, color: "#6b7280" }}>
                    Item #: {it.item_number ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                    Description: {editingId === it.id ? (
                      <input
                        value={editValues.description ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Description"
                        style={{
                          width: "100%",
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                          marginTop: 4,
                        }}
                      />
                    ) : (
                      it.description ?? "—"
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                    Invoice #: {editingId === it.id ? (
                      <input
                        value={editValues.invoice_number ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, invoice_number: e.target.value }))}
                        placeholder="Invoice #"
                        style={{
                          width: "100%",
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                          marginTop: 4,
                        }}
                      />
                    ) : (
                      it.invoice_number ?? "—"
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                    Invoice Date: {editingId === it.id ? (
                      <input
                        value={editValues.invoice_date ?? ""}
                        onChange={(e) =>
                          setEditValues((p) => ({
                            ...p,
                            invoice_date: formatDateInput(e.target.value),
                          }))
                        }
                        placeholder="M/D/YYYY"
                        style={{
                          width: "100%",
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                          marginTop: 4,
                        }}
                      />
                    ) : (
                      formatDateMDY(it.invoice_date)
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                    Sold By: {editingId === it.id ? (
                      <input
                        value={editValues.sold_by ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, sold_by: e.target.value }))}
                        placeholder="Sold By"
                        style={{
                          width: "100%",
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                          marginTop: 4,
                        }}
                      />
                    ) : (
                      formatSoldBy(it.sold_by)
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#000", marginTop: 4 }}>
                    Location: {editingId === it.id ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ fontWeight: 700 }}>{it.location ?? "—"}</div>
                        {soldToChangeLocationEnabled && (role === "admin" || role === "manager") && (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => {
                              setSelectedItemForLocation(it.id);
                              setShowLocationModal(true);
                            }}
                            disabled={locationChangeLoading}
                            style={{ width: "fit-content" }}
                          >
                            Change Location
                          </button>
                        )}
                      </div>
                    ) : (
                      it.location ?? "—"
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span>Serial #</span>
                    <span style={{ fontWeight: 800 }}>
                      {editingId === it.id ? (
                        <input
                          value={editValues.serial_number ?? ""}
                          onChange={(e) => setEditValues((p) => ({ ...p, serial_number: e.target.value }))}
                          placeholder="Serial #"
                          style={{
                            width: 160,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid rgba(0,0,0,0.2)",
                          }}
                        />
                      ) : (
                        it.serial_number ?? "—"
                      )}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>
                    {editingId === it.id ? (
                      <input
                        value={editValues.retail_price ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, retail_price: e.target.value }))}
                        placeholder="0.00"
                        style={{
                          width: "100%",
                          padding: 6,
                          borderRadius: 6,
                          border: "1px solid rgba(0,0,0,0.2)",
                          textAlign: "right",
                        }}
                      />
                    ) : (
                      formatMoney(it.retail_price)
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 11,
                      color: (it.matched_customer_id || it.matched_cost_item_id) ? "#16a34a" : "#dc2626",
                      fontWeight: 800,
                    }}
                  >
                    {(it.matched_customer_id || it.matched_cost_item_id) ? "Reconclied" : "Not Reconclied"}
                  </div>
                  {it.auto_reconclied && (
                    <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: "#6366f1", letterSpacing: "0.04em" }}>
                      AUTO REC.
                    </div>
                  )}
                  <div style={{ marginTop: 6, display: "grid", gap: 6, justifyItems: "end" }}>
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
                        {canEdit(it) ? (
                          <button
                            className="btn-secondary btn-sm"
                            onClick={() => startEdit(it)}
                          >
                            Update
                          </button>
                        ) : (
                          <div
                            title="Updates are limited to assigned location or admin"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px dashed rgba(0,0,0,0.25)",
                              color: "#6b7280",
                              fontWeight: 800,
                            }}
                          >
                            Locked
                          </div>
                        )}
                        {role === "admin" && (
                          <button
                            className="btn-danger btn-sm"
                            onClick={() => deleteItem(it.id)}
                          >
                            Delete
                          </button>
                        )}
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => openPdf(it.file?.storage_path ?? null)}
                          style={{
                            opacity: it.file?.storage_path ? 1 : 0.5,
                          }}
                        >
                          PDF
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      )}

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
                  disabled={locationChangeLoading}
                  style={{
                    padding: 12,
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 8,
                    cursor: locationChangeLoading ? "not-allowed" : "pointer",
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

function formatMoney(value: number | null) {
  if (!value) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDateMDY(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  }

  return value;
}

function formatSoldBy(value: string | null | undefined) {
  if (!value) return "—";
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());

  if (parts.length === 0) return "—";

  const first = capitalize(parts[0]);
  if (parts.length === 1) return first;

  const secondInitial = capitalize(parts[1]).charAt(0);
  return `${first} ${secondInitial}.`;
}

function normalizeSoldBy(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());

  if (parts.length === 0) return "";

  const first = capitalize(parts[0]);
  if (parts.length === 1) return first;

  const secondInitial = capitalize(parts[1]).charAt(0);
  return `${first} ${secondInitial}.`;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const mdy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const iso = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const parts = [] as string[];
  if (digits.length > 0) parts.push(digits.slice(0, 2));
  if (digits.length > 2) parts.push(digits.slice(2, 4));
  if (digits.length > 4) parts.push(digits.slice(4));
  return parts.join("/");
}
