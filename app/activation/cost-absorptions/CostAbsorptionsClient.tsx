"use client";

import { useEffect, useState } from "react";

type OverrideStatus = "pending" | "approved" | "denied" | "cancelled";

type CostAbsorptionOverride = {
  id: string;
  cost_item_id: string;
  override_person_name: string;
  reason: string;
  amount: number;
  status: OverrideStatus;
  requested_by_email: string | null;
  reviewed_by_email: string | null;
  denial_reason: string | null;
  synthetic_sold_item_id: string | null;
  created_at: string;
  customer_name?: string | null;
  serial_number?: string | null;
  item_number?: string | null;
  invoice_number?: string | null;
  location?: string | null;
};

type CostItemGroup = {
  cost_item_id: string;
  current: CostAbsorptionOverride;
  history: CostAbsorptionOverride[];
  // cost item fields from first entry
  customer_name: string | null;
  serial_number: string | null;
  item_number: string | null;
  invoice_number: string | null;
  location: string | null;
  amount: number;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: OverrideStatus }) {
  const map: Record<OverrideStatus, { label: string; bg: string; color: string }> = {
    pending:   { label: "⏳ PENDING",   bg: "#fef3c7", color: "#92400e" },
    approved:  { label: "✓ APPROVED",   bg: "#d1fae5", color: "#065f46" },
    denied:    { label: "✕ DENIED",     bg: "#fee2e2", color: "#991b1b" },
    cancelled: { label: "CANCELLED",    bg: "#f3f4f6", color: "#6b7280" },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 4, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function borderColor(status: OverrideStatus) {
  if (status === "pending")  return "#f59e0b";
  if (status === "approved") return "#10b981";
  if (status === "denied")   return "#dc2626";
  return "#e5e7eb";
}

function buildGroups(overrides: CostAbsorptionOverride[]): CostItemGroup[] {
  const map = new Map<string, CostAbsorptionOverride[]>();
  for (const o of overrides) {
    if (!map.has(o.cost_item_id)) map.set(o.cost_item_id, []);
    map.get(o.cost_item_id)!.push(o);
  }

  const groups: CostItemGroup[] = [];
  map.forEach((rows) => {
    // Sort newest first
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // The "current" is the most recent non-cancelled
    const current = rows.find((r) => r.status !== "cancelled");
    if (!current) return; // all cancelled = fully removed, skip
    const history = rows.filter((r) => r.id !== current.id);
    const ref = rows[0]; // use first row for cost item fields
    groups.push({
      cost_item_id: current.cost_item_id,
      current,
      history,
      customer_name: ref.customer_name ?? null,
      serial_number: ref.serial_number ?? null,
      item_number: ref.item_number ?? null,
      invoice_number: ref.invoice_number ?? null,
      location: ref.location ?? null,
      amount: ref.amount,
    });
  });

  // Sort groups: pending first, then approved, then denied
  const order: Record<OverrideStatus, number> = { pending: 0, approved: 1, denied: 2, cancelled: 3 };
  groups.sort((a, b) => order[a.current.status] - order[b.current.status]);
  return groups;
}

export default function CostAbsorptionsClient({ canApprove }: { canApprove: boolean }) {
  const [allOverrides, setAllOverrides] = useState<CostAbsorptionOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "denied">("all");
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const [showDenyModal, setShowDenyModal] = useState(false);
  const [denyOverrideId, setDenyOverrideId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [denySubmitting, setDenySubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/activation/subscriptions/cost-absorption-overrides");
        const j = await res.json();
        if (!res.ok) { setMsg(j?.error ?? "Failed to load"); return; }
        setAllOverrides(j.overrides ?? []);
      } catch { setMsg("Failed to load"); }
      finally { setLoading(false); }
    })();
  }, []);

  function toggleHistory(costItemId: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      next.has(costItemId) ? next.delete(costItemId) : next.add(costItemId);
      return next;
    });
  }

  async function approve(overrideId: string) {
    try {
      const res = await fetch("/api/activation/subscriptions/cost-absorption-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", overrideId }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(j?.error ?? "Failed to approve"); return; }
      setAllOverrides((prev) => prev.map((o) => o.id === overrideId ? { ...o, ...j.override } : o));
      setMsg("Approved.");
    } catch { setMsg("Failed to approve"); }
  }

  async function submitDeny() {
    if (!denyOverrideId) return;
    setDenySubmitting(true);
    try {
      const res = await fetch("/api/activation/subscriptions/cost-absorption-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deny", overrideId: denyOverrideId, denialReason: denyReason }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(j?.error ?? "Failed to deny"); return; }
      setAllOverrides((prev) => prev.map((o) => o.id === denyOverrideId ? { ...o, ...j.override } : o));
      setShowDenyModal(false);
      setDenyOverrideId(null);
      setDenyReason("");
      setMsg("Denied.");
    } catch { setMsg("Failed to deny"); }
    finally { setDenySubmitting(false); }
  }

  async function cancelOverride(overrideId: string, status: OverrideStatus) {
    const msg = status === "approved"
      ? "Remove this override? This will undo the reconcile and return the cost item to the reconcile page."
      : "Remove this override request?";
    if (!window.confirm(msg)) return;
    try {
      const res = await fetch("/api/activation/subscriptions/cost-absorption-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", overrideId }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg(j?.error ?? "Failed to remove"); return; }
      setAllOverrides((prev) => prev.map((o) => o.id === overrideId ? { ...o, status: "cancelled" } : o));
      setMsg(status === "approved" ? "Override removed — cost item returned to reconcile." : "Override removed.");
    } catch { setMsg("Failed to remove"); }
  }

  function buildPrintHtml(groups: CostItemGroup[]): string {
    const approved = groups.filter((g) => g.current.status === "approved");
    const rows = approved.map((g) => `
      <tr>
        <td>${g.customer_name ?? g.current.override_person_name}</td>
        <td>${g.item_number ?? "—"}</td>
        <td>${g.serial_number ?? "—"}</td>
        <td>${g.location ?? "—"}</td>
        <td>$${Number(g.amount).toFixed(2)}</td>
        <td>${g.current.override_person_name}</td>
        <td>${g.current.reason}</td>
        <td>${g.current.reviewed_by_email ?? "—"}</td>
        <td>${fmtDate(g.current.created_at)}</td>
      </tr>`).join("");

    return `<!DOCTYPE html>
<html>
<head>
  <title>Cost Absorptions</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; margin: 24px; color: #111; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    p { margin: 0 0 12px; color: #555; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #367C2B; color: #FFC72C; font-size: 10px; padding: 6px 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Cost Absorptions — Approved</h1>
  <p>Printed ${new Date().toLocaleString()} · ${approved.length} item${approved.length === 1 ? "" : "s"}</p>
  <table>
    <thead>
      <tr>
        <th>Customer</th><th>Item #</th><th>Serial #</th><th>Location</th>
        <th>Cost Amount</th><th>Authorized By</th><th>Reason</th><th>Approved By</th><th>Date</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  }

  const groups = buildGroups(allOverrides);

  const filteredGroups = groups.filter((g) => {
    if (statusFilter === "all") return true;
    return g.current.status === statusFilter;
  });

  const pendingCount  = groups.filter((g) => g.current.status === "pending").length;
  const approvedCount = groups.filter((g) => g.current.status === "approved").length;
  const deniedCount   = groups.filter((g) => g.current.status === "denied").length;

  function handlePrint() {
    const approvedGroups = filteredGroups.filter((g) => g.current.status === "approved");
    if (!approvedGroups.length) { setMsg("No approved items to print."); return; }
    const win = window.open("", "_blank");
    if (!win) { setMsg("Pop-up blocked — allow pop-ups and try again."); return; }
    win.document.write(buildPrintHtml(approvedGroups));
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>Cost Absorptions</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Review, approve, deny, and print cost absorption override requests.
        </p>
      </header>

      {msg && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", color: "#111827", fontWeight: 700 }}>
          {msg}
        </div>
      )}

      {/* Stats */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
        {[
          { label: "Pending",  count: pendingCount,  color: "#f59e0b", bg: "#fffbeb", border: "#f59e0b" },
          { label: "Approved", count: approvedCount, color: "#10b981", bg: "#f0fdf4", border: "#10b981" },
          { label: "Denied",   count: deniedCount,   color: "#dc2626", bg: "#fef2f2", border: "#dc2626" },
        ].map(({ label, count, color, bg, border }) => (
          <div key={label} style={{ background: bg, border: `2px solid ${border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color }}>{count}</div>
          </div>
        ))}
      </section>

      {/* Controls */}
      <section style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontWeight: 800, color: "#111827" }}>Filter:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#fff", fontWeight: 700 }}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <button
          onClick={handlePrint}
          style={{ padding: "8px 16px", background: "#367C2B", color: "#FFC72C", border: "2px solid #FFC72C", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontSize: 13 }}
        >
          Print Approved
        </button>
      </section>

      {/* Cards */}
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>Loading…</div>
      ) : filteredGroups.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontWeight: 700 }}>No items for this filter.</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {filteredGroups.map((group) => {
            const { current, history } = group;
            const historyOpen = expandedHistory.has(group.cost_item_id);

            return (
              <div key={group.cost_item_id} style={{
                background: "#f9fafb",
                border: `2px solid ${borderColor(current.status)}`,
                borderRadius: 12,
                overflow: "hidden",
              }}>
                {/* Main card body */}
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>

                    {/* Left: cost item info + current request */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                      {/* Cost item header */}
                      <div style={{ fontWeight: 900, fontSize: 15, color: "#111827", marginBottom: 2 }}>
                        {group.customer_name || "Unknown Customer"}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 1 }}>
                        Item #: {group.item_number ?? "—"} · Serial: {group.serial_number ?? "—"} · Location: {group.location ?? "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                        Invoice: {group.invoice_number ?? "—"} · Cost: <strong style={{ color: "#111827" }}>${Number(group.amount).toFixed(2)}</strong>
                      </div>

                      {/* Divider */}
                      <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", marginBottom: 10 }} />

                      {/* Current request */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <StatusBadge status={current.status} />
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>Current Request</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#374151", marginBottom: 3 }}>
                        <strong>Authorized by:</strong> {current.override_person_name}
                      </div>
                      <div style={{ fontSize: 13, color: "#374151", marginBottom: 3 }}>
                        <strong>Reason:</strong> {current.reason}
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
                        Submitted by {current.requested_by_email ?? "unknown"} · {fmtDate(current.created_at)}
                      </div>
                      {current.status === "approved" && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>
                          Approved by {current.reviewed_by_email ?? "unknown"}
                        </div>
                      )}
                      {current.status === "denied" && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b" }}>
                            Denied by {current.reviewed_by_email ?? "unknown"}
                          </div>
                          {current.denial_reason && (
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                              Reason: {current.denial_reason}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right: actions */}
                    {canApprove && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                        {current.status === "pending" && (
                          <>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => approve(current.id)}
                              style={{ minWidth: 90, fontSize: 13 }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => { setDenyOverrideId(current.id); setDenyReason(""); setShowDenyModal(true); }}
                              style={{ minWidth: 90, padding: "6px 14px", background: "#fff", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                            >
                              Deny
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => cancelOverride(current.id, current.status)}
                          style={{ minWidth: 90, padding: "6px 14px", background: "#fff", color: "#6b7280", border: "1px solid #9ca3af", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* History toggle — only show if there's history */}
                {history.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleHistory(group.cost_item_id)}
                      style={{
                        width: "100%",
                        padding: "8px 16px",
                        background: "#f3f4f6",
                        border: "none",
                        borderTop: "1px solid rgba(0,0,0,0.08)",
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                        color: "#6b7280",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{historyOpen ? "▾" : "▸"}</span>
                      History ({history.length} prior request{history.length === 1 ? "" : "s"})
                    </button>

                    {historyOpen && (
                      <div style={{ background: "#f3f4f6", padding: "0 16px 12px" }}>
                        {history.map((h, i) => (
                          <div key={h.id} style={{
                            padding: "10px 12px",
                            marginTop: 8,
                            borderRadius: 8,
                            background: "#fff",
                            border: "1px solid rgba(0,0,0,0.08)",
                            fontSize: 12,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <StatusBadge status={h.status} />
                              <span style={{ color: "#9ca3af" }}>{fmtDate(h.created_at)}</span>
                            </div>
                            <div style={{ color: "#374151", marginBottom: 2 }}>
                              <strong>Authorized by:</strong> {h.override_person_name} · <strong>Reason:</strong> {h.reason}
                            </div>
                            <div style={{ color: "#9ca3af" }}>
                              Submitted by {h.requested_by_email ?? "unknown"}
                            </div>
                            {(h.status === "approved" || h.status === "denied") && h.reviewed_by_email && (
                              <div style={{ marginTop: 3, fontWeight: 700, color: h.status === "approved" ? "#065f46" : "#991b1b" }}>
                                {h.status === "approved" ? "Approved" : "Denied"} by {h.reviewed_by_email}
                                {h.denial_reason && <span style={{ fontWeight: 400, color: "#6b7280" }}> — {h.denial_reason}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Deny modal */}
      {showDenyModal && denyOverrideId && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200 }}
          onClick={() => { if (denySubmitting) return; setShowDenyModal(false); setDenyOverrideId(null); }}
        >
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 24, width: "min(400px, 94vw)", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 12, color: "#111827" }}>Deny Override</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#111827", marginBottom: 6 }}>
                Reason for denial (optional)
              </label>
              <textarea
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="Explain why the override is being denied…"
                rows={3}
                disabled={denySubmitting}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.2)", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowDenyModal(false); setDenyOverrideId(null); }}
                disabled={denySubmitting}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "#e5e7eb", fontWeight: 700, cursor: denySubmitting ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={submitDeny}
                disabled={denySubmitting}
                style={{ padding: "8px 14px", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", fontWeight: 800, cursor: denySubmitting ? "not-allowed" : "pointer" }}
              >
                {denySubmitting ? "Denying…" : "Deny Override"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
