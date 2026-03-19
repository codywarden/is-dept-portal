"use client";

import { useEffect, useMemo, useState } from "react";

type SummaryRow = {
  location: string;
  costTotal: number;
  retailTotal: number;
  marginAmount: number;
  marginPercent: number | null;
};

type SummaryResponse = {
  rows: SummaryRow[];
  totals: {
    costTotal: number;
    retailTotal: number;
    marginAmount: number;
    marginPercent: number | null;
  };
};

export default function LocationSummaryClient() {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [totals, setTotals] = useState<SummaryResponse["totals"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportType, setExportType] = useState<"csv" | "pdf">("csv");
  const [exportNotice, setExportNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [allCostTotals, setAllCostTotals] = useState<Record<string, number>>({});
  const [allSoldTotals, setAllSoldTotals] = useState<Record<string, number>>({});
  // latest BS check entry per location: { location -> { cost_total, sold_total } }
  const [latestCheck, setLatestCheck] = useState<Record<string, { cost_total: number; sold_total: number }>>({});
  // first segment of cost account number per location, used for sort order
  const [accountOrder, setAccountOrder] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [summaryRes, totalsRes, checkRes, accountsRes] = await Promise.all([
          fetch("/api/activation/subscriptions/location-summary"),
          fetch("/api/activation/subscriptions/location-totals"),
          fetch("/api/activation/subscriptions/business-check"),
          fetch("/api/admin/location-accounts"),
        ]);

        const [json, totalsJson, checkJson, accountsJson] = await Promise.all([
          summaryRes.json() as Promise<SummaryResponse & { error?: string }>,
          totalsRes.json(),
          checkRes.json(),
          accountsRes.json(),
        ]);

        if (!summaryRes.ok) {
          setError(json?.error ?? "Failed to load location summary");
          return;
        }

        setRows(json.rows ?? []);
        setTotals(json.totals ?? null);
        setAllCostTotals(totalsJson.costByLocation ?? {});
        setAllSoldTotals(totalsJson.soldByLocation ?? {});

        // build latest check entry per location (entries are already sorted date desc)
        const latest: Record<string, { cost_total: number; sold_total: number }> = {};
        for (const entry of (checkJson.data ?? [])) {
          if (!latest[entry.location_name]) {
            latest[entry.location_name] = { cost_total: entry.cost_total, sold_total: entry.sold_total };
          }
        }
        setLatestCheck(latest);

        // build sort order from first segment of cost account number
        const order: Record<string, number> = {};
        for (const row of (accountsJson.data ?? [])) {
          const first = parseInt((row.account_number ?? "").split("-")[0] || "0", 10);
          if (first) order[row.location_name] = first;
        }
        setAccountOrder(order);
      } catch (err) {
        console.error(err);
        setError("Failed to load location summary");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // merge rows with any locations that only exist in latestCheck (show as zero)
  const mergedRows = useMemo(() => {
    const existing = new Set(rows.map((r) => r.location));
    const checkOnly = Object.keys(latestCheck)
      .filter((loc) => !existing.has(loc))
      .map((loc) => ({
        location: loc,
        costTotal: 0,
        retailTotal: 0,
        marginAmount: 0,
        marginPercent: null,
      }));
    return [...rows, ...checkOnly].sort((a, b) => {
      if (a.location === "Not Reconclied Yet") return 1;
      if (b.location === "Not Reconclied Yet") return -1;
      const aOrder = accountOrder[a.location] ?? Infinity;
      const bOrder = accountOrder[b.location] ?? Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.location.localeCompare(b.location);
    });
  }, [rows, latestCheck, accountOrder]);

  const filteredRows = useMemo(() => {
    if (!locationFilter) return mergedRows;
    return mergedRows.filter((r) => r.location === locationFilter);
  }, [mergedRows, locationFilter]);

  const filteredTotals = useMemo(() => {
    if (!locationFilter) return totals;
    const cost = filteredRows.reduce((s, r) => s + r.costTotal, 0);
    const retail = filteredRows.reduce((s, r) => s + r.retailTotal, 0);
    const margin = retail - cost;
    return {
      costTotal: cost,
      retailTotal: retail,
      marginAmount: margin,
      marginPercent: cost > 0 ? ((margin / cost) * 100) : null,
    };
  }, [filteredRows, locationFilter, totals]);

  const maxValue = useMemo(() => {
    return filteredRows.reduce((max, row) => Math.max(max, row.costTotal, row.retailTotal), 0);
  }, [filteredRows]);

  function showExportNotice(type: "success" | "error", text: string) {
    setExportNotice({ type, text });
    window.setTimeout(() => {
      setExportNotice((current) => (current?.text === text ? null : current));
    }, 3000);
  }

  function exportCsv() {
    if (filteredRows.length === 0 || !filteredTotals) return;

    const header = ["Location", "Cost Total", "Retail Total", "Margin Amount", "Margin Percent"];
    const lines = filteredRows.map((row) => [
      escapeCsv(row.location),
      row.costTotal.toFixed(2),
      row.retailTotal.toFixed(2),
      row.marginAmount.toFixed(2),
      row.marginPercent === null ? "" : row.marginPercent.toFixed(2),
    ]);

    lines.push([
      "TOTAL",
      filteredTotals.costTotal.toFixed(2),
      filteredTotals.retailTotal.toFixed(2),
      filteredTotals.marginAmount.toFixed(2),
      filteredTotals.marginPercent === null ? "" : filteredTotals.marginPercent.toFixed(2),
    ]);

    const csv = [header, ...lines].map((line) => line.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `activation-location-summary-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (filteredRows.length === 0 || !filteredTotals) return;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 36;
    const marginTop = 36;
    const bottomMargin = 36;
    const rowHeight = 20;

    const colX = {
      location: marginX,
      cost: marginX + 220,
      retail: marginX + 360,
      margin: marginX + 500,
      marginPct: marginX + 640,
    };

    const drawHeader = (y: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Location", colX.location, y);
      doc.text("Cost Total", colX.cost, y, { align: "right" });
      doc.text("Retail Total", colX.retail, y, { align: "right" });
      doc.text("Margin Amount", colX.margin, y, { align: "right" });
      doc.text("Margin %", colX.marginPct, y, { align: "right" });
      doc.setDrawColor(200);
      doc.line(marginX, y + 6, pageWidth - marginX, y + 6);
    };

    let y = marginTop;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Activation Location Summary", marginX, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
    y += 20;

    drawHeader(y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    for (const row of filteredRows) {
      if (y > pageHeight - bottomMargin) {
        doc.addPage();
        y = marginTop;
        drawHeader(y);
        y += 18;
      }

      doc.text(row.location, colX.location, y);
      doc.text(formatMoney(row.costTotal), colX.cost, y, { align: "right" });
      doc.text(formatMoney(row.retailTotal), colX.retail, y, { align: "right" });
      doc.text(formatMoney(row.marginAmount), colX.margin, y, { align: "right" });
      doc.text(row.marginPercent === null ? "—" : `${row.marginPercent.toFixed(2)}%`, colX.marginPct, y, { align: "right" });
      y += rowHeight;
    }

    if (y > pageHeight - bottomMargin) {
      doc.addPage();
      y = marginTop;
      drawHeader(y);
      y += 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setDrawColor(120);
    doc.line(marginX, y - 10, pageWidth - marginX, y - 10);
    doc.text("TOTAL", colX.location, y);
    doc.text(formatMoney(filteredTotals.costTotal), colX.cost, y, { align: "right" });
    doc.text(formatMoney(filteredTotals.retailTotal), colX.retail, y, { align: "right" });
    doc.text(formatMoney(filteredTotals.marginAmount), colX.margin, y, { align: "right" });
    doc.text(filteredTotals.marginPercent === null ? "—" : `${filteredTotals.marginPercent.toFixed(2)}%`, colX.marginPct, y, { align: "right" });

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save(`activation-location-summary-${stamp}.pdf`);
  }

  async function handleExport() {
    try {
      if (exportType === "csv") {
        exportCsv();
        showExportNotice("success", "CSV exported successfully.");
        return;
      }

      await exportPdf();
      showExportNotice("success", "PDF exported successfully.");
    } catch (err) {
      console.error(err);
      showExportNotice("error", `Failed to export ${exportType.toUpperCase()}.`);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>Location Financial Summary</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Cost and retail totals by location, including margin on each location.
        </p>
      </header>

      <section style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
            minWidth: 180,
          }}
        >
          <option value="">All Locations</option>
          {rows.map((r) => (
            <option key={r.location} value={r.location}>{r.location}</option>
          ))}
        </select>
        <select
          value={exportType}
          onChange={(event) => setExportType(event.target.value as "csv" | "pdf")}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#fff",
            fontWeight: 700,
          }}
        >
          <option value="csv">CSV</option>
          <option value="pdf">PDF</option>
        </select>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading || filteredRows.length === 0 || !filteredTotals}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "#367C2B",
            color: "#fff",
            fontWeight: 800,
            cursor: loading || filteredRows.length === 0 || !filteredTotals ? "not-allowed" : "pointer",
            opacity: loading || filteredRows.length === 0 || !filteredTotals ? 0.6 : 1,
          }}
        >
          Export {exportType.toUpperCase()}
        </button>
      </section>

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

      {exportNotice && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: exportNotice.type === "success" ? "#ecfdf5" : "#fef2f2",
            border:
              exportNotice.type === "success"
                ? "1px solid rgba(16,185,129,0.35)"
                : "1px solid rgba(220,38,38,0.2)",
            color: exportNotice.type === "success" ? "#065f46" : "#991b1b",
            fontWeight: 700,
          }}
        >
          {exportNotice.text}
        </div>
      )}

      {filteredTotals && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <StatCard label="Total Cost" value={formatMoney(filteredTotals.costTotal)} />
          <StatCard label="Total Retail" value={formatMoney(filteredTotals.retailTotal)} />
          <StatCard label="Total Margin" value={formatMoney(filteredTotals.marginAmount)} />
          <StatCard
            label="Total Margin %"
            value={filteredTotals.marginPercent === null ? "—" : `${filteredTotals.marginPercent.toFixed(2)}%`}
          />
        </section>
      )}

      <section
        style={{
          background: "#f9fafb",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 10,
          padding: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(180px, 240px) minmax(240px, 1fr) minmax(240px, 1fr) 140px 110px",
            gap: 10,
            padding: "8px 10px",
            fontWeight: 900,
            borderBottom: "1px solid rgba(0,0,0,0.12)",
            color: "#111827",
          }}
        >
          <div>Location</div>
          <div>Cost Bar</div>
          <div>Retail Bar</div>
          <div style={{ textAlign: "right" }}>Margin</div>
          <div style={{ textAlign: "right" }}>Margin %</div>
        </div>
        {loading ? (
          <div style={{ padding: 14, color: "#6b7280", fontWeight: 700 }}>Loading summary…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ padding: 14, color: "#6b7280", fontWeight: 700 }}>No records found.</div>
        ) : (
          <>
            {filteredRows.map((row) => {
              const check = latestCheck[row.location];
              const portalCost = allCostTotals[row.location] ?? 0;
              const portalSold = allSoldTotals[row.location] ?? 0;
              const costMissing = check ? Math.abs(check.cost_total - portalCost) : 0;
              const soldMissing = check ? Math.abs(check.sold_total - portalSold) : 0;
              const missing = Math.max(costMissing, soldMissing);
              const hasMissing = !!check && missing > 0.01;
              return (
                <div
                  key={row.location}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 240px) minmax(240px, 1fr) minmax(240px, 1fr) 140px 110px",
                    gap: 10,
                    alignItems: "start",
                    padding: "10px",
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                  }}
                >
                  <div style={{ fontWeight: 800, paddingTop: 2 }}>{row.location}</div>
                  <div>
                    <BarCell value={row.costTotal} maxValue={maxValue} color="#6b7280" />
                    {hasMissing && (
                      <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                        Missing Invoices: {formatMoney(missing)}
                        <InfoTooltip text="This is missing invoices from the Business system" />
                      </div>
                    )}
                  </div>
                  <div>
                    <BarCell value={row.retailTotal} maxValue={maxValue} color="#367C2B" />
                    {hasMissing && (
                      <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}>
                        Missing Invoices: {formatMoney(missing)}
                        <InfoTooltip text="This is missing invoices from the Business system" />
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, paddingTop: 2 }}>{formatMoney(row.marginAmount)}</div>
                  <div style={{ textAlign: "right", fontWeight: 700, paddingTop: 2 }}>
                    {row.marginPercent === null ? "—" : `${row.marginPercent.toFixed(2)}%`}
                  </div>
                </div>
              );
            })}

            {filteredTotals && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 240px) minmax(240px, 1fr) minmax(240px, 1fr) 140px 110px",
                  gap: 10,
                  alignItems: "center",
                  padding: "12px 10px",
                  background: "#e5e7eb",
                  fontWeight: 900,
                }}
              >
                <div>TOTAL</div>
                <div>{formatMoney(filteredTotals.costTotal)}</div>
                <div>{formatMoney(filteredTotals.retailTotal)}</div>
                <div style={{ textAlign: "right" }}>{formatMoney(filteredTotals.marginAmount)}</div>
                <div style={{ textAlign: "right" }}>
                  {filteredTotals.marginPercent === null ? "—" : `${filteredTotals.marginPercent.toFixed(2)}%`}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "#f9fafb",
      }}
    >
      <div style={{ color: "#6b7280", fontWeight: 700, fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 900, fontSize: 18 }}>{value}</div>
    </div>
  );
}

function BarCell({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const widthPercent = maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 0;

  return (
    <div>
      <div
        style={{
          position: "relative",
          height: 18,
          borderRadius: 999,
          background: "#e5e7eb",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${widthPercent}%`,
            background: color,
          }}
        />
      </div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "#111827" }}>{formatMoney(value)}</div>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block", verticalAlign: "middle" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: "#dc2626",
        color: "white",
        fontSize: 9,
        fontWeight: 900,
        cursor: "default",
        lineHeight: 1,
      }}>
        i
      </span>
      {visible && (
        <span style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          background: "#1f2937",
          color: "white",
          fontSize: 11,
          fontWeight: 600,
          padding: "5px 8px",
          borderRadius: 6,
          pointerEvents: "none",
          zIndex: 10,
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

function escapeCsv(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}
