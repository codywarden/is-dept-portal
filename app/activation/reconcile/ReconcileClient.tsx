"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "verifier" | "viewer";

type CostItem = {
  id: string;
  customer_name: string | null;
  serial_number: string | null;
  description: string | null;
  amount: number | null;
  invoice_number: string | null;
  item_number: string | null;
  location: string | null;
  matched_sold_item_id: string | null;
  auto_reconclied?: boolean | null;
  file?: { upload_number: number | null; original_filename: string | null } | null;
};

type SoldItem = {
  id: string;
  customer_name: string | null;
  serial_number: string | null;
  description: string | null;
  retail_price: number | null;
  invoice_number: string | null;
  item_number: string | null;
  location: string | null;
  matched_cost_item_id: string | null;
  auto_reconclied?: boolean | null;
  file?: { upload_number: number | null; original_filename: string | null } | null;
};

type ReconcileItemsResponse = {
  costItems: CostItem[];
  soldItems: SoldItem[];
};

type LocationChangeRequest = {
  id: string;
  cost_item_id: string;
  from_location: string;
  to_location: string;
  status: "pending" | "approved" | "denied";
  denial_reason: string | null;
  created_at: string;
};

const SOLD_TO_CHANGE_LOCATION_KEY = "sold_to_change_location_enabled";

