"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

type Step = "credentials" | "otp";
type MsgType = "success" | "error";

const supabase = createClient();

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgType, setMsgType] = useState<MsgType>("error");
  const [loading, setLoading] = useState(false);

  function setError(text: string) {
    setMsg(text);
    setMsgType("error");
  }

  function setSuccess(text: string) {
    setMsg(text);
    setMsgType("success");
  }

  async function sendOtp(): Promise<boolean> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { error: pwError } = await supabase.auth.signInWithPassword({ email, password });
    if (pwError) {
      setLoading(false);
      setError(pwError.message);
      return;
    }

    if (process.env.NEXT_PUBLIC_REQUIRE_EMAIL_CODE !== "true") {
      setLoading(false);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Sign out the session created by password check before switching to OTP flow
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setLoading(false);
      setError("Session error. Please try again.");
      return;
    }

    const ok = await sendOtp();
    setLoading(false);
    if (ok) setStep("otp");
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: "email",
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function resendOtp() {
    setMsg(null);
    const ok = await sendOtp();
    if (ok) setSuccess("Code resent — check your email.");
  }

  if (step === "otp") {
    return (
      <main style={{ maxWidth: 420, margin: "60px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>IS Dept Portal</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Enter the 6-digit code we sent to <strong>{email}</strong>.
        </p>

        <form onSubmit={onVerifyOtp} style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <input
            placeholder="6-digit code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            style={{ padding: 10, letterSpacing: 6, fontSize: 20, textAlign: "center" }}
            autoFocus
          />
          <button className="btn-primary" disabled={loading || otp.trim().length < 6} style={{ padding: 10 }}>
            {loading ? "Verifying..." : "Verify Code"}
          </button>

          {msg && (
            <div style={{ color: msgType === "success" ? "#367C2B" : "crimson", fontWeight: 600 }}>
              {msg}
            </div>
          )}
        </form>

        <div style={{ marginTop: 16, display: "flex", gap: 16, fontSize: 14 }}>
          <button
            onClick={resendOtp}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#367C2B", fontWeight: 600, padding: 0 }}
          >
            Resend code
          </button>
          <button
            onClick={() => { setStep("credentials"); setOtp(""); setMsg(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontWeight: 600, padding: 0 }}
          >
            Back
          </button>
        </div>
      </main>
    );
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
          type="email"
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
        <button className="btn-primary" disabled={loading} style={{ padding: 10 }}>
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </form>

      <a
        href="/forgot-password"
        style={{ display: "block", marginTop: 12, color: "#367C2B", fontWeight: 600, fontSize: 14 }}
      >
        Forgot password?
      </a>
    </main>
  );
}
