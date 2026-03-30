"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (password.length < 6) {
      setMsg({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (password !== confirm) {
      setMsg({ type: "error", text: "Passwords do not match." });
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMsg({ type: "error", text: error.message });
    } else {
      setMsg({ type: "success", text: "Password updated! Redirecting to login..." });
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Set New Password</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Choose a new password for your account.</p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 10, width: "100%", boxSizing: "border-box", paddingRight: 60 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#6b7280",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        <input
          type={showPw ? "text" : "password"}
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={{ padding: 10 }}
        />
        <button className="btn-primary" disabled={loading || !password || !confirm} style={{ padding: 10 }}>
          {loading ? "Saving..." : "Set Password"}
        </button>

        {msg && (
          <div style={{ color: msg.type === "error" ? "crimson" : "#367C2B", fontWeight: 600 }}>
            {msg.text}
          </div>
        )}
      </form>
    </main>
  );
}
