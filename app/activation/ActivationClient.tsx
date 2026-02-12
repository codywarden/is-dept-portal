"use client";

import BackButton from "../components/BackButton";

export default function ActivationClient() {
  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32, color: "#000" }}>
      <BackButton />
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Activation
        </h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Upload subscription data and review cost account status.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        <Card
          title="Cost Account"
          href="/activation/cost-account"
          description="View parsed cost account subscriptions by customer."
        />
        <Card
          title="Sold To (coming soon)"
          description="Upload sold-to PDFs (future)."
          disabled
        />
        <Card
          title="Upload Data"
          href="/activation/upload"
          description="Upload subscription PDFs (new or old style)."
        />
        <Card
          title="Reconcile (coming soon)"
          description="Match cost vs sold-to and show red/green status."
          disabled
        />
      </section>
    </div>
  );
}

function Card({
  title,
  description,
  href,
  disabled,
}: {
  title: string;
  description: string;
  href?: string;
  disabled?: boolean;
}) {
  const sharedStyle = {
    background: "#f9fafb",
    border: "8px solid #367C2B",
    borderRadius: 10,
    padding: 20,
    textDecoration: "none",
    color: "#111827",
    fontWeight: 700,
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    opacity: disabled ? 0.6 : 1,
  };

  if (disabled || !href) {
    return (
      <div style={sharedStyle}>
        <div>
          <div style={{ fontSize: 18 }}>{title}</div>
          <div style={{ marginTop: 8, color: "#6b7280", fontWeight: 600 }}>
            {description}
          </div>
        </div>
        <div style={{ marginTop: 12, color: "#9ca3af", fontWeight: 800 }}>
          COMING SOON
        </div>
      </div>
    );
  }

  return (
    <a href={href} style={sharedStyle}>
      <div>
        <div style={{ fontSize: 18 }}>{title}</div>
        <div style={{ marginTop: 8, color: "#6b7280", fontWeight: 600 }}>
          {description}
        </div>
      </div>
      <div style={{ marginTop: 12, color: "#367C2B", fontWeight: 800 }}>
        OPEN →
      </div>
    </a>
  );
}
