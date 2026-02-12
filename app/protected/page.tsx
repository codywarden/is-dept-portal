"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "../components/BackButton";
import { createClient } from "../lib/supabase/client";

export default function ProtectedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    let isMounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!isMounted) return;

      const session = data?.session ?? null;
      if (error || !session) {
        router.replace("/login");
        return;
      }

      setEmail(session.user.email ?? null);
      setLoading(false);
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <p>Checking authentication…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <BackButton />
      <h1>Protected Page</h1>
      <p>Welcome{email ? `, ${email}` : ""}!</p>
      <button
        onClick={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.replace("/login");
        }}
        style={{ marginTop: 16, padding: 10 }}
      >
        Sign out
      </button>
    </main>
  );
}
