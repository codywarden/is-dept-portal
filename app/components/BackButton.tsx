"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      style={{
        padding: "10px 16px",
        marginBottom: "16px",
        backgroundColor: "#367C2B",
        color: "#FFC72C",
        border: "2px solid #FFC72C",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "600",
        transition: "all 0.2s ease",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = "#2d6a23";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(54, 124, 43, 0.3)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = "#367C2B";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      ← Back
    </button>
  );
}
