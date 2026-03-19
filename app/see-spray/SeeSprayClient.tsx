"use client";

import React, { useEffect, useState } from "react";
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

type SprayerQueryRow = {
  id: string;
  serial_number: string;
  customers: { name: string } | Array<{ name: string }> | null;
  computed_section_status: Status | Array<Status> | null;
};

export default function SeeSprayClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();

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
        ((data ?? []) as SprayerQueryRow[]).map((r) => ({
          id: r.id,
          serial_number: r.serial_number,
          customer: Array.isArray(r.customers) ? (r.customers[0] ?? null) : (r.customers ?? null),
          status: Array.isArray(r.computed_section_status)
            ? (r.computed_section_status[0] ?? null)
            : (r.computed_section_status ?? null),
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const grouped = rows.reduce<Record<string, Row[]>>((acc, r) => {
    const key = r.customer?.name ?? "Unknown Customer";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

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

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>See & Spray Dashboard</h1>

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
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ color: "#16a34a" }}>
            ✅ Completed & Ready (All Green): {completedReadyCount}
          </div>
          <div style={{ color: "#111827" }}>
            ⏳ Machines Not Ready Yet: {notReadyCount}
          </div>
          <div style={{ color: "#6b7280" }}>Machines Total: {totalMachines}</div>
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <div style={{ color: "#16a34a" }}>🟢 Lights: {counts.green}</div>
          <div style={{ color: "#ca8a04" }}>🟡 Lights: {counts.yellow}</div>
          <div style={{ color: "#dc2626" }}>🔴 Lights: {counts.red}</div>
          <div style={{ color: "#6b7280" }}>Total Lights: {counts.total}</div>
        </div>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}

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

        <tbody>
          {Object.entries(grouped).map(([customer, machines]) => (
            <React.Fragment key={customer}>
              <tr style={{ background: "#f3f4f6" }}>
                <td colSpan={7} style={{ fontWeight: 700, paddingTop: 16 }}>
                  {customer} ({machines.length})
                </td>
              </tr>

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