export default function ReconcileClient({ role }: { role: Role }) {
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [reconcliedItemLinks, setReconcliedItemLinks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "reconclied" | "not_reconclied">("not_reconclied");
  const [locationFilter, setLocationFilter] = useState("all");
  const [locations, setLocations] = useState<string[]>([]);
  const [locationChanges, setLocationChanges] = useState<Record<string, LocationChangeRequest | null>>({});
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedItemForLocation, setSelectedItemForLocation] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<"cost" | "sold" | null>(null);
  const [soldToChangeLocationEnabled, setSoldToChangeLocationEnabled] = useState(false);
  const [locationChangeLoading, setLocationChangeLoading] = useState(false);
  const [locationMismatchPrompt, setLocationMismatchPrompt] = useState<{
    costItem: CostItem;
    soldItem: SoldItem;
  } | null>(null);
  const [autoReconciling, setAutoReconciling] = useState(false);

  useEffect(() => {
    (async () => {
      setMsg(null);
      setLoading(true);
      try {
        const res = await fetch("/api/activation/subscriptions/reconcile-items");
        const j = (await res.json()) as ReconcileItemsResponse & { error?: string };
        if (!res.ok) {
          setMsg(j?.error ?? "Failed to load items");
          setLoading(false);
          return;
        }
        setCostItems(j.costItems ?? []);
        setSoldItems(j.soldItems ?? []);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setMsg("Failed to load items");
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (costItems.length === 0) return;
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
  }, [costItems.length]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/locations");
        const j = await res.json();
        if (res.ok) {
          const rows = (j?.data ?? []) as { name: string }[];
          setLocations(rows.map((r) => r.name));
        }
      } catch (err) {
        console.error(err);
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

  function normalizeLocationForCompare(value: string | null | undefined) {
    return (value ?? "").trim().toLowerCase();
  }

  async function continueReconcliedWithoutLocationRequest() {
    if (!locationMismatchPrompt) return;
    const { costItem, soldItem } = locationMismatchPrompt;
    setLocationMismatchPrompt(null);
    await saveReconcliedItem(costItem.id, soldItem.id);
  }

  async function submitMismatchCostLocationRequest() {
    if (!locationMismatchPrompt) return;
    const { costItem, soldItem } = locationMismatchPrompt;
    setLocationMismatchPrompt(null);
    const createdRequest = await submitLocationChange(
      costItem.id,
      costItem.location || "Unknown",
      soldItem.location || "Unknown",
      { autoApproveForAdmin: role === "admin" }
    );

    if (!createdRequest) {
      return;
    }

    await saveReconcliedItem(costItem.id, soldItem.id);
  }

  async function handleReconcliedSaveWithLocationCheck(costItem: CostItem, soldItemId: string) {
    const soldItem = soldItems.find((item) => item.id === soldItemId);

    if (!soldItem) {
      setMsg("Selected sold item was not found");
      return;
    }

    const costLocation = normalizeLocationForCompare(costItem.location);
    const soldLocation = normalizeLocationForCompare(soldItem.location);
    const locationsMismatch = costLocation !== soldLocation;

    if (locationsMismatch) {
      setLocationMismatchPrompt({
        costItem,
        soldItem,
      });
      return;
    }

    await saveReconcliedItem(costItem.id, soldItemId);
  }

  async function saveReconcliedItem(costItemId: string, soldItemId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/reconcile-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_reconclied", costItemId, soldItemId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to save Reconclied link");
        setLoading(false);
        return;
      }
      
      // Mark items as reconclied in the lists
      setCostItems(prev =>
        prev.map(item =>
          item.id === costItemId ? { ...item, matched_sold_item_id: soldItemId } : item
        )
      );
      setSoldItems(prev =>
        prev.map(item =>
          item.id === soldItemId ? { ...item, matched_cost_item_id: costItemId } : item
        )
      );
      
      // Clear the selected reconclied link from state
      setReconcliedItemLinks(prev => {
        const updated = { ...prev };
        delete updated[costItemId];
        Object.keys(updated).forEach((key) => {
          if (updated[key] === soldItemId) {
            delete updated[key];
          }
        });
        return updated;
      });
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      setMsg("Failed to save Reconclied link");
      setLoading(false);
    }
  }

  async function markNotReconcliedItem(costItemId?: string, soldItemId?: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/reconcile-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_not_reconclied", costItemId, soldItemId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to mark Not Reconclied");
        setLoading(false);
        return;
      }

      if (costItemId) {
        setCostItems(prev =>
          prev.map(item =>
            item.id === costItemId ? { ...item, matched_sold_item_id: null } : item
          )
        );
      }
      if (soldItemId) {
        setSoldItems(prev =>
          prev.map(item =>
            item.id === soldItemId ? { ...item, matched_cost_item_id: null } : item
          )
        );
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setMsg("Failed to mark Not Reconclied");
      setLoading(false);
    }
  }

  async function runAutoReconcile() {
    if (!window.confirm("Run Auto Reconcile? This will match all items where Serial #, Location, and start date (within the configured day range) all match.")) return;
    setAutoReconciling(true);
    setMsg(null);
    try {
      const res = await fetch("/api/activation/subscriptions/auto-reconcile", {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Auto Reconcile failed");
        return;
      }
      const count = j.matched ?? 0;
      setMsg(count > 0 ? `Auto Reconcile complete — ${count} item${count === 1 ? "" : "s"} matched.` : "Auto Reconcile complete — no new matches found.");

      // Reload items to reflect changes
      const itemsRes = await fetch("/api/activation/subscriptions/reconcile-items");
      const itemsJ = (await itemsRes.json()) as ReconcileItemsResponse & { error?: string };
      if (itemsRes.ok) {
        setCostItems(itemsJ.costItems ?? []);
        setSoldItems(itemsJ.soldItems ?? []);
      }
    } catch (err) {
      console.error(err);
      setMsg("Auto Reconcile failed");
    } finally {
      setAutoReconciling(false);
    }
  }

  async function submitLocationChange(
    costItemId: string,
    currentLocation: string,
    newLocation: string,
    options?: { autoApproveForAdmin?: boolean }
  ) {
    if (currentLocation === newLocation) {
      setMsg("New location must be different from current location");
      setShowLocationModal(false);
      return null;
    }

    setLocationChangeLoading(true);
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
        setMsg(j?.error ?? "Failed to submit location change");
        setLoading(false);
        return null;
      }

      let request = j.request as LocationChangeRequest;

      if (options?.autoApproveForAdmin && role === "admin" && request?.id) {
        const approveRes = await fetch("/api/activation/subscriptions/location-changes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", requestId: request.id }),
        });

        const approveJson = await approveRes.json();
        if (!approveRes.ok) {
          setMsg(approveJson?.error ?? "Failed to auto-approve location change request");
          return null;
        }

        request = approveJson.request as LocationChangeRequest;
        setCostItems((prev) =>
          prev.map((item) =>
            item.id === costItemId
              ? {
                  ...item,
                  location: newLocation,
                }
              : item
          )
        );
        setMsg("Location change request auto-approved (admin) and queued for printing");
      } else {
        setMsg("Location change request submitted successfully");
      }

      setLocationChanges((prev) => ({
        ...prev,
        [costItemId]: request,
      }));
      setShowLocationModal(false);
      setSelectedItemForLocation(null);
      setSelectedItemType(null);
      return request;
      
    } catch (err) {
      console.error(err);
      setMsg("Failed to submit location change");
      return null;
    } finally {
      setLocationChangeLoading(false);
    }
  }

  async function submitSoldLocationChange(soldItemId: string, currentLocation: string, newLocation: string) {
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

      setMsg("Location change request submitted successfully");
      setShowLocationModal(false);
      setSelectedItemForLocation(null);
      setSelectedItemType(null);
    } catch (err) {
      console.error(err);
      setMsg("Failed to submit location change");
    } finally {
      setLocationChangeLoading(false);
    }
  }

  const baseFilteredCostItems = costItems.filter(item => {
    const isReconclied = Boolean(item.matched_sold_item_id);
    if (filter === "reconclied") return isReconclied;
    if (filter === "not_reconclied") return !isReconclied;
    return true;
  });

  const baseFilteredSoldItems = soldItems.filter(item => {
    const isReconclied = Boolean(item.matched_cost_item_id);
    if (filter === "reconclied") return isReconclied;
    if (filter === "not_reconclied") return !isReconclied;
    return true;
  });

  const locationScopedCostItems = baseFilteredCostItems.filter(item => {
    if (locationFilter === "all") return true;
    return (item.location ?? "").toLowerCase() === locationFilter.toLowerCase();
  });

  const locationScopedSoldItems = baseFilteredSoldItems.filter(item => {
    if (locationFilter === "all") return true;
    return (item.location ?? "").toLowerCase() === locationFilter.toLowerCase();
  });

  const showLocationNotReconcliedSections = locationFilter !== "all";

  const filteredCostItems = showLocationNotReconcliedSections
    ? [...locationScopedCostItems].sort(
        (a, b) => Number(Boolean(b.matched_sold_item_id)) - Number(Boolean(a.matched_sold_item_id))
      )
    : locationScopedCostItems;

  const filteredSoldItems = showLocationNotReconcliedSections
    ? [...locationScopedSoldItems].sort(
        (a, b) => Number(Boolean(b.matched_cost_item_id)) - Number(Boolean(a.matched_cost_item_id))
      )
    : locationScopedSoldItems;

  const firstNotReconcliedCostIndex = showLocationNotReconcliedSections
    ? filteredCostItems.findIndex((item) => !item.matched_sold_item_id)
    : -1;

  const firstNotReconcliedSoldIndex = showLocationNotReconcliedSections
    ? filteredSoldItems.findIndex((item) => !item.matched_cost_item_id)
    : -1;

  const notReconcliedSoldItems = soldItems.filter(item => !item.matched_cost_item_id);

  // Calculate stats for not reconclied items
  const notReconcliedCostItems = costItems.filter(item => !item.matched_sold_item_id);
  const notReconcliedCostCount = notReconcliedCostItems.length;
  const notReconcliedCostTotal = notReconcliedCostItems.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  const notReconcliedSoldCount = notReconcliedSoldItems.length;
  const notReconcliedSoldTotal = notReconcliedSoldItems.reduce((sum, item) => sum + (item.retail_price ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>Reconcile</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Review Reconclied and Not Reconclied cost account items with sold-to items.
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

      <section style={{ marginBottom: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Cost Account Stats */}
        <div style={{
          background: "#fff",
          border: "2px solid #367C2B",
          borderRadius: 10,
          padding: 16,
        }}>
          <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginBottom: 8 }}>
            Cost Account Not Reconclied
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#367C2B", marginBottom: 6 }}>
            {notReconcliedCostCount}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
            ${notReconcliedCostTotal.toFixed(2)}
          </div>
        </div>

        {/* Sold To Stats */}
        <div style={{
          background: "#fff",
          border: "2px solid #6366f1",
          borderRadius: 10,
          padding: 16,
        }}>
          <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginBottom: 8 }}>
            Sold To Not Reconclied
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#6366f1", marginBottom: 6 }}>
            {notReconcliedSoldCount}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>
            ${notReconcliedSoldTotal.toFixed(2)}
          </div>
        </div>
      </section>

      {(role === "admin" || role === "verifier") && (
        <section style={{ marginBottom: 16 }}>
          <button
            onClick={runAutoReconcile}
            disabled={autoReconciling || loading}
            style={{
              padding: "10px 20px",
              background: "#367C2B",
              color: "#FFC72C",
              borderRadius: 8,
              border: "2px solid #FFC72C",
              cursor: autoReconciling || loading ? "not-allowed" : "pointer",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            {autoReconciling ? "Running Auto Reconcile…" : "Auto Reconcile"}
          </button>
        </section>
      )}

      <section style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <label style={{ fontWeight: 800, color: "#111827" }}>Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "reconclied" | "not_reconclied")}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
          }}
        >
          <option value="all">All</option>
          <option value="reconclied">Reconclied</option>
          <option value="not_reconclied">Not Reconclied</option>
        </select>
        <label style={{ fontWeight: 800, color: "#111827" }}>Location:</label>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
          }}
        >
          <option value="all">All Locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left side: Unmatched Cost Items */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
            Cost Account ({filteredCostItems.length})
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {filteredCostItems.map((item, index) => {
              const isReconclied = Boolean(item.matched_sold_item_id);
              return (
              <div key={item.id}>
                {firstNotReconcliedCostIndex === index && (
                  <div
                    style={{
                      marginBottom: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#fef2f2",
                      border: "1px solid rgba(220,38,38,0.25)",
                      color: "#991b1b",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Not Reconclied Yet
                  </div>
                )}
                <div
                  style={{
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 10,
                    padding: 12,
                    position: "relative",
                  }}
                >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 800 }}>
                    Item #: {item.item_number || "—"}
                  </div>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedItemForLocation(item.id);
                      setSelectedItemType("cost");
                      setShowLocationModal(true);
                    }}
                    disabled={loading}
                    style={{
                      padding: "4px 10px",
                      background: "#367C2B",
                      color: "#FFC72C",
                      borderRadius: 6,
                      border: "2px solid #FFC72C",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Change Location
                  </button>
                </div>
                {isReconclied && (
                  <div style={{ fontSize: 12, color: "#166534", fontWeight: 800, marginBottom: 6 }}>Reconclied</div>
                )}
                <div style={{ fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                  {item.customer_name || "Unknown Customer"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 2 }}>
                  Invoice: {item.invoice_number || "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                  Serial: {item.serial_number || "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                  Location: {item.location || "—"}
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                  {item.description || "—"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                  ${item.amount?.toFixed(2) ?? "0.00"}
                </div>
                {item.auto_reconclied && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", marginBottom: 6, letterSpacing: "0.04em" }}>
                    AUTO REC.
                  </div>
                )}
                {!isReconclied && (
                  (() => {
                    const selectedSoldId = reconcliedItemLinks[item.id] || "";
                    const selectedSoldItem = notReconcliedSoldItems.find((sold) => sold.id === selectedSoldId);
                    const selectedLocationsMismatch =
                      Boolean(selectedSoldItem) &&
                      normalizeLocationForCompare(item.location) !==
                        normalizeLocationForCompare(selectedSoldItem?.location);

                    return (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
                          <select
                            value={selectedSoldId}
                            onChange={(e) => {
                              const nextSoldId = e.target.value;
                              const selectedInAnotherCard = Object.entries(reconcliedItemLinks).some(
                                ([otherCostId, linkedSoldId]) =>
                                  otherCostId !== item.id &&
                                  linkedSoldId === nextSoldId &&
                                  Boolean(nextSoldId)
                              );

                              if (selectedInAnotherCard) {
                                setMsg("That retail item is already selected in another cost card.");
                                return;
                              }

                              setReconcliedItemLinks((prev) => ({ ...prev, [item.id]: nextSoldId }));
                            }}
                            style={{
                              padding: 8,
                              borderRadius: 6,
                              border: "1px solid rgba(0,0,0,0.15)",
                              background: "#fff",
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            <option value="">Reconclied to sold item…</option>
                            {notReconcliedSoldItems.map((sold) => {
                              const selectedInAnotherCard = Object.entries(reconcliedItemLinks).some(
                                ([otherCostId, linkedSoldId]) =>
                                  otherCostId !== item.id && linkedSoldId === sold.id
                              );

                              return (
                                <option key={sold.id} value={sold.id} disabled={selectedInAnotherCard}>
                                  {sold.customer_name || "Unknown"} - {sold.item_number || "No Item #"} - ${sold.retail_price?.toFixed(2) ?? "0.00"}
                                  {selectedInAnotherCard ? " (selected in another card)" : ""}
                                </option>
                              );
                            })}
                          </select>
                          <button
                            className="btn-primary btn-sm"
                            onClick={async () => {
                              const soldId = reconcliedItemLinks[item.id];
                              if (soldId) {
                                const selectedInAnotherCard = Object.entries(reconcliedItemLinks).some(
                                  ([otherCostId, linkedSoldId]) =>
                                    otherCostId !== item.id && linkedSoldId === soldId
                                );

                                if (selectedInAnotherCard) {
                                  setMsg("That retail item is already selected in another cost card.");
                                  return;
                                }

                                await handleReconcliedSaveWithLocationCheck(item, soldId);
                              }
                            }}
                            disabled={loading || !reconcliedItemLinks[item.id]}
                            style={{
                              fontSize: 13,
                            }}
                          >
                            Save
                          </button>
                        </div>

                        {selectedLocationsMismatch && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "8px 10px",
                              borderRadius: 8,
                              background: "#fffbeb",
                              border: "1px solid rgba(245,158,11,0.35)",
                              color: "#92400e",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            Location mismatch: Cost is {item.location || "Unknown"}, Sold To is {selectedSoldItem?.location || "Unknown"}.
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
                {isReconclied && role === "admin" && (
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => {
                      if (!window.confirm("Mark this cost item as Not Reconclied?")) return;
                      markNotReconcliedItem(item.id);
                    }}
                    disabled={loading}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      padding: "6px 12px",
                      background: "#fff",
                      color: "#dc2626",
                      borderRadius: 999,
                      border: "1px solid #dc2626",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    Not Reconclied
                  </button>
                )}

                {/* Request Status Display */}
                <div style={{ marginTop: 12 }}>
                  {locationChanges[item.id] !== null && locationChanges[item.id] !== undefined && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                      {(() => {
                        const req = locationChanges[item.id];
                        if (!req) return null;
                        return (
                          <>
                            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                              Request: {req.from_location} → {req.to_location}
                            </div>
                            {req.status === "pending" && (
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", background: "#fef3c7", padding: "4px 8px", borderRadius: 4, display: "inline-block" }}>
                                Pending Approval
                              </div>
                            )}
                            {req.status === "approved" && (
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", background: "#d1fae5", padding: "4px 8px", borderRadius: 4, display: "inline-block" }}>
                                ✓ Approved
                              </div>
                            )}
                            {req.status === "denied" && (
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", background: "#fee2e2", padding: "4px 8px", borderRadius: 4, display: "inline-block" }}>
                                ✕ Denied
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
              </div>
              );
            })}
            {filteredCostItems.length === 0 && (
              <div style={{ 
                padding: 20, 
                textAlign: "center", 
                color: "#6b7280",
                fontWeight: 700 
              }}>
                No cost items for this filter.
              </div>
            )}
          </div>
        </div>

        {/* Right side: Unmatched Sold Items */}
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
            Sold To ({filteredSoldItems.length})
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            {filteredSoldItems.map((item, index) => (
              <div key={item.id}>
                {firstNotReconcliedSoldIndex === index && (
                  <div
                    style={{
                      marginBottom: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "#fef2f2",
                      border: "1px solid rgba(220,38,38,0.25)",
                      color: "#991b1b",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    Not Reconclied Yet
                  </div>
                )}
                <div
                  style={{
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 10,
                    padding: 12,
                    position: "relative",
                  }}
                >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 800 }}>
                    Item #: {item.item_number || "—"}
                  </div>
                  {soldToChangeLocationEnabled && (role === "admin" || role === "verifier") && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => {
                        setSelectedItemForLocation(item.id);
                        setSelectedItemType("sold");
                        setShowLocationModal(true);
                      }}
                      disabled={locationChangeLoading}
                      style={{
                        padding: "4px 10px",
                        background: "#367C2B",
                        color: "#FFC72C",
                        borderRadius: 6,
                        border: "2px solid #FFC72C",
                        cursor: locationChangeLoading ? "not-allowed" : "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Change Location
                    </button>
                  )}
                </div>
                {item.matched_cost_item_id && (
                  <div style={{ fontSize: 12, color: "#166534", fontWeight: 800, marginBottom: 6 }}>Reconclied</div>
                )}
                <div style={{ fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                  {item.customer_name || "Unknown Customer"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 2 }}>
                  Invoice: {item.invoice_number || "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                  Serial: {item.serial_number || "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                  Location: {item.location || "—"}
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                  {item.description || "—"}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: item.auto_reconclied ? 6 : 0 }}>
                  ${item.retail_price?.toFixed(2) ?? "0.00"}
                </div>
                {item.auto_reconclied && (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6366f1", marginBottom: 6, letterSpacing: "0.04em" }}>
                    AUTO REC.
                  </div>
                )}
                {item.matched_cost_item_id && role === "admin" && (
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => {
                      if (!window.confirm("Mark this sold item as Not Reconclied?")) return;
                      markNotReconcliedItem(undefined, item.id);
                    }}
                    disabled={loading}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      padding: "6px 12px",
                      background: "#fff",
                      color: "#dc2626",
                      borderRadius: 999,
                      border: "1px solid #dc2626",
                      cursor: loading ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    Not Reconclied
                  </button>
                )}
              </div>
              </div>
            ))}
            {filteredSoldItems.length === 0 && (
              <div style={{ 
                padding: 20, 
                textAlign: "center", 
                color: "#6b7280",
                fontWeight: 700 
              }}>
                No sold items for this filter.
              </div>
            )}
          </div>
        </div>
      </div>

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
            setSelectedItemType(null);
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
                    if (selectedItemType === "sold") {
                      const item = soldItems.find((i) => i.id === selectedItemForLocation);
                      if (item) {
                        submitSoldLocationChange(selectedItemForLocation, item.location || "", loc);
                      }
                      return;
                    }

                    const item = costItems.find((i) => i.id === selectedItemForLocation);
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
                setSelectedItemType(null);
              }}
              style={{
                marginTop: 16,
                width: "100%",
                padding: 10,
                background: "#e5e7eb",
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {locationMismatchPrompt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
          onClick={() => {
            if (loading || locationChangeLoading) return;
            setLocationMismatchPrompt(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "min(560px, 92vw)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 12, color: "#111827" }}>
              Location mismatch
            </h2>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 12 }}>
              Cost location and Sold To location are different.
            </div>
            <div
              style={{
                background: "#f9fafb",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
                fontSize: 13,
                color: "#111827",
              }}
            >
              <div style={{ marginBottom: 4 }}>
                <strong>Cost:</strong> {locationMismatchPrompt.costItem.location || "Unknown"}
              </div>
              <div>
                <strong>Sold To:</strong> {locationMismatchPrompt.soldItem.location || "Unknown"}
              </div>
            </div>

            <div style={{ fontSize: 14, color: "#111827", marginBottom: 14, fontWeight: 700 }}>
              Would you like to submit a cost-side location change request to match Sold To?
            </div>
            <div
              style={{
                marginBottom: 14,
                padding: "8px 10px",
                borderRadius: 8,
                background: "#f3f4f6",
                border: "1px solid rgba(0,0,0,0.1)",
                color: "#374151",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {role === "admin"
                ? "Admin: request auto-approves immediately and still appears in print queue."
                : "Non-admin: request stays pending until approved in Change Location."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                className="btn-secondary"
                onClick={continueReconcliedWithoutLocationRequest}
                disabled={loading || locationChangeLoading}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "#fff",
                  fontWeight: 700,
                  cursor: loading || locationChangeLoading ? "not-allowed" : "pointer",
                }}
              >
                No, reconcile
              </button>
              <button
                className="btn-primary"
                onClick={submitMismatchCostLocationRequest}
                disabled={loading || locationChangeLoading}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontWeight: 800,
                  cursor: loading || locationChangeLoading ? "not-allowed" : "pointer",
                }}
              >
                Yes, submit request + reconcile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
