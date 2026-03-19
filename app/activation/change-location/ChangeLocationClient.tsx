"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const REQUEST_VIEW_FILTER_KEY = "change-location-request-view-filter";
const PRINT_STATUS_FILTER_KEY = "change-location-print-status-filter";
const PRINT_SCOPE_FILTER_KEY = "change-location-print-scope-filter";
const PROCESSED_FILTER_KEY = "change-location-processed-filter";
const SOLD_TO_CHANGE_LOCATION_KEY = "sold_to_change_location_enabled";

type RequestViewFilter = "all" | "unprocessed" | "processed";
type PrintStatusFilter = "approved" | "all";
type PrintScopeFilter = "unprinted" | "all";
type ProcessedFilter = "all" | "approved" | "denied";

type LocationChangeRequest = {
  id: string;
  cost_item_id?: string | null;
  sold_item_id?: string | null;
  from_location: string;
  to_location: string;
  customer_name: string;
  amount: number | null;
  invoice_number?: string | null;
  order_number?: string | null;
  status: "pending" | "approved" | "denied";
  denial_reason: string | null;
  printed_at: string | null;
  created_at: string;
};

export default function ChangeLocationClient() {
  const [requests, setRequests] = useState<LocationChangeRequest[]>([]);
  const [locationAccounts, setLocationAccounts] = useState<Record<string, string>>({});
  const [soldLocationAccounts, setSoldLocationAccounts] = useState<Record<string, string>>({});
  const [soldToChangeLocationEnabled, setSoldToChangeLocationEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [selectedRequestForDeny, setSelectedRequestForDeny] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [printStatusFilter, setPrintStatusFilter] = useState<PrintStatusFilter>("approved");
  const [printPrintedFilter, setPrintPrintedFilter] = useState<PrintScopeFilter>("unprinted");
  const [processedFilter, setProcessedFilter] = useState<ProcessedFilter>("all");
  const [requestViewFilter, setRequestViewFilter] = useState<RequestViewFilter>("unprocessed");
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    try {
      const savedRequestViewFilter = localStorage.getItem(REQUEST_VIEW_FILTER_KEY);
      if (savedRequestViewFilter === "all" || savedRequestViewFilter === "unprocessed" || savedRequestViewFilter === "processed") {
        setRequestViewFilter(savedRequestViewFilter);
      }

      const savedPrintStatusFilter = localStorage.getItem(PRINT_STATUS_FILTER_KEY);
      if (savedPrintStatusFilter === "approved" || savedPrintStatusFilter === "all") {
        setPrintStatusFilter(savedPrintStatusFilter);
      }

      const savedPrintScopeFilter = localStorage.getItem(PRINT_SCOPE_FILTER_KEY);
      if (savedPrintScopeFilter === "unprinted" || savedPrintScopeFilter === "all") {
        setPrintPrintedFilter(savedPrintScopeFilter);
      }

      const savedProcessedFilter = localStorage.getItem(PROCESSED_FILTER_KEY);
      if (savedProcessedFilter === "all" || savedProcessedFilter === "approved" || savedProcessedFilter === "denied") {
        setProcessedFilter(savedProcessedFilter);
      }
    } catch (err) {
      console.error("Failed to load filters", err);
    } finally {
      setFiltersLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    try {
      localStorage.setItem(REQUEST_VIEW_FILTER_KEY, requestViewFilter);
      localStorage.setItem(PRINT_STATUS_FILTER_KEY, printStatusFilter);
      localStorage.setItem(PRINT_SCOPE_FILTER_KEY, printPrintedFilter);
      localStorage.setItem(PROCESSED_FILTER_KEY, processedFilter);
    } catch (err) {
      console.error("Failed to save filters", err);
    }
  }, [requestViewFilter, printStatusFilter, printPrintedFilter, processedFilter, filtersLoaded]);

  useEffect(() => {
    const abortController = new AbortController();
    let isMounted = true;

    const load = async () => {
      setMsg(null);
      setLoading(true);
      try {
        const res = await fetch("/api/activation/subscriptions/location-changes", {
          signal: abortController.signal,
        });
        const j = (await res.json()) as { requests?: LocationChangeRequest[]; error?: string };
        if (isMounted) {
          if (!res.ok) {
            setMsg(j?.error ?? "Failed to load requests");
          } else {
            setRequests(j.requests ?? []);
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted && !(err as Error).name?.includes('AbortError')) {
          console.error(err);
          setMsg("Failed to load requests");
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/location-accounts");
        if (!res.ok || !isMounted) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{
          location_name?: string | null;
          account_number?: string | null;
        }>;
        if (!isMounted) return;
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

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/sold-location-accounts");
        if (!res.ok || !isMounted) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{
          location_name?: string | null;
          account_number?: string | null;
        }>;
        if (!isMounted) return;
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

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/app-settings?key=${SOLD_TO_CHANGE_LOCATION_KEY}`);
        if (!res.ok || !isMounted) return;
        const j = await res.json();
        const row = (j?.data ?? [])[0] as { value?: string | null } | undefined;
        if (!isMounted) return;
        setSoldToChangeLocationEnabled(row?.value === "true");
      } catch {
        // ignore
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  async function approveRequest(requestId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/location-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", requestId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to approve request");
        setLoading(false);
        return;
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, ...j.request } : r))
      );

      setLoading(false);
    } catch (err) {
      console.error(err);
      setMsg("Failed to approve request");
      setLoading(false);
    }
  }

  const getAccountNumber = (request: LocationChangeRequest, location: string) => {
    if (request.sold_item_id) {
      return soldLocationAccounts[location] ?? "";
    }
    return locationAccounts[location] ?? "";
  };

  const renderAccountHtml = (request: LocationChangeRequest, location: string) => {
    const acct = getAccountNumber(request, location);
    return acct ? `<div class="location-acct">${acct}</div>` : "";
  };

  const getRequestTypeLabel = (request: LocationChangeRequest) =>
    request.sold_item_id ? "Retail" : "Cost";

  async function denyRequest() {
    if (!selectedRequestForDeny) return;
    
    if (!denyReason.trim()) {
      setMsg("Please provide a reason for denial");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/location-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deny",
          requestId: selectedRequestForDeny,
          denialReason: denyReason,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to deny request");
        setLoading(false);
        return;
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === selectedRequestForDeny ? { ...r, ...j.request } : r))
      );

      setShowDenyModal(false);
      setSelectedRequestForDeny(null);
      setDenyReason("");

      setLoading(false);
    } catch (err) {
      console.error(err);
      setMsg("Failed to deny request");
      setLoading(false);
    }
  }

  async function deleteRequest(requestId: string) {
    if (!window.confirm("Are you sure you want to delete this request?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/activation/subscriptions/location-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", requestId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to delete request");
        setLoading(false);
        return;
      }

      setRequests(prev => prev.filter(r => r.id !== requestId));
      setMsg("Request deleted successfully");

      setLoading(false);
    } catch (err) {
      console.error(err);
      setMsg("Failed to delete request");
      setLoading(false);
    }
  }

  const pending = requests.filter(r => r.status === "pending");
  const completedAll = requests.filter(r => r.status !== "pending");
  const completed = completedAll.filter((r) => {
    if (processedFilter === "all") return true;
    return r.status === processedFilter;
  });
  const showPendingSection = requestViewFilter === "all" || requestViewFilter === "unprocessed";
  const showProcessedSection = requestViewFilter === "all" || requestViewFilter === "processed";
  const printedCount = requests.filter((r) => Boolean(r.printed_at)).length;
  const unprintedCount = requests.length - printedCount;

  const printableRequests = requests.filter((r) => {
    if (printStatusFilter === "approved" && r.status !== "approved") return false;
    if (printPrintedFilter === "unprinted" && r.printed_at) return false;
    return true;
  });

  async function markRequestsPrinted(requestIds: string[]) {
    if (!requestIds.length) return;
    const res = await fetch("/api/activation/subscriptions/location-changes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markPrinted", requestIds }),
    });
    const j = (await res.json()) as { requests?: LocationChangeRequest[]; error?: string };
    if (!res.ok) {
      throw new Error(j?.error ?? "Failed to mark requests as printed");
    }

    const updatedMap = new Map((j.requests ?? []).map((r) => [r.id, r]));
    setRequests((prev) => prev.map((r) => {
      const updated = updatedMap.get(r.id);
      return updated ? { ...r, ...updated } : r;
    }));
  }

  async function saveReprintFile(approvedItems: LocationChangeRequest[], htmlContent: string) {
    const res = await fetch("/api/activation/subscriptions/location-change-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Approved Location Changes - ${new Date().toLocaleString()}`,
        requestCount: approvedItems.length,
        requestIds: approvedItems.map((r) => r.id),
        htmlContent,
      }),
    });

    const j = (await res.json()) as { file?: { id: string }; error?: string };
    if (!res.ok) {
      throw new Error(j?.error ?? "Failed to save reprint file");
    }

    return j.file;
  }

  const handlePrint = async (
    scope: "filtered" | "all",
    overrideFilters?: { status: "approved" | "all"; printed: "unprinted" | "all" },
    shouldMarkPrinted: boolean = false
  ) => {
    const isPrintNewApproved =
      shouldMarkPrinted &&
      scope === "filtered" &&
      overrideFilters?.status === "approved" &&
      overrideFilters?.printed === "unprinted";

    const filteredSource = requests.filter((r) => {
      const statusFilter = overrideFilters?.status ?? printStatusFilter;
      const printedFilter = overrideFilters?.printed ?? printPrintedFilter;
      if (statusFilter === "approved" && r.status !== "approved") return false;
      if (printedFilter === "unprinted" && r.printed_at) return false;
      return true;
    });

    const source = scope === "all" ? requests : filteredSource;
    const pending = source.filter(r => r.status === "pending");
    const approved = source.filter(r => r.status === "approved");
    const denied = source.filter(r => r.status === "denied");

    if (source.length === 0) {
      setMsg("No requests found for the selected print filters");
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>Location Change Requests</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #000; padding: 10px; text-align: left; }
            th { background-color: #367C2B; color: #FFC72C; font-weight: bold; }
            .section-title { font-size: 18px; font-weight: bold; margin: 20px 0 10px 0; }
            .print-date { margin-bottom: 20px; font-size: 12px; color: #666; }
            .location-boxes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .location-box { border: 1px solid #000; padding: 6px 8px; border-radius: 6px; }
            .location-label { font-weight: 700; margin-bottom: 4px; }
            .location-acct { font-size: 11px; color: #374151; font-weight: 600; }
          </style>
        </head>
        <body>
          <h1>${isPrintNewApproved ? "Approved Location Changes" : "Location Change Requests"}</h1>
          <div class="print-date">Printed: ${new Date().toLocaleString()}</div>

          <div class="section-title">Approved (${approved.length})</div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Customer Name</th>
                <th>Invoice #</th>
                <th>Sales Order #</th>
                <th>Amount</th>
                <th>From / To</th>
              </tr>
            </thead>
            <tbody>
              ${approved.map(r => `
                <tr>
                  <td>${getRequestTypeLabel(r)}</td>
                  <td>${r.customer_name}</td>
                  <td>${r.invoice_number || "—"}</td>
                  <td>${r.order_number || "—"}</td>
                  <td>$${(r.amount ?? 0).toFixed(2)}</td>
                  <td>
                    <div class="location-boxes">
                      <div class="location-box">
                        <div class="location-label">From</div>
                        <div>${r.from_location}</div>
                        ${renderAccountHtml(r, r.from_location)}
                      </div>
                      <div class="location-box">
                        <div class="location-label">To</div>
                        <div>${r.to_location}</div>
                        ${renderAccountHtml(r, r.to_location)}
                      </div>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${isPrintNewApproved ? "" : `
          <div class="section-title">Pending (${pending.length})</div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Customer Name</th>
                <th>Invoice #</th>
                <th>Sales Order #</th>
                <th>Amount</th>
                <th>From / To</th>
              </tr>
            </thead>
            <tbody>
              ${pending.map(r => `
                <tr>
                  <td>${getRequestTypeLabel(r)}</td>
                  <td>${r.customer_name}</td>
                  <td>${r.invoice_number || "—"}</td>
                  <td>${r.order_number || "—"}</td>
                  <td>$${(r.amount ?? 0).toFixed(2)}</td>
                  <td>
                    <div class="location-boxes">
                      <div class="location-box">
                        <div class="location-label">From</div>
                        <div>${r.from_location}</div>
                        ${renderAccountHtml(r, r.from_location)}
                      </div>
                      <div class="location-box">
                        <div class="location-label">To</div>
                        <div>${r.to_location}</div>
                        ${renderAccountHtml(r, r.to_location)}
                      </div>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">Denied (${denied.length})</div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Customer Name</th>
                <th>Invoice #</th>
                <th>Sales Order #</th>
                <th>Amount</th>
                <th>From / To</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              ${denied.map(r => `
                <tr>
                  <td>${getRequestTypeLabel(r)}</td>
                  <td>${r.customer_name}</td>
                  <td>${r.invoice_number || "—"}</td>
                  <td>${r.order_number || "—"}</td>
                  <td>$${(r.amount ?? 0).toFixed(2)}</td>
                  <td>
                    <div class="location-boxes">
                      <div class="location-box">
                        <div class="location-label">From</div>
                        <div>${r.from_location}</div>
                        ${renderAccountHtml(r, r.from_location)}
                      </div>
                      <div class="location-box">
                        <div class="location-label">To</div>
                        <div>${r.to_location}</div>
                        ${renderAccountHtml(r, r.to_location)}
                      </div>
                    </div>
                  </td>
                  <td>${r.denial_reason || "No reason provided"}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          `}
        </body>
      </html>
    `;

    const newWindow = window.open();
    if (!newWindow) {
      setMsg("Popup blocked. Please allow popups and try again.");
      return;
    }

    newWindow.document.write(printContent);
    newWindow.document.close();
    setTimeout(() => newWindow.print(), 250);

    let saveStatus: "not_applicable" | "saved" | "failed" = "not_applicable";
    if (isPrintNewApproved) {
      try {
        await saveReprintFile(approved, printContent);
        saveStatus = "saved";
      } catch (err) {
        console.error(err);
        saveStatus = "failed";
      }
    }

    const saveSuffix =
      saveStatus === "saved"
        ? " Saved to reprint files."
        : saveStatus === "failed"
          ? " Failed to save reprint file."
          : "";

    if (!shouldMarkPrinted) {
      setMsg(`Printed ${source.length} request(s).${saveSuffix}`);
      return;
    }

    const unprintedIds = source.filter((r) => !r.printed_at).map((r) => r.id);
    if (!unprintedIds.length) {
      setMsg(`Printed ${source.length} request(s). Nothing new to mark as printed.${saveSuffix}`);
      return;
    }

    try {
      await markRequestsPrinted(unprintedIds);
      setMsg(`Printed ${source.length} request(s). Marked ${unprintedIds.length} as printed.${saveSuffix}`);
    } catch (err) {
      console.error(err);
      setMsg(((err as Error).message || "Printed, but failed to mark requests as printed") + saveSuffix);
    }
  };

  function resetFilters() {
    setRequestViewFilter("unprocessed");
    setPrintStatusFilter("approved");
    setPrintPrintedFilter("unprinted");
    setProcessedFilter("all");

    try {
      localStorage.removeItem(REQUEST_VIEW_FILTER_KEY);
      localStorage.removeItem(PRINT_STATUS_FILTER_KEY);
      localStorage.removeItem(PRINT_SCOPE_FILTER_KEY);
      localStorage.removeItem(PROCESSED_FILTER_KEY);
    } catch (err) {
      console.error("Failed to reset filters", err);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
            Change Location
          </h1>
          <div
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.15)",
              background: soldToChangeLocationEnabled ? "#dcfce7" : "#f3f4f6",
              color: soldToChangeLocationEnabled ? "#166534" : "#4b5563",
              fontWeight: 800,
              fontSize: 12,
            }}
          >
            Sold-To Change Location: {soldToChangeLocationEnabled ? "On" : "Off"}
          </div>
        </div>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Review and approve location change requests for cost account items.
        </p>
        <p style={{ marginTop: 6, color: "#4b5563", fontSize: 13, fontWeight: 700 }}>
          Unprinted: {unprintedCount} • Printed: {printedCount}
        </p>
        <div style={{ marginTop: 10 }}>
          <Link
            href="/activation/change-location/files"
            style={{
              display: "inline-block",
              padding: "8px 14px",
              background: "#fff",
              color: "#367C2B",
              borderRadius: 8,
              border: "2px solid #367C2B",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Reprint Files
          </Link>
        </div>
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

      <div style={{ marginBottom: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>Request View:</label>
            <select
              value={requestViewFilter}
              onChange={(e) => setRequestViewFilter(e.target.value as RequestViewFilter)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 600 }}
            >
              <option value="all">All Requests</option>
              <option value="unprocessed">Unprocessed Only</option>
              <option value="processed">Processed Only</option>
            </select>
          </div>
          <button
            className="btn-secondary btn-sm"
            onClick={resetFilters}
          >
            Reset Filters
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>Print Status:</label>
          <select
            value={printStatusFilter}
            onChange={(e) => setPrintStatusFilter(e.target.value as "approved" | "all")}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 600 }}
          >
            <option value="approved">Approved Only</option>
            <option value="all">All Statuses</option>
          </select>

          <label style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>Print Scope:</label>
          <select
            value={printPrintedFilter}
            onChange={(e) => setPrintPrintedFilter(e.target.value as "unprinted" | "all")}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 600 }}
          >
            <option value="unprinted">Only Unprinted</option>
            <option value="all">Include Printed</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn-primary btn-lg"
            onClick={() => handlePrint("filtered", { status: "approved", printed: "unprinted" }, true)}
            disabled={loading || requests.filter((r) => r.status === "approved" && !r.printed_at).length === 0}
          >
            Print New Approved ({requests.filter((r) => r.status === "approved" && !r.printed_at).length})
          </button>

          <button
            className="btn-secondary btn-lg"
            onClick={() => handlePrint("filtered", undefined, false)}
            disabled={loading || printableRequests.length === 0}
          >
            Print Filtered ({printableRequests.length})
          </button>

          <button
            className="btn-secondary btn-lg"
            onClick={() => handlePrint("all", undefined, false)}
            disabled={loading || requests.length === 0}
          >
            Print Full List ({requests.length})
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
          Loading requests...
        </div>
      )}

      {!loading && requests.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
          No location change requests found.
        </div>
      )}

      {!loading && requests.length > 0 && (
        <>
          {showPendingSection && pending.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
                Pending ({pending.length})
              </h2>
              <div style={{ display: "grid", gap: 12 }}>
                {pending.map((request) => (
                  <div
                    key={request.id}
                    style={{
                      background: "#fff",
                      border: "2px solid #f59e0b",
                      borderRadius: 10,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: "#111827", marginBottom: 6, fontSize: 16 }}>
                          {request.customer_name}
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 3 }}>
                          Amount: ${(request.amount ?? 0).toFixed(2)}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 2 }}>
                          Invoice #: {request.invoice_number || "—"}
                        </div>
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                          Sales Order #: {request.order_number || "—"}
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7280" }}>
                          {request.from_location} → {request.to_location}
                        </div>
                        <div style={{ fontSize: 12, color: request.printed_at ? "#166534" : "#9a3412", fontWeight: 700, marginTop: 5 }}>
                          {request.printed_at ? `Printed ${new Date(request.printed_at).toLocaleString()}` : "Not printed"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => approveRequest(request.id)}
                        disabled={loading}
                        style={{
                          fontSize: 13,
                        }}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => {
                          setSelectedRequestForDeny(request.id);
                          setShowDenyModal(true);
                          setDenyReason("");
                        }}
                        disabled={loading}
                        style={{
                          fontSize: 13,
                        }}
                      >
                        Deny
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => deleteRequest(request.id)}
                        disabled={loading}
                        style={{
                          fontSize: 13,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {showProcessedSection && completed.length > 0 && (
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#6b7280" }}>
                  Processed ({completed.length}/{completedAll.length})
                </h2>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "#4b5563" }}>Filter:</label>
                  <select
                    value={processedFilter}
                    onChange={(e) => setProcessedFilter(e.target.value as "all" | "approved" | "denied")}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(0,0,0,0.15)",
                      background: "#fff",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    <option value="all">All</option>
                    <option value="approved">Approved</option>
                    <option value="denied">Denied</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {completed.map((request) => {
                  const isApproved = request.status === "approved";
                  return (
                    <div
                      key={request.id}
                      style={{
                        background: "#f9fafb",
                        border: `2px solid ${isApproved ? "#10b981" : "#dc2626"}`,
                        borderRadius: 10,
                        padding: 16,
                        opacity: 0.8,
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16 }}>
                        <div>
                          <div style={{ fontWeight: 800, color: "#6b7280", marginBottom: 6, fontSize: 16 }}>
                            {request.customer_name}
                          </div>
                          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 3 }}>
                            Amount: ${(request.amount ?? 0).toFixed(2)}
                          </div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 2 }}>
                            Invoice #: {request.invoice_number || "—"}
                          </div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 3 }}>
                            Sales Order #: {request.order_number || "—"}
                          </div>
                          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>
                            {request.from_location} → {request.to_location}
                          </div>
                          <div style={{ fontSize: 12, color: request.printed_at ? "#166534" : "#9a3412", fontWeight: 700, marginBottom: 5 }}>
                            {request.printed_at ? `Printed ${new Date(request.printed_at).toLocaleString()}` : "Not printed"}
                          </div>
                          {!isApproved && request.denial_reason && (
                            <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginTop: 8 }}>
                              Reason: {request.denial_reason}
                            </div>
                          )}
                        </div>
                        <div>
                          {isApproved ? (
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981", background: "#d1fae5", padding: "6px 12px", borderRadius: 4 }}>
                              ✓ Approved
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", background: "#fee2e2", padding: "6px 12px", borderRadius: 4 }}>
                              ✕ Denied
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "auto" }}>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => deleteRequest(request.id)}
                          disabled={loading}
                          style={{
                            fontSize: 12,
                            width: "fit-content",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
                {completed.length === 0 && completedAll.length > 0 && (
                  <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
                    No processed requests for this filter.
                  </div>
                )}
              </div>
            </section>
          )}

          {showPendingSection && pending.length === 0 && requestViewFilter === "unprocessed" && (
            <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
              No unprocessed requests found.
            </div>
          )}

          {showProcessedSection && completed.length === 0 && requestViewFilter === "processed" && (
            <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>
              No processed requests found.
            </div>
          )}
        </>
      )}

      {/* Deny Reason Modal */}
      {showDenyModal && (
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
            setShowDenyModal(false);
            setSelectedRequestForDeny(null);
            setDenyReason("");
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 450,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: "#111827" }}>
              Reason for Denial
            </h2>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Please provide a reason for denying this request..."
              style={{
                width: "100%",
                padding: 12,
                border: "1px solid rgba(0,0,0,0.15)",
                borderRadius: 8,
                fontFamily: "inherit",
                fontSize: 14,
                resize: "vertical",
                minHeight: 100,
                marginBottom: 16,
              }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                className="btn-danger"
                onClick={denyRequest}
                disabled={loading}
              >
                Deny
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowDenyModal(false);
                  setSelectedRequestForDeny(null);
                  setDenyReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
