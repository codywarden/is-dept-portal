"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Sprayer = {
  id: string;
  serial_number: string;
  customer_id: string | null;
};

export default function SprayersPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Sprayer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supabase = createClient();

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionError || !sessionData.session) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("sprayers")
        .select("id, serial_number, customer_id")
        .order("serial_number", { ascending: true });

      if (cancelled) return;

      if (error) {
        setError(error.message);
        return;
      }

      setRows(data ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700 }}>Sprayers</h1>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <table
        style={{
          width: "100%",
          marginTop: 12,
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: 8,
                borderBottom: "1px solid #ddd",
              }}
            >
              Serial #
            </th>
            <th
              style={{
                textAlign: "left",
                padding: 8,
                borderBottom: "1px solid #ddd",
              }}
            >
              Customer ID
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {r.serial_number}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {r.customer_id ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}


