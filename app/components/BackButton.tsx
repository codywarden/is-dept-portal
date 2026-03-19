"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

const HIDDEN_PATHS = new Set(["/", "/dashboard", "/login"]);

export default function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (HIDDEN_PATHS.has(pathname)) return null;

  const btnBase: React.CSSProperties = {
    display: "inline-block",
    padding: "8px 16px",
    border: "2px solid #FFC72C",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 0.2s ease",
    textDecoration: "none",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 24px 0",
      }}
    >
      <button
        style={{ ...btnBase, backgroundColor: "#4a4a4a", color: "#fff", border: "2px solid #666" }}
        onClick={() => router.back()}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = "#333";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = "#4a4a4a";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        ← Back
      </button>

      <Link
        href="/dashboard"
        style={{ ...btnBase, backgroundColor: "#367C2B", color: "#FFC72C" }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#2d6a23";
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 2px 8px rgba(54, 124, 43, 0.3)";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#367C2B";
          (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
        }}
      >
        Back to Dashboard →
      </Link>
    </div>
  );
}
