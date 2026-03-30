"use client";

import { useState } from "react";
import { createClient } from "../lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);

    if (error) {
      setMsg({ type: "error", text: error.message });
    } else {
      setMsg({
        type: "success",
        text: "Check your email — we sent a password reset link.",
      });
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Forgot Password</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Enter your email and we will send you a reset link.
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />
        <button className="btn-primary" disabled={loading || !email.trim()} style={{ padding: 10 }}>
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        {msg && (
          <div style={{ color: msg.type === "error" ? "crimson" : "#367C2B", fontWeight: 600 }}>
            {msg.text}
          </div>
        )}
      </form>

      <a
        href="/login"
        style={{ display: "block", marginTop: 16, color: "#367C2B", fontWeight: 600, fontSize: 14 }}
      >
        Back to login
      </a>
    </main>
  );
}
