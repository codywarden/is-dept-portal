"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "../components/BackButton";
import { createClient } from "../lib/supabase/client";

type Light = "green" | "yellow" | "red";

type Status = {
  account_light: Light;
  machine_light: Light;
  training_light: Light;
  activation_light: Light;
  overall_light: Light;
};

type Row = {
  id: string;
  serial_number: string;
  customer: { name: string } | null;
  status: Status | null;
};

export default function SeeSprayDashboard() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------
  // Load data
  // -----------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();

      // Auth check
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionError || !sessionData.session) {
        router.replace("/login");
        return;
      }

      // Data load
      const { data, error } = await supabase
        .from("sprayers")
        .select(
          `
          id,
          serial_number,
          customers ( name ),
          computed_section_status (
            account_light,
            machine_light,
            training_light,
            activation_light,
            overall_light
          )
        `,
        )
        .order("serial_number", { ascending: true });

      if (cancelled) return;

      if (error) {
        setError(error.message);
        return;
      }

      setError(null);

      setRows(
        (data ?? []).map((r: any) => ({
          id: r.id,
          serial_number: r.serial_number,
          customer: r.customers ?? null,
          status: r.computed_section_status ?? null,
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // -----------------------------
  // Total LIGHT counts across ALL columns (Account/Machine/Training/Activation/Overall)
  // -----------------------------
  const counts = rows.reduce(
    (acc, r) => {
      if (!r.status) return acc;

      const lights: Light[] = [
        r.status.account_light,
        r.status.machine_light,
        r.status.training_light,
        r.status.activation_light,
        r.status.overall_light,
      ];

      lights.forEach((c) => {
        if (c === "green") acc.green++;
        else if (c === "yellow") acc.yellow++;
        else if (c === "red") acc.red++;
        acc.total++;
      });

      return acc;
    },
    { green: 0, yellow: 0, red: 0, total: 0 },
  );

  // -----------------------------
  // Completed & Ready (machine counts)
  // - completedReadyCount: ALL 5 lights are green
  // - notReadyCount: total machines - completedReadyCount
  // -----------------------------
  const completedReadyCount = rows.reduce((acc, r) => {
    if (!r.status) return acc;

    const allGreen =
      r.status.account_light === "green" &&
      r.status.machine_light === "green" &&
      r.status.training_light === "green" &&
      r.status.activation_light === "green" &&
      r.status.overall_light === "green";

    return acc + (allGreen ? 1 : 0);
  }, 0);

  const totalMachines = rows.length;
  const notReadyCount = totalMachines - completedReadyCount;

  // -----------------------------
  // Group rows by customer
  // -----------------------------
  const grouped = rows.reduce<Record<string, Row[]>>((acc, r) => {
    const key = r.customer?.name ?? "Unknown Customer";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // -----------------------------
  // Light renderer
  // -----------------------------
  function dot(color?: Light) {
    const map: Record<string, string> = {
      green: "#16a34a",
      yellow: "#ca8a04",
      red: "#dc2626",
    };

    return (
      <span
        aria-label={color ?? "unknown"}
        title={color ?? "unknown"}
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: map[color ?? ""] || "#9ca3af",
        }}
      />
    );
  }

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <main style={{ padding: 24 }}>
      <BackButton />
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>See & Spray Dashboard</h1>

      {/* Top Summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 24,
          marginTop: 16,
          padding: 16,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          fontWeight: 600,
          flexWrap: "wrap",
        }}
      >
        {/* LEFT SIDE: machine readiness */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ color: "#16a34a" }}>
            ✅ Completed & Ready (All Green): {completedReadyCount}
          </div>
          <div style={{ color: "#111827" }}>
            ⏳ Machines Not Ready Yet: {notReadyCount}
          </div>
          <div style={{ color: "#6b7280" }}>Machines Total: {totalMachines}</div>
        </div>

        {/* RIGHT SIDE: total light counts */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ color: "#16a34a" }}>🟢 Lights: {counts.green}</div>
          <div style={{ color: "#ca8a04" }}>🟡 Lights: {counts.yellow}</div>
          <div style={{ color: "#dc2626" }}>🔴 Lights: {counts.red}</div>
          <div style={{ color: "#6b7280" }}>Total Lights: {counts.total}</div>
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

      {/* Grouped Table */}
      <table
        style={{
          width: "100%",
          marginTop: 24,
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            <th align="left">Customer</th>
            <th align="left">Serial #</th>
            <th>Account</th>
            <th>Machine</th>
            <th>Training</th>
            <th>Activation</th>
            <th>Overall</th>
          </tr>
        </thead>

        {/* ✅ ONE tbody only */}
        <tbody>
          {Object.entries(grouped).map(([customer, machines]) => (
            <React.Fragment key={customer}>
              {/* Customer Header */}
              <tr style={{ background: "#f3f4f6" }}>
                <td colSpan={7} style={{ fontWeight: 700, paddingTop: 16 }}>
                  {customer} ({machines.length})
                </td>
              </tr>

              {/* Customer Machines */}
              {machines.map((r: Row) => (
                <tr key={r.id}>
                  <td>{r.customer?.name ?? "-"}</td>
                  <td>{r.serial_number}</td>
                  <td style={{ textAlign: "center" }}>
                    {dot(r.status?.account_light)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {dot(r.status?.machine_light)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {dot(r.status?.training_light)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {dot(r.status?.activation_light)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {dot(r.status?.overall_light)}
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </main>
  );
}
