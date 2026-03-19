"use client";

import { useEffect, useState } from "react";

type Role = "admin" | "verifier" | "viewer";

type CheckEntry = {
  id: string;
  check_date: string;
  location_name: string;
  cost_total: number;
  sold_total: number;
  notes: string | null;
  created_at: string;
};

type AccountMap = Record<string, string>;
type TotalsMap = Record<string, number>;

export default function CheckClient({ role }: { role: Role }) {
  const [entries, setEntries] = useState<CheckEntry[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [costAccounts, setCostAccounts] = useState<AccountMap>({});
  const [soldAccounts, setSoldAccounts] = useState<AccountMap>({});
  const [dbCostTotals, setDbCostTotals] = useState<TotalsMap>({});
  const [dbSoldTotals, setDbSoldTotals] = useState<TotalsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formLocation, setFormLocation] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formSold, setFormSold] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // filter
  const [filterLocation, setFilterLocation] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [entriesRes, locsRes, costRes, soldRes, totalsRes] = await Promise.all([
          fetch("/api/activation/subscriptions/business-check"),
          fetch("/api/admin/locations"),
          fetch("/api/admin/location-accounts"),
          fetch("/api/admin/sold-location-accounts"),
          fetch("/api/activation/subscriptions/location-totals"),
        ]);

        const [entriesJson, locsJson, costJson, soldJson, totalsJson] = await Promise.all([
          entriesRes.json(),
          locsRes.json(),
          costRes.json(),
          soldRes.json(),
          totalsRes.json(),
        ]);

        setEntries(entriesJson.data ?? []);

        const locs: string[] = locsJson.data?.map((l: { name: string }) => l.name) ?? locsJson ?? [];
        setLocations(Array.isArray(locs) ? locs : []);

        const costMap: AccountMap = {};
        for (const row of costJson.data ?? []) {
          if (row.location_name && row.account_number) costMap[row.location_name] = row.account_number;
        }
        setCostAccounts(costMap);

        const soldMap: AccountMap = {};
        for (const row of soldJson.data ?? []) {
          if (row.location_name && row.account_number) soldMap[row.location_name] = row.account_number;
        }
        setSoldAccounts(soldMap);

        setDbCostTotals(totalsJson.costByLocation ?? {});
        setDbSoldTotals(totalsJson.soldByLocation ?? {});
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addEntry() {
    setFormError(null);
    if (!formDate) return setFormError("Date is required");
    if (!formLocation) return setFormError("Location is required");
    if (!formCost || isNaN(Number(formCost))) return setFormError("Valid cost total is required");
    if (!formSold || isNaN(Number(formSold))) return setFormError("Valid sold total is required");

    setSubmitting(true);
    const res = await fetch("/api/activation/subscriptions/business-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        check_date: formDate,
        location_name: formLocation,
        cost_total: Number(formCost),
        sold_total: Number(formSold),
        notes: formNotes.trim() || null,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) return setFormError(json.error ?? "Failed to add entry");
    setEntries((prev) => [json.data, ...prev]);
    setFormCost("");
    setFormSold("");
    setFormNotes("");
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this entry?")) return;
    const res = await fetch(`/api/activation/subscriptions/business-check?id=${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const filtered = filterLocation ? entries.filter((e) => e.location_name === filterLocation) : entries;

  const byDate = filtered.reduce<Record<string, CheckEntry[]>>((acc, e) => {
    (acc[e.check_date] ??= []).push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  // latest entry per location
  const latestByLocation: Record<string, CheckEntry> = {};
  for (const entry of entries) {
    const existing = latestByLocation[entry.location_name];
    if (!existing || entry.check_date > existing.check_date) {
      latestByLocation[entry.location_name] = entry;
    }
  }

  const hasAccounts = Object.keys(costAccounts).length > 0 || Object.keys(soldAccounts).length > 0;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
        <p style={{ color: "#374151", fontWeight: 700 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>Business System Numbers</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Enter cost and sold account totals from the business system. The difference against what&apos;s in the portal should be zero — if not, invoices are missing.
        </p>
      </header>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid rgba(220,38,38,0.2)", color: "#991b1b", fontWeight: 700 }}>
          {error}
        </div>
      )}

      {/* Account Numbers Reference with DB Totals */}
      {hasAccounts && (
        <section style={{ marginBottom: 24, background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827", marginBottom: 12 }}>Account Numbers &amp; Current Portal Totals</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.1)" }}>
                  <th style={{ textAlign: "left", padding: "7px 10px", fontWeight: 900, color: "#374151" }}>Location</th>
                  <th style={{ textAlign: "left", padding: "7px 10px", fontWeight: 900, color: "#374151" }}>Cost Account #</th>
                  <th style={{ textAlign: "right", padding: "7px 10px", fontWeight: 900, color: "#374151" }}>Portal Cost Total</th>
                  <th style={{ textAlign: "left", padding: "7px 10px", fontWeight: 900, color: "#374151" }}>Sold Account #</th>
                  <th style={{ textAlign: "right", padding: "7px 10px", fontWeight: 900, color: "#374151" }}>Portal Sold Total</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr key={loc} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <td style={{ padding: "7px 10px", fontWeight: 700 }}>{loc}</td>
                    <td style={{ padding: "7px 10px", color: costAccounts[loc] ? "#111827" : "#9ca3af" }}>
                      {costAccounts[loc] ?? "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#111827" }}>
                      {dbCostTotals[loc] != null ? formatMoney(dbCostTotals[loc]) : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    <td style={{ padding: "7px 10px", color: soldAccounts[loc] ? "#111827" : "#9ca3af" }}>
                      {soldAccounts[loc] ?? "—"}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700, color: "#111827" }}>
                      {dbSoldTotals[loc] != null ? formatMoney(dbSoldTotals[loc]) : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Add Entry Form */}
      <section style={{ marginBottom: 28, background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 15, color: "#111827", marginBottom: 14 }}>Add Business System Entry</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Date</label>
            <input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Location</label>
            <select value={formLocation} onChange={(e) => setFormLocation(e.target.value)} style={inputStyle}>
              <option value="">Select location…</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>
              Biz System Cost Total
              {formLocation && dbCostTotals[formLocation] != null && (
                <span style={{ marginLeft: 6, color: "#367C2B" }}>Portal: {formatMoney(dbCostTotals[formLocation])}</span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={formCost}
              onChange={(e) => setFormCost(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>
              Biz System Sold Total
              {formLocation && dbSoldTotals[formLocation] != null && (
                <span style={{ marginLeft: 6, color: "#367C2B" }}>Portal: {formatMoney(dbSoldTotals[formLocation])}</span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              value={formSold}
              onChange={(e) => setFormSold(e.target.value)}
              placeholder="0.00"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4 }}>Notes (optional)</label>
            <input
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Optional notes…"
              style={inputStyle}
            />
          </div>
        </div>
        {formError && (
          <div style={{ marginBottom: 8, fontSize: 13, color: "#dc2626", fontWeight: 700 }}>{formError}</div>
        )}
        <button
          onClick={addEntry}
          disabled={submitting}
          style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#367C2B", color: "white", fontWeight: 800, fontSize: 13, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "Adding…" : "Add Entry"}
        </button>
      </section>

      {/* Location Summary Cards */}
      {Object.keys(latestByLocation).length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827", marginBottom: 12 }}>Latest by Location</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
            {Object.entries(latestByLocation).sort(([a], [b]) => a.localeCompare(b)).map(([loc, entry]) => {
              const dbCost = dbCostTotals[loc] ?? 0;
              const dbSold = dbSoldTotals[loc] ?? 0;
              const costDiff = entry.cost_total - dbCost;
              const soldDiff = entry.sold_total - dbSold;
              const costMatch = Math.abs(costDiff) < 0.01;
              const soldMatch = Math.abs(soldDiff) < 0.01;
              const allMatch = costMatch && soldMatch;

              return (
                <div key={loc} style={{
                  background: "#f9fafb",
                  border: `2px solid ${allMatch ? "#367C2B" : "#dc2626"}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                }}>
                  <div style={{ fontWeight: 900, fontSize: 14, color: "#111827", marginBottom: 2 }}>{loc}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>as of {fmtDate(entry.check_date)}</div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 12, marginBottom: 8 }}>
                    <div style={{ color: "#6b7280", fontWeight: 800, gridColumn: "1 / -1", borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: 4, marginBottom: 2 }}>Cost Account</div>
                    <div><div style={{ color: "#6b7280" }}>Biz System</div><div style={{ fontWeight: 800 }}>{formatMoney(entry.cost_total)}</div></div>
                    <div><div style={{ color: "#6b7280" }}>Portal</div><div style={{ fontWeight: 800 }}>{formatMoney(dbCost)}</div></div>
                    <div>
                      <div style={{ color: "#6b7280" }}>Difference</div>
                      <div style={{ fontWeight: 800, color: costMatch ? "#367C2B" : "#dc2626" }}>
                        {costMatch ? "✓ 0.00" : formatMoney(Math.abs(costDiff))}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 12 }}>
                    <div style={{ color: "#6b7280", fontWeight: 800, gridColumn: "1 / -1", borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: 4, marginBottom: 2 }}>Sold Account</div>
                    <div><div style={{ color: "#6b7280" }}>Biz System</div><div style={{ fontWeight: 800 }}>{formatMoney(entry.sold_total)}</div></div>
                    <div><div style={{ color: "#6b7280" }}>Portal</div><div style={{ fontWeight: 800 }}>{formatMoney(dbSold)}</div></div>
                    <div>
                      <div style={{ color: "#6b7280" }}>Difference</div>
                      <div style={{ fontWeight: 800, color: soldMatch ? "#367C2B" : "#dc2626" }}>
                        {soldMatch ? "✓ 0.00" : formatMoney(Math.abs(soldDiff))}
                      </div>
                    </div>
                  </div>

                  {!allMatch && (
                    <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, background: "#fef2f2", border: "1px solid rgba(220,38,38,0.2)", color: "#dc2626", fontWeight: 800, fontSize: 12 }}>
                      Missing invoices — check {[!costMatch && "cost", !soldMatch && "sold"].filter(Boolean).join(" & ")} account
                    </div>
                  )}
                  {allMatch && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#367C2B", fontWeight: 800 }}>✓ Portal matches business system</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* History Table */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>Check History</div>
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", fontWeight: 600, fontSize: 13 }}
          >
            <option value="">All Locations</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {sortedDates.length === 0 ? (
          <div style={{ padding: 16, color: "#6b7280", fontWeight: 700, background: "#f9fafb", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)" }}>
            No entries yet. Add one above.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {sortedDates.map((date) => (
              <div key={date} style={{ background: "#f9fafb", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#e5e7eb", fontWeight: 900, fontSize: 14, color: "#111827", borderBottom: "1px solid rgba(0,0,0,0.1)" }}>
                  {fmtDate(date)}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                      <th style={th}>Location</th>
                      <th style={{ ...th, textAlign: "right" }}>BS Cost</th>
                      <th style={{ ...th, textAlign: "right" }}>Portal Cost</th>
                      <th style={{ ...th, textAlign: "right" }}>Cost Diff</th>
                      <th style={{ ...th, textAlign: "right" }}>BS Sold</th>
                      <th style={{ ...th, textAlign: "right" }}>Portal Sold</th>
                      <th style={{ ...th, textAlign: "right" }}>Sold Diff</th>
                      <th style={{ ...th, textAlign: "center" }}>Status</th>
                      {role === "admin" && <th style={th} />}
                    </tr>
                  </thead>
                  <tbody>
                    {byDate[date].map((entry) => {
                      const dbCost = dbCostTotals[entry.location_name] ?? 0;
                      const dbSold = dbSoldTotals[entry.location_name] ?? 0;
                      const costDiff = entry.cost_total - dbCost;
                      const soldDiff = entry.sold_total - dbSold;
                      const costMatch = Math.abs(costDiff) < 0.01;
                      const soldMatch = Math.abs(soldDiff) < 0.01;
                      const allMatch = costMatch && soldMatch;
                      return (
                        <tr key={entry.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                          <td style={td}>{entry.location_name}</td>
                          <td style={{ ...td, textAlign: "right" }}>{formatMoney(entry.cost_total)}</td>
                          <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{formatMoney(dbCost)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: costMatch ? "#367C2B" : "#dc2626" }}>
                            {costMatch ? "—" : formatMoney(Math.abs(costDiff))}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>{formatMoney(entry.sold_total)}</td>
                          <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>{formatMoney(dbSold)}</td>
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, color: soldMatch ? "#367C2B" : "#dc2626" }}>
                            {soldMatch ? "—" : formatMoney(Math.abs(soldDiff))}
                          </td>
                          <td style={{ ...td, textAlign: "center" }}>
                            {allMatch
                              ? <span style={badge("#dcfce7", "#15803d")}>Match</span>
                              : <span style={badge("#fef2f2", "#dc2626")}>Missing</span>
                            }
                          </td>
                          {role === "admin" && (
                            <td style={{ ...td, textAlign: "right" }}>
                              <button
                                onClick={() => deleteEntry(entry.id)}
                                style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(220,38,38,0.3)", background: "white", color: "#dc2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white",
  color: "#111827",
  fontWeight: 600,
  boxSizing: "border-box",
};

const th: React.CSSProperties = { textAlign: "left", padding: "8px 14px", fontWeight: 800, color: "#374151" };
const td: React.CSSProperties = { padding: "8px 14px", fontWeight: 600 };

function badge(bg: string, color: string): React.CSSProperties {
  return { padding: "3px 10px", borderRadius: 99, background: bg, color, fontWeight: 800, fontSize: 12 };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function fmtDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
