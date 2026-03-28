"use client";

import { useEffect, useState } from "react";

const ACCOUNT_SEGMENT_LENGTHS = [2, 2, 3, 1] as const;
const SOLD_TO_CHANGE_LOCATION_KEY = "sold_to_change_location_enabled";
const AUTO_RECONCILE_DAYS_KEY = "auto_reconcile_days";

type AdminActionLog = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

function splitAccountNumber(value: string): [string, string, string, string] {
  const parts = value.split("-");
  return ACCOUNT_SEGMENT_LENGTHS.map((length, index) =>
    (parts[index] ?? "").replace(/\D/g, "").slice(0, length)
  ) as [string, string, string, string];
}

function joinAccountNumber(parts: [string, string, string, string]) {
  let lastNonEmpty = parts.length - 1;
  while (lastNonEmpty >= 0 && !parts[lastNonEmpty]) {
    lastNonEmpty -= 1;
  }
  return lastNonEmpty >= 0 ? parts.slice(0, lastNonEmpty + 1).join("-") : "";
}

export default function SettingsClient() {
  const [msg, setMsg] = useState<string | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [locationCodes, setLocationCodes] = useState<{ id: string; code: string; location_name: string }[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newCodeLocation, setNewCodeLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [codesLoading, setCodesLoading] = useState(true);
  const [locationAccounts, setLocationAccounts] = useState<Record<string, string>>({});
  const [soldLocationAccounts, setSoldLocationAccounts] = useState<Record<string, string>>({});
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [soldAccountMsg, setSoldAccountMsg] = useState<string | null>(null);
  const [featureMsg, setFeatureMsg] = useState<string | null>(null);
  const [savingLocationAccount, setSavingLocationAccount] = useState(false);
  const [savingSoldLocationAccount, setSavingSoldLocationAccount] = useState(false);
  const [openSection, setOpenSection] = useState<"locations" | "codes" | "xidConsultants" | "accounts" | "soldAccounts" | "autoReconcile" | "features" | "invoiceClear" | "auditLogs" | null>(null);
  const [activationGroupOpen, setActivationGroupOpen] = useState(false);
  const [systemGroupOpen, setSystemGroupOpen] = useState(false);
  const [soldToChangeLocationEnabled, setSoldToChangeLocationEnabled] = useState(false);
  const [autoReconcileDays, setAutoReconcileDays] = useState("60");
  const [autoReconcileMsg, setAutoReconcileMsg] = useState<string | null>(null);
  const [savingFeatureSettings, setSavingFeatureSettings] = useState(false);
  const [orderNumberToClear, setOrderNumberToClear] = useState("");
  const [orderClearMsg, setOrderClearMsg] = useState<string | null>(null);
  const [clearingOrder, setClearingOrder] = useState(false);
  const [invoiceNumberToClear, setInvoiceNumberToClear] = useState("");
  const [invoiceClearMsg, setInvoiceClearMsg] = useState<string | null>(null);
  const [clearingInvoice, setClearingInvoice] = useState(false);
  const [costUploadNumberToDelete, setCostUploadNumberToDelete] = useState("");
  const [retailUploadNumberToDelete, setRetailUploadNumberToDelete] = useState("");
  const [deleteUploadMsg, setDeleteUploadMsg] = useState<string | null>(null);
  const [deletingUploadByNumber, setDeletingUploadByNumber] = useState(false);
  const [nextCostUploadNumber, setNextCostUploadNumber] = useState("1");
  const [nextRetailUploadNumber, setNextRetailUploadNumber] = useState("1");
  const [resetUploadMsg, setResetUploadMsg] = useState<string | null>(null);
  const [resettingUploadNumber, setResettingUploadNumber] = useState(false);
  const [clearAllActivationMsg, setClearAllActivationMsg] = useState<string | null>(null);
  const [clearingAllActivation, setClearingAllActivation] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminActionLog[]>([]);
  const [auditLogMsg, setAuditLogMsg] = useState<string | null>(null);
  const [auditLogLimit, setAuditLogLimit] = useState(50);
  const [auditLogLoading, setAuditLogLoading] = useState(false);
  const [xidConsultants, setXidConsultants] = useState<{ id: string; xid: string; name: string }[]>([]);
  const [xidConsultantsLoading, setXidConsultantsLoading] = useState(true);
  const [newXid, setNewXid] = useState("");
  const [newXidName, setNewXidName] = useState("");
  const [xidMsg, setXidMsg] = useState<string | null>(null);

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
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/app-settings?key=${SOLD_TO_CHANGE_LOCATION_KEY}`);
        if (!res.ok) return;
        const j = await res.json();
        const row = (j?.data ?? [])[0] as { value?: string | null } | undefined;
        setSoldToChangeLocationEnabled(row?.value === "true");
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/app-settings?key=${AUTO_RECONCILE_DAYS_KEY}`);
        if (!res.ok) return;
        const j = await res.json();
        const row = (j?.data ?? [])[0] as { value?: string | null } | undefined;
        if (row?.value) setAutoReconcileDays(row.value);
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/location-codes");
        if (!res.ok) return;
        const j = await res.json();
        setLocationCodes(j?.data ?? []);
      } catch {
        // ignore
      } finally {
        setCodesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/xid-consultants");
        if (!res.ok) return;
        const j = await res.json();
        setXidConsultants(j?.data ?? []);
      } catch {
        // ignore
      } finally {
        setXidConsultantsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/location-accounts");
        if (!res.ok) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{ location_name?: string | null; account_number?: string | null }>;
        setLocationAccounts(
          rows.reduce<Record<string, string>>((acc, row) => {
            if (row.location_name && row.account_number) {
              acc[row.location_name] = row.account_number;
            }
            return acc;
          }, {})
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/sold-location-accounts");
        if (!res.ok) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{ location_name?: string | null; account_number?: string | null }>;
        setSoldLocationAccounts(
          rows.reduce<Record<string, string>>((acc, row) => {
            if (row.location_name && row.account_number) {
              acc[row.location_name] = row.account_number;
            }
            return acc;
          }, {})
        );
      } catch {
        // ignore
      }
    })();
  }, []);

  async function addLocation() {
    setMsg(null);
    const name = newLocation.trim();
    if (!name) return setMsg("Location name required");
    const res = await fetch("/api/admin/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to add location");
    setLocations((prev) => [j.data.name, ...prev.filter((p) => p !== j.data.name)]);
    setNewLocation("");
    setMsg("Location added ✅");
  }

  async function deleteLocation(name: string) {
    setMsg(null);
    if (!confirm(`Delete location ${name}?`)) return;
    const res = await fetch("/api/admin/locations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to delete location");
    setLocations((prev) => prev.filter((p) => p !== name));
    setMsg("Location removed ✅");
  }

  async function addLocationCode() {
    setCodeMsg(null);
    const code = newCode.trim().toUpperCase();
    const location_name = newCodeLocation.trim();
    if (!code || !location_name) return setCodeMsg("Code and location are required");

    const res = await fetch("/api/admin/location-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, location_name }),
    });
    const j = await res.json();
    if (!res.ok) return setCodeMsg(j?.error ?? "Failed to add location code");
    setLocationCodes((prev) => [j.data, ...prev.filter((p) => p.code !== j.data.code)]);
    setNewCode("");
    setNewCodeLocation("");
    setCodeMsg("Location code added ✅");
  }

  async function deleteLocationCode(id: string, code: string) {
    setCodeMsg(null);
    if (!confirm(`Delete code ${code}?`)) return;
    const res = await fetch("/api/admin/location-codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    if (!res.ok) return setCodeMsg(j?.error ?? "Failed to delete location code");
    setLocationCodes((prev) => prev.filter((p) => p.id !== id));
    setCodeMsg("Location code removed ✅");
  }

  async function addXidConsultant() {
    setXidMsg(null);
    const xid = newXid.trim().toUpperCase();
    const name = newXidName.trim();
    if (!xid || !name) return setXidMsg("XID and name are required");
    const res = await fetch("/api/admin/xid-consultants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xid, name }),
    });
    const j = await res.json();
    if (!res.ok) return setXidMsg(j?.error ?? "Failed to add consultant");
    setXidConsultants((prev) => [j.data, ...prev.filter((p) => p.xid !== j.data.xid)]);
    setNewXid("");
    setNewXidName("");
    setXidMsg("Consultant added ✅");
  }

  async function deleteXidConsultant(id: string, xid: string) {
    setXidMsg(null);
    if (!confirm(`Delete consultant ${xid}?`)) return;
    const res = await fetch("/api/admin/xid-consultants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    if (!res.ok) return setXidMsg(j?.error ?? "Failed to delete consultant");
    setXidConsultants((prev) => prev.filter((p) => p.id !== id));
    setXidMsg("Consultant removed ✅");
  }

  async function saveAllLocationAccounts() {
    setAccountMsg(null);
    setSavingLocationAccount(true);
    try {
      const failures: string[] = [];
      for (const locationName of locations) {
        const res = await fetch("/api/admin/location-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationName,
            accountNumber: locationAccounts[locationName] ?? "",
          }),
        });
        if (!res.ok) {
          failures.push(locationName);
        }
      }

      if (failures.length) {
        setAccountMsg(`Failed to save account numbers for: ${failures.join(", ")}`);
        return;
      }

      setAccountMsg("Account numbers saved ✅");
    } catch {
      setAccountMsg("Failed to save account numbers");
    } finally {
      setSavingLocationAccount(false);
    }
  }

  async function saveAllSoldLocationAccounts() {
    setSoldAccountMsg(null);
    setSavingSoldLocationAccount(true);
    try {
      const failures: string[] = [];
      for (const locationName of locations) {
        const res = await fetch("/api/admin/sold-location-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationName,
            accountNumber: soldLocationAccounts[locationName] ?? "",
          }),
        });
        if (!res.ok) {
          failures.push(locationName);
        }
      }

      if (failures.length) {
        setSoldAccountMsg(`Failed to save sold-to account numbers for: ${failures.join(", ")}`);
        return;
      }

      setSoldAccountMsg("Sold-to account numbers saved ✅");
    } catch {
      setSoldAccountMsg("Failed to save sold-to account numbers");
    } finally {
      setSavingSoldLocationAccount(false);
    }
  }

  async function saveFeatureToggles(nextValue?: boolean) {
    setFeatureMsg(null);
    setSavingFeatureSettings(true);
    const value = nextValue ?? soldToChangeLocationEnabled;
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: SOLD_TO_CHANGE_LOCATION_KEY,
          value: value ? "true" : "false",
        }),
      });
      const j = await res.json();
      if (!res.ok) return setFeatureMsg(j?.error ?? "Failed to save feature settings");
      setFeatureMsg("Feature settings saved ✅");
    } catch {
      setFeatureMsg("Failed to save feature settings");
    } finally {
      setSavingFeatureSettings(false);
    }
  }

  async function saveAutoReconcileDays() {
    setAutoReconcileMsg(null);
    const days = parseInt(autoReconcileDays, 10);
    if (isNaN(days) || days < 1) return setAutoReconcileMsg("Days must be a number greater than 0");
    setSavingFeatureSettings(true);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: AUTO_RECONCILE_DAYS_KEY, value: String(days) }),
      });
      const j = await res.json();
      if (!res.ok) return setAutoReconcileMsg(j?.error ?? "Failed to save");
      setAutoReconcileMsg("Saved ✅");
    } catch {
      setAutoReconcileMsg("Failed to save");
    } finally {
      setSavingFeatureSettings(false);
    }
  }

  async function clearSoldInvoiceNumber() {
    setInvoiceClearMsg(null);
    const invoiceNumber = invoiceNumberToClear.trim();
    if (!invoiceNumber) {
      setInvoiceClearMsg("Invoice number is required");
      return;
    }

    if (!confirm(`Clear all sold records with Invoice # ${invoiceNumber}?`)) {
      return;
    }

    setClearingInvoice(true);
    try {
      const res = await fetch("/api/admin/clear-sold-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber }),
      });
      const j = await res.json();
      if (!res.ok) {
        setInvoiceClearMsg(j?.error ?? "Failed to clear invoice number");
        return;
      }

      const count = Number(j?.deletedCount ?? 0);
      if (count === 0) {
        setInvoiceClearMsg(`No records found for Invoice # ${invoiceNumber}`);
      } else {
        setInvoiceClearMsg(`Removed ${count} sold record(s) for Invoice # ${invoiceNumber} ✅`);
      }
      setInvoiceNumberToClear("");
    } catch {
      setInvoiceClearMsg("Failed to clear invoice number");
    } finally {
      setClearingInvoice(false);
    }
  }

  async function clearCostOrderNumber() {
    setOrderClearMsg(null);
    const orderNumber = orderNumberToClear.trim();
    if (!orderNumber) {
      setOrderClearMsg("Order number is required");
      return;
    }

    if (!confirm(`Clear all cost records with Order # ${orderNumber}?`)) {
      return;
    }

    setClearingOrder(true);
    try {
      const res = await fetch("/api/admin/clear-cost-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const j = await res.json();
      if (!res.ok) {
        setOrderClearMsg(j?.error ?? "Failed to clear order number");
        return;
      }

      const count = Number(j?.deletedCount ?? 0);
      if (count === 0) {
        setOrderClearMsg(`No records found for Order # ${orderNumber}`);
      } else {
        setOrderClearMsg(`Removed ${count} cost record(s) for Order # ${orderNumber} ✅`);
      }
      setOrderNumberToClear("");
    } catch {
      setOrderClearMsg("Failed to clear order number");
    } finally {
      setClearingOrder(false);
    }
  }

  async function clearAllActivationData() {
    setClearAllActivationMsg(null);

    const confirmed = confirm(
      "WARNING: This will clear ALL Activation data (cost, retail, matches, and location changes). Continue?",
    );
    if (!confirmed) return;

    const confirmationText = prompt('Type "WEB DEV ONLY" to confirm full Activation data reset:');
    if (confirmationText !== "WEB DEV ONLY") {
      setClearAllActivationMsg('Confirmation did not match. Type exactly "WEB DEV ONLY".');
      return;
    }

    setClearingAllActivation(true);
    try {
      const res = await fetch("/api/admin/clear-activation-data", {
        method: "POST",
      });

      const j = await res.json();
      if (!res.ok) {
        setClearAllActivationMsg(j?.error ?? "Failed to clear activation data");
        return;
      }

      setClearAllActivationMsg("All Activation data cleared ✅");
      setOrderNumberToClear("");
      setInvoiceNumberToClear("");
      setCostUploadNumberToDelete("");
      setRetailUploadNumberToDelete("");
      setOrderClearMsg(null);
      setInvoiceClearMsg(null);
      setDeleteUploadMsg(null);
    } catch {
      setClearAllActivationMsg("Failed to clear activation data");
    } finally {
      setClearingAllActivation(false);
    }
  }

  async function deleteUploadByNumber(kind: "cost" | "sold") {
    setDeleteUploadMsg(null);
    const sourceValue = kind === "cost" ? costUploadNumberToDelete : retailUploadNumberToDelete;
    const uploadNumber = Number(sourceValue.trim());

    if (!Number.isInteger(uploadNumber) || uploadNumber < 1) {
      setDeleteUploadMsg("Upload number must be a whole number greater than 0");
      return;
    }

    const confirmed = confirm(
      `Delete ${kind === "cost" ? "Cost" : "Retail"} upload #${uploadNumber}? This removes file, items, and storage object.`,
    );
    if (!confirmed) return;

    setDeletingUploadByNumber(true);
    try {
      const res = await fetch("/api/activation/subscriptions/delete-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, uploadNumber }),
      });
      const j = await res.json();
      if (!res.ok) {
        setDeleteUploadMsg(j?.error ?? "Failed to delete upload by number");
        return;
      }

      setDeleteUploadMsg(`${kind === "cost" ? "Cost" : "Retail"} upload #${uploadNumber} deleted ✅`);
      if (kind === "cost") setCostUploadNumberToDelete("");
      else setRetailUploadNumberToDelete("");
    } catch {
      setDeleteUploadMsg("Failed to delete upload by number");
    } finally {
      setDeletingUploadByNumber(false);
    }
  }

  async function resetUploadNumber(kind: "cost" | "sold") {
    setResetUploadMsg(null);
    const sourceValue = kind === "cost" ? nextCostUploadNumber : nextRetailUploadNumber;
    const nextNumber = Number(sourceValue.trim());

    if (!Number.isInteger(nextNumber) || nextNumber < 1) {
      setResetUploadMsg("Next upload number must be a whole number greater than 0");
      return;
    }

    const confirmed = confirm(
      `Reset ${kind === "cost" ? "Cost" : "Retail"} document upload number so the next upload uses #${nextNumber}?`,
    );
    if (!confirmed) return;

    setResettingUploadNumber(true);
    try {
      const res = await fetch("/api/admin/reset-activation-upload-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, nextNumber }),
      });
      const j = await res.json();
      if (!res.ok) {
        setResetUploadMsg(j?.error ?? "Failed to reset upload number");
        return;
      }

      setResetUploadMsg(`${kind === "cost" ? "Cost" : "Retail"} next upload number set to ${nextNumber} ✅`);
    } catch {
      setResetUploadMsg("Failed to reset upload number");
    } finally {
      setResettingUploadNumber(false);
    }
  }

  async function loadAuditLogs(nextLimit?: number) {
    setAuditLogMsg(null);
    setAuditLogLoading(true);
    try {
      const limit = nextLimit ?? auditLogLimit;
      const res = await fetch(`/api/admin/action-logs?limit=${limit}`);
      const j = await res.json();
      if (!res.ok) {
        setAuditLogMsg(j?.error ?? "Failed to load audit logs");
        return;
      }

      setAuditLogs((j?.data ?? []) as AdminActionLog[]);
    } catch {
      setAuditLogMsg("Failed to load audit logs");
    } finally {
      setAuditLogLoading(false);
    }
  }

  function formatDateTime(value: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  }

  function formatDetails(details: Record<string, unknown> | null) {
    if (!details || Object.keys(details).length === 0) return "No details";
    const text = JSON.stringify(details);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#FFC72C", marginBottom: 8 }}>
          Settings
        </h1>
      </header>

      <div style={{ maxWidth: 600 }}>
        <section style={{ marginBottom: 16, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "locations" ? null : "locations"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>Manage Locations</span>
            <span>{openSection === "locations" ? "▾" : "▸"}</span>
          </button>
          {openSection === "locations" && (
            <div style={{ padding: "14px 14px 16px" }}>
              <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
                Manage available locations used by user profiles.
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="New location name"
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    minWidth: 220,
                    background: "white",
                    color: "#111827",
                    fontWeight: 500,
                  }}
                />
                <button
                  className="btn-primary"
                  onClick={addLocation}
                  style={{
                    padding: "10px 16px",
                    background: "#FFC72C",
                    color: "#111827",
                    borderRadius: 8,
                    border: "2px solid #FFC72C",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Add Location
                </button>
              </div>

              {msg && (
                <div
                  style={{
                    marginBottom: 16,
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

              {loading ? (
                <div style={{ color: "#6b7280" }}>Loading locations...</div>
              ) : locations.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No locations yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {locations.map((l) => (
                    <div
                      key={l}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#000000" }}>{l}</div>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => deleteLocation(l)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div style={{ marginBottom: 16, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setActivationGroupOpen((prev) => !prev)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}
          >
            <span>Activation Setup</span>
            <span>{activationGroupOpen ? "▾" : "▸"}</span>
          </button>
          {activationGroupOpen && (
            <div style={{ padding: "8px 8px 8px" }}>

        <section style={{ marginBottom: 8, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "codes" ? null : "codes"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>ISACTIVE Location Codes</span>
            <span>{openSection === "codes" ? "▾" : "▸"}</span>
          </button>
          {openSection === "codes" && (
            <div style={{ padding: "14px 14px 16px" }}>
              <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
                Map invoice codes (e.g., ISACTIVE1) to a location.
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Code (e.g., ISACTIVE1)"
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    minWidth: 220,
                    background: "white",
                    color: "#111827",
                    fontWeight: 500,
                  }}
                />
                <select
                  value={newCodeLocation}
                  onChange={(e) => setNewCodeLocation(e.target.value)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    minWidth: 220,
                    background: "white",
                    color: "#111827",
                    fontWeight: 500,
                  }}
                >
                  <option value="">Select location</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary"
                  onClick={addLocationCode}
                  style={{
                    padding: "10px 16px",
                    background: "#FFC72C",
                    color: "#111827",
                    borderRadius: 8,
                    border: "2px solid #FFC72C",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Add Code
                </button>
              </div>

              {codeMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    color: "#111827",
                    fontWeight: 700,
                  }}
                >
                  {codeMsg}
                </div>
              )}

              {codesLoading ? (
                <div style={{ color: "#6b7280" }}>Loading codes...</div>
              ) : locationCodes.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No codes yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {locationCodes.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#000000" }}>
                        {row.code} → {row.location_name}
                      </div>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => deleteLocationCode(row.id, row.code)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 16, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "xidConsultants" ? null : "xidConsultants"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>XID to IS Consultant Name</span>
            <span>{openSection === "xidConsultants" ? "▾" : "▸"}</span>
          </button>
          {openSection === "xidConsultants" && (
            <div style={{ padding: "14px 14px 16px" }}>
              <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
                Map an XID (e.g., JSMITH) to an IS Consultant&apos;s full name. Used to display names on the cost page.
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <input
                  value={newXid}
                  onChange={(e) => setNewXid(e.target.value)}
                  placeholder="XID (e.g., JSMITH)"
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    minWidth: 160,
                    background: "white",
                    color: "#111827",
                    fontWeight: 500,
                  }}
                />
                <input
                  value={newXidName}
                  onChange={(e) => setNewXidName(e.target.value)}
                  placeholder="Full name"
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    minWidth: 200,
                    background: "white",
                    color: "#111827",
                    fontWeight: 500,
                  }}
                />
                <button
                  className="btn-primary"
                  onClick={addXidConsultant}
                  style={{
                    padding: "10px 16px",
                    background: "#FFC72C",
                    color: "#111827",
                    borderRadius: 8,
                    border: "2px solid #FFC72C",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Add
                </button>
              </div>

              {xidMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    color: "#111827",
                    fontWeight: 700,
                  }}
                >
                  {xidMsg}
                </div>
              )}

              {xidConsultantsLoading ? (
                <div style={{ color: "#6b7280" }}>Loading consultants...</div>
              ) : xidConsultants.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No consultants mapped yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {xidConsultants.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#000000" }}>
                        {row.xid} → {row.name}
                      </div>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => deleteXidConsultant(row.id, row.xid)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 24, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "accounts" ? null : "accounts"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>Activation Cost Account #</span>
            <span>{openSection === "accounts" ? "▾" : "▸"}</span>
          </button>
          {openSection === "accounts" && (
            <div style={{ padding: "14px 14px 16px" }}>
              <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
                Set account numbers by location for Change Location print files.
              </p>

              {accountMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    color: "#111827",
                    fontWeight: 700,
                  }}
                >
                  {accountMsg}
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <button
                  className="btn-primary btn-sm"
                  onClick={saveAllLocationAccounts}
                  disabled={savingLocationAccount}
                >
                  {savingLocationAccount ? "Saving..." : "Save All"}
                </button>
              </div>

              {loading ? (
                <div style={{ color: "#6b7280" }}>Loading locations...</div>
              ) : locations.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No locations yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {locations.map((locationName) => (
                    <div
                      key={`location-account-${locationName}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 1.5fr)",
                        gap: 8,
                        alignItems: "center",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#111827" }}>{locationName}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {(() => {
                          const segments = splitAccountNumber(locationAccounts[locationName] ?? "");
                          return (
                            <>
                              {segments.map((segment, segmentIndex) => (
                                <div key={`${locationName}-segment-${segmentIndex}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input
                                    id={`settings-account-${locationName}-${segmentIndex}`}
                                    inputMode="numeric"
                                    maxLength={ACCOUNT_SEGMENT_LENGTHS[segmentIndex]}
                                    value={segment}
                                    onChange={(e) => {
                                      const sanitized = e.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, ACCOUNT_SEGMENT_LENGTHS[segmentIndex]);
                                      const next = [...segments] as [string, string, string, string];
                                      next[segmentIndex] = sanitized;
                                      setLocationAccounts((prev) => ({
                                        ...prev,
                                        [locationName]: joinAccountNumber(next),
                                      }));

                                      const isSegmentComplete =
                                        sanitized.length === ACCOUNT_SEGMENT_LENGTHS[segmentIndex];
                                      if (isSegmentComplete && segmentIndex < ACCOUNT_SEGMENT_LENGTHS.length - 1) {
                                        const nextInputId = `settings-account-${locationName}-${segmentIndex + 1}`;
                                        const nextInput = document.getElementById(nextInputId) as HTMLInputElement | null;
                                        nextInput?.focus();
                                      }
                                    }}
                                    placeholder={"0".repeat(ACCOUNT_SEGMENT_LENGTHS[segmentIndex])}
                                    style={{
                                      width: `${Math.max(52, ACCOUNT_SEGMENT_LENGTHS[segmentIndex] * 18)}px`,
                                      padding: "8px 8px",
                                      textAlign: "center",
                                      borderRadius: 8,
                                      border: "1px solid rgba(0,0,0,0.12)",
                                      background: "white",
                                      color: "#111827",
                                      fontWeight: 700,
                                    }}
                                  />
                                  {segmentIndex < segments.length - 1 && (
                                    <span style={{ color: "#6b7280", fontWeight: 800 }}>-</span>
                                  )}
                                </div>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 24, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "soldAccounts" ? null : "soldAccounts"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>Activation Sold Account #</span>
            <span>{openSection === "soldAccounts" ? "▾" : "▸"}</span>
          </button>
          {openSection === "soldAccounts" && (
            <div style={{ padding: "14px 14px 16px" }}>
              <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
                Set sold-to account numbers by location for Sold-To Change Location print files.
              </p>

              {soldAccountMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#f9fafb",
                    border: "1px solid rgba(0,0,0,0.12)",
                    color: "#111827",
                    fontWeight: 700,
                  }}
                >
                  {soldAccountMsg}
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <button
                  className="btn-primary btn-sm"
                  onClick={saveAllSoldLocationAccounts}
                  disabled={savingSoldLocationAccount}
                >
                  {savingSoldLocationAccount ? "Saving..." : "Save All Sold-To Accounts"}
                </button>
              </div>

              {loading ? (
                <div style={{ color: "#6b7280" }}>Loading locations...</div>
              ) : locations.length === 0 ? (
                <div style={{ color: "#6b7280" }}>No locations yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {locations.map((locationName) => (
                    <div
                      key={`sold-location-account-${locationName}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 1.5fr)",
                        gap: 8,
                        alignItems: "center",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.06)",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#111827" }}>{locationName}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {(() => {
                          const segments = splitAccountNumber(soldLocationAccounts[locationName] ?? "");
                          return (
                            <>
                              {segments.map((segment, segmentIndex) => (
                                <div key={`${locationName}-sold-segment-${segmentIndex}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input
                                    id={`settings-sold-account-${locationName}-${segmentIndex}`}
                                    inputMode="numeric"
                                    maxLength={ACCOUNT_SEGMENT_LENGTHS[segmentIndex]}
                                    value={segment}
                                    onChange={(e) => {
                                      const sanitized = e.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, ACCOUNT_SEGMENT_LENGTHS[segmentIndex]);
                                      const next = [...segments] as [string, string, string, string];
                                      next[segmentIndex] = sanitized;
                                      setSoldLocationAccounts((prev) => ({
                                        ...prev,
                                        [locationName]: joinAccountNumber(next),
                                      }));

                                      const isSegmentComplete =
                                        sanitized.length === ACCOUNT_SEGMENT_LENGTHS[segmentIndex];
                                      if (isSegmentComplete && segmentIndex < ACCOUNT_SEGMENT_LENGTHS.length - 1) {
                                        const nextInputId = `settings-sold-account-${locationName}-${segmentIndex + 1}`;
                                        const nextInput = document.getElementById(nextInputId) as HTMLInputElement | null;
                                        nextInput?.focus();
                                      }
                                    }}
                                    placeholder={"0".repeat(ACCOUNT_SEGMENT_LENGTHS[segmentIndex])}
                                    style={{
                                      width: `${Math.max(52, ACCOUNT_SEGMENT_LENGTHS[segmentIndex] * 18)}px`,
                                      padding: "8px 8px",
                                      textAlign: "center",
                                      borderRadius: 8,
                                      border: "1px solid rgba(0,0,0,0.12)",
                                      background: "white",
                                      color: "#111827",
                                      fontWeight: 700,
                                    }}
                                  />
                                  {segmentIndex < segments.length - 1 && (
                                    <span style={{ color: "#6b7280", fontWeight: 800 }}>-</span>
                                  )}
                                </div>
                              ))}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ marginBottom: 8, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "autoReconcile" ? null : "autoReconcile"))}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}
          >
            <span>Auto Reconcile Settings</span>
            <span>{openSection === "autoReconcile" ? "▾" : "▸"}</span>
          </button>
          {openSection === "autoReconcile" && (
            <div style={{ padding: "14px 14px 16px" }}>
              <p style={{ marginBottom: 16, color: "#374151", fontSize: 14 }}>
                Maximum days allowed between the cost contract start date and sold invoice date for an auto-reconcile match. Default is 60.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input
                  type="number"
                  min={1}
                  value={autoReconcileDays}
                  onChange={(e) => setAutoReconcileDays(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", width: 100, background: "white", color: "#111827", fontWeight: 600 }}
                />
                <span style={{ fontWeight: 600, color: "#374151" }}>days</span>
                <button
                  className="btn-primary btn-sm"
                  onClick={saveAutoReconcileDays}
                  disabled={savingFeatureSettings}
                >
                  Save
                </button>
              </div>
              {autoReconcileMsg && <div style={{ color: "#14532d", fontWeight: 700 }}>{autoReconcileMsg}</div>}
            </div>
          )}
        </section>

            </div>
          )}
        </div>

        <section style={{ marginBottom: 24, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "features" ? null : "features"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>Feature Toggles</span>
            <span>{openSection === "features" ? "▾" : "▸"}</span>
          </button>
          {openSection === "features" && (
            <div style={{ padding: "14px 14px 16px", display: "grid", gap: 12 }}>
              <label className="toggle-switch" style={{ fontWeight: 700, color: "#111827" }}>
                <input
                  type="checkbox"
                  checked={soldToChangeLocationEnabled}
                  onChange={(e) => {
                    const nextValue = e.target.checked;
                    setSoldToChangeLocationEnabled(nextValue);
                    saveFeatureToggles(nextValue);
                  }}
                  disabled={savingFeatureSettings}
                />
                <span className="toggle-slider" />
                <span>Enable Sold-To Change Location</span>
              </label>

              {featureMsg && <div style={{ color: "#14532d", fontWeight: 700 }}>{featureMsg}</div>}
            </div>
          )}
        </section>

        <div style={{ marginBottom: 16, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setSystemGroupOpen((prev) => !prev)}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 12, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}
          >
            <span>System</span>
            <span>{systemGroupOpen ? "▾" : "▸"}</span>
          </button>
          {systemGroupOpen && (
            <div style={{ padding: "8px 8px 8px" }}>

        <section style={{ marginBottom: 8, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => setOpenSection((prev) => (prev === "invoiceClear" ? null : "invoiceClear"))}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>Clear Cost / Retail Duplicates</span>
            <span>{openSection === "invoiceClear" ? "▾" : "▸"}</span>
          </button>
          {openSection === "invoiceClear" && (
            <div style={{ padding: "14px 14px 16px", display: "grid", gap: 12 }}>
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(220,38,38,0.35)",
                  background: "#fef2f2",
                  color: "#991b1b",
                  fontWeight: 800,
                }}
              >
                WARNING: This tool can clear all data in the Activation pages. WEB DEV ONLY.
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", display: "grid", gap: 10 }}>
                <div style={{ margin: 0, color: "#374151", fontSize: 14, fontWeight: 700 }}>
                  Clear ALL Activation Data
                </div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  Removes all cost + retail uploads, parsed items, and location-change data.
                </div>
                <div>
                  <button
                    className="btn-danger"
                    onClick={clearAllActivationData}
                    disabled={clearingAllActivation}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#dc2626",
                      color: "#ffffff",
                      fontWeight: 800,
                      cursor: clearingAllActivation ? "not-allowed" : "pointer",
                      opacity: clearingAllActivation ? 0.7 : 1,
                    }}
                  >
                    {clearingAllActivation ? "Clearing All..." : "Clear All Activation Data"}
                  </button>
                </div>

                {clearAllActivationMsg && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid rgba(0,0,0,0.12)",
                      color: "#111827",
                      fontWeight: 700,
                    }}
                  >
                    {clearAllActivationMsg}
                  </div>
                )}
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", display: "grid", gap: 10 }}>
                <div style={{ margin: 0, color: "#374151", fontSize: 14, fontWeight: 700 }}>
                  Delete Upload by Document Number
                </div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  Use admin doc numbers (Cost: C-YEAR-XX, Retail: R-YEAR-XX). Enter only XX.
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={costUploadNumberToDelete}
                    onChange={(e) => setCostUploadNumberToDelete(e.target.value.replace(/\D/g, ""))}
                    placeholder="Cost XX"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      minWidth: 120,
                      background: "white",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  />
                  <button
                    className="btn-danger"
                    onClick={() => deleteUploadByNumber("cost")}
                    disabled={deletingUploadByNumber}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#fef2f2",
                      color: "#991b1b",
                      fontWeight: 800,
                      cursor: deletingUploadByNumber ? "not-allowed" : "pointer",
                      opacity: deletingUploadByNumber ? 0.7 : 1,
                    }}
                  >
                    {deletingUploadByNumber ? "Deleting..." : "Delete Cost Upload #"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={retailUploadNumberToDelete}
                    onChange={(e) => setRetailUploadNumberToDelete(e.target.value.replace(/\D/g, ""))}
                    placeholder="Retail XX"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      minWidth: 120,
                      background: "white",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  />
                  <button
                    className="btn-danger"
                    onClick={() => deleteUploadByNumber("sold")}
                    disabled={deletingUploadByNumber}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#fef2f2",
                      color: "#991b1b",
                      fontWeight: 800,
                      cursor: deletingUploadByNumber ? "not-allowed" : "pointer",
                      opacity: deletingUploadByNumber ? 0.7 : 1,
                    }}
                  >
                    {deletingUploadByNumber ? "Deleting..." : "Delete Retail Upload #"}
                  </button>
                </div>

                {deleteUploadMsg && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid rgba(0,0,0,0.12)",
                      color: "#111827",
                      fontWeight: 700,
                    }}
                  >
                    {deleteUploadMsg}
                  </div>
                )}
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", display: "grid", gap: 10 }}>
                <div style={{ margin: 0, color: "#374151", fontSize: 14, fontWeight: 700 }}>
                  Reset Document Upload Number
                </div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  Sets the next document number used in C-YEAR-XX and R-YEAR-XX labels.
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={nextCostUploadNumber}
                    onChange={(e) => setNextCostUploadNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="Next Cost XX"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      minWidth: 140,
                      background: "white",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  />
                  <button
                    className="btn-danger"
                    onClick={() => resetUploadNumber("cost")}
                    disabled={resettingUploadNumber}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#fff",
                      color: "#991b1b",
                      fontWeight: 800,
                      cursor: resettingUploadNumber ? "not-allowed" : "pointer",
                      opacity: resettingUploadNumber ? 0.7 : 1,
                    }}
                  >
                    {resettingUploadNumber ? "Saving..." : "Reset Cost Doc #"}
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={nextRetailUploadNumber}
                    onChange={(e) => setNextRetailUploadNumber(e.target.value.replace(/\D/g, ""))}
                    placeholder="Next Retail XX"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      minWidth: 140,
                      background: "white",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  />
                  <button
                    className="btn-danger"
                    onClick={() => resetUploadNumber("sold")}
                    disabled={resettingUploadNumber}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#fff",
                      color: "#991b1b",
                      fontWeight: 800,
                      cursor: resettingUploadNumber ? "not-allowed" : "pointer",
                      opacity: resettingUploadNumber ? 0.7 : 1,
                    }}
                  >
                    {resettingUploadNumber ? "Saving..." : "Reset Retail Doc #"}
                  </button>
                </div>

                {resetUploadMsg && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid rgba(0,0,0,0.12)",
                      color: "#111827",
                      fontWeight: 700,
                    }}
                  >
                    {resetUploadMsg}
                  </div>
                )}
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", display: "grid", gap: 10 }}>
                <div style={{ margin: 0, color: "#374151", fontSize: 14, fontWeight: 700 }}>
                  Clear Cost by Order #
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={orderNumberToClear}
                    onChange={(e) => setOrderNumberToClear(e.target.value)}
                    placeholder="Order number"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      minWidth: 220,
                      background: "white",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  />
                  <button
                    className="btn-danger"
                    onClick={clearCostOrderNumber}
                    disabled={clearingOrder}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#fef2f2",
                      color: "#991b1b",
                      fontWeight: 800,
                      cursor: clearingOrder ? "not-allowed" : "pointer",
                      opacity: clearingOrder ? 0.7 : 1,
                    }}
                  >
                    {clearingOrder ? "Clearing..." : "Clear Cost Order"}
                  </button>
                </div>

                {orderClearMsg && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid rgba(0,0,0,0.12)",
                      color: "#111827",
                      fontWeight: 700,
                    }}
                  >
                    {orderClearMsg}
                  </div>
                )}
              </div>

              <div style={{ padding: 12, borderRadius: 10, background: "#fff", border: "1px solid rgba(0,0,0,0.08)", display: "grid", gap: 10 }}>
                <div style={{ margin: 0, color: "#374151", fontSize: 14, fontWeight: 700 }}>
                  Clear Retail by Invoice #
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={invoiceNumberToClear}
                    onChange={(e) => setInvoiceNumberToClear(e.target.value)}
                    placeholder="Invoice number"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid rgba(0,0,0,0.12)",
                      minWidth: 220,
                      background: "white",
                      color: "#111827",
                      fontWeight: 500,
                    }}
                  />
                  <button
                    className="btn-danger"
                    onClick={clearSoldInvoiceNumber}
                    disabled={clearingInvoice}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: "1px solid rgba(220,38,38,0.35)",
                      background: "#fef2f2",
                      color: "#991b1b",
                      fontWeight: 800,
                      cursor: clearingInvoice ? "not-allowed" : "pointer",
                      opacity: clearingInvoice ? 0.7 : 1,
                    }}
                  >
                    {clearingInvoice ? "Clearing..." : "Clear Retail Invoice"}
                  </button>
                </div>

                {invoiceClearMsg && (
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid rgba(0,0,0,0.12)",
                      color: "#111827",
                      fontWeight: 700,
                    }}
                  >
                    {invoiceClearMsg}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section style={{ marginBottom: 24, background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
          <button
            className="btn-secondary"
            onClick={() => {
              const nextOpen = openSection === "auditLogs" ? null : "auditLogs";
              setOpenSection(nextOpen);
              if (nextOpen === "auditLogs") {
                void loadAuditLogs();
              }
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontWeight: 800,
            }}
          >
            <span>Admin Audit Logs</span>
            <span>{openSection === "auditLogs" ? "▾" : "▸"}</span>
          </button>
          {openSection === "auditLogs" && (
            <div style={{ padding: "14px 14px 16px", display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ color: "#374151", fontWeight: 700 }}>Rows:</label>
                <select
                  value={auditLogLimit}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setAuditLogLimit(next);
                    void loadAuditLogs(next);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "white",
                    color: "#111827",
                    fontWeight: 600,
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => void loadAuditLogs()}
                  disabled={auditLogLoading}
                >
                  {auditLogLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              {auditLogMsg && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "#fef2f2",
                    border: "1px solid rgba(220,38,38,0.2)",
                    color: "#991b1b",
                    fontWeight: 700,
                  }}
                >
                  {auditLogMsg}
                </div>
              )}

              {auditLogLoading && auditLogs.length === 0 ? (
                <div style={{ color: "#6b7280", fontWeight: 700 }}>Loading logs...</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ color: "#6b7280", fontWeight: 700 }}>No logs yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        background: "#fff",
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 8,
                        padding: 10,
                        display: "grid",
                        gap: 4,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: "#111827" }}>{log.action}</div>
                      <div style={{ color: "#374151", fontSize: 12 }}>
                        {formatDateTime(log.created_at)} · {log.actor_email ?? log.actor_id ?? "Unknown admin"}
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {formatDetails(log.details)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
