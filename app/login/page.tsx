"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "../components/BackButton";
import { createClient } from "../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) return setMsg(error.message);

    router.push("/dashboard");
    router.refresh();

    router.refresh(); // helps sync auth state
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>IS Dept Portal</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Sign in with your email and password.
      </p>

      <form onSubmit={onLogin} style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />
        <button disabled={loading} style={{ padding: 10 }}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </form>
    </main>
  );
}
