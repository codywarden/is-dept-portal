"use client";

import { useEffect, useState } from "react";
import BackButton from "../components/BackButton";
import { createClient } from "../lib/supabase/client";

export default function TestPage() {
  const [msg, setMsg] = useState("Testing...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("sprayers")
        .select("id")
        .limit(1);

      if (cancelled) return;

      if (error) {
        setMsg("Error: " + error.message);
      } else {
        setMsg(
          "Success! Connected. Rows returned: " + (data?.length ?? 0),
        );
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <BackButton />
      <h1>Supabase Connection Test</h1>
      <p>{msg}</p>
    </main>
  );
}

