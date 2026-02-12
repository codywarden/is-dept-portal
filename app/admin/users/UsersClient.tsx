"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BackButton from "../../components/BackButton";

type Role = "admin" | "verifier" | "viewer";

type AdminRow = {
  id: string;
  email: string | null;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  last_login: string | null;
  created_at?: string | null;
};

const LOCATIONS = [
  "Bucklin",
  "Greensburg",
  "Ness City",
  "Pratt",
  "Hoxie",
  "Great Bend",
] as const;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function UsersClient({ initialUsers }: { initialUsers: AdminRow[] }) {
  const [users, setUsers] = useState<AdminRow[]>(initialUsers);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    location: "",
    role: "viewer" as Role,
  });
  const [loading, setLoading] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [locations, setLocations] = useState<string[]>(Array.from(LOCATIONS));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/locations");
        if (!res.ok) return;
        const j = await res.json();
        const rows = j?.data ?? [];
        setLocations(rows.map((r: { name: string }) => r.name));
      } catch {
        // ignore
      }
    })();
  }, []);

  const canSubmit = Boolean(
    formData.email.trim() &&
      formData.password &&
      formData.firstName.trim() &&
      formData.lastName.trim() &&
      formData.location &&
      formData.role
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase();
      const loc = (u.location ?? "").toLowerCase();
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        u.id.includes(q) ||
        name.includes(q) ||
        loc.includes(q)
      );
    });
  }, [users, query]);

  async function setRole(userId: string, role: Role) {
    setMsg(null);

    const res = await fetch("/api/admin/set-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error ?? "Failed to update role");

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    setMsg("Role updated ✅");
  }

  async function updateProfile(
    userId: string,
    patch: Partial<Pick<AdminRow, "first_name" | "last_name" | "location">>
  ) {
    setMsg(null);

    const res = await fetch("/api/admin/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, patch }),
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error ?? "Failed to update profile");

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...patch } : u)));
    setMsg("Profile updated ✅");
  }

  async function addUser() {
    setMsg(null);
    const { email, password, firstName, lastName, location, role } = formData;
    const missing: string[] = [];
    if (!email?.trim()) missing.push("Email");
    if (!password?.trim()) missing.push("Password");
    if (!firstName?.trim()) missing.push("First name");
    if (!lastName?.trim()) missing.push("Last name");
    if (!location?.trim()) missing.push("Location");
    if (!role) missing.push("Role");

    if (missing.length > 0) {
      setAttemptedSubmit(true);
      setMsg(`Cannot add user — missing required fields: ${missing.join(", ")}`);
      return;
    }

    setLoading(true);

    const res = await fetch("/api/admin/add-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.email.trim(),
        password: formData.password,
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        location: formData.location.trim(),
        role: formData.role,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) return setMsg(data?.error ?? "Failed to add user");

    const newUser: AdminRow = {
      id: data.user.id,
      email: data.user.email,
      first_name: data.user.first_name,
      last_name: data.user.last_name,
      location: data.user.location,
      role: data.user.role,
      last_login: null,
      created_at: new Date().toISOString(),
    };

    setUsers((prev) => [newUser, ...prev]);
    setMsg("User added successfully ✅");
    setShowAddForm(false);
    setFormData({
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      location: "",
      role: "viewer",
    });
    setAttemptedSubmit(false);
  }

  async function deleteUser(userId: string) {
    setMsg(null);

    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    const data = await res.json();
    if (!res.ok) return setMsg(data?.error ?? "Failed to delete user");

    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setMsg("User deleted ✅");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Manage Users
        </h1>

        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, name, location, id…"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(117, 9, 9, 0.15)",
              minWidth: 280,
              background: "#f9fafb",
              color: "#111827",
              fontWeight: 600,
            }}
          />
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              background: "#f9fafb",
              color: "#111827",
              fontWeight: 700,
            }}
          >
            Users: {filtered.length}
          </div>
          <button
            onClick={() => {
              const next = !showAddForm;
              setShowAddForm(next);
              setAttemptedSubmit(next);
            }}
            style={{
              backgroundColor: "#367C2B",
              color: "#FFC72C",
              padding: "10px 16px",
              borderRadius: 6,
              fontWeight: 600,
              border: "2px solid #FFC72C",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            {showAddForm ? "Cancel" : "+ Add User"}
          </button>
        </div>

        {msg && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "#f9fafb",
              border: "1px solid rgba(0,0,0,0.12)",
              color: "#111827",
              fontWeight: 700,
            }}
          >
            {msg}
          </div>
        )}

        {showAddForm && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: "#f9fafb",
              border: "2px solid #367C2B",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
              Add New User
            </h2>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <input
                type="email"
                placeholder="Email *"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: attemptedSubmit && !formData.email.trim() ? "2px solid #dc2626" : "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              />
              <input
                type="password"
                placeholder="Password *"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: attemptedSubmit && !formData.password ? "2px solid #dc2626" : "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              />
              <input
                type="text"
                placeholder="First Name *"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: attemptedSubmit && !formData.firstName.trim() ? "2px solid #dc2626" : "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              />
              <input
                type="text"
                placeholder="Last Name *"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: attemptedSubmit && !formData.lastName.trim() ? "2px solid #dc2626" : "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              />
              <select
                required
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: attemptedSubmit && !formData.location ? "2px solid #dc2626" : "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              >
                <option value="">Select Location *</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                required
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: attemptedSubmit && !formData.role ? "2px solid #dc2626" : "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              >
                <option value="">Select Role *</option>
                <option value="viewer">Viewer</option>
                <option value="verifier">Verifier</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              onClick={addUser}
              disabled={loading}
              style={{
                marginTop: 12,
                backgroundColor: "#367C2B",
                color: "#FFC72C",
                padding: "10px 20px",
                borderRadius: 6,
                fontWeight: 600,
                border: "2px solid #FFC72C",
                cursor: loading ? "not-allowed" : canSubmit ? "pointer" : "default",
                opacity: loading || !canSubmit ? 0.6 : 1,
                fontSize: "14px",
              }}
            >
              {loading ? "Adding..." : "Add User"}
            </button>
          </div>
        )}
      </header>

      <section style={{ display: "grid", gap: 12 }}>
        {filtered.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            locations={locations}
            onSetRole={setRole}
            onUpdateProfile={updateProfile}
            onDelete={deleteUser}
          />
        ))}
      </section>
    </div>
  );
}

function UserRow({
  user,
  locations,
  onSetRole,
  onUpdateProfile,
  onDelete,
}: {
  user: AdminRow;
  locations: string[];
  onSetRole: (id: string, role: Role) => Promise<void>;
  onUpdateProfile: (
    id: string,
    patch: Partial<Pick<AdminRow, "first_name" | "last_name" | "location">>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [first, setFirst] = useState(user.first_name ?? "");
  const [last, setLast] = useState(user.last_name ?? "");
  const [loc, setLoc] = useState(user.location ?? "");

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 14,
        padding: 14,
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        display: "grid",
        gridTemplateColumns: "1.2fr 1fr 180px",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontWeight: 900, color: "#111827" }}>
          {user.email ?? "(no email)"}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, color: "#111827" }}>
          {user.id}
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#111827" }}>
          <b>Last login:</b> {fmtDate(user.last_login)}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder="First"
            style={{ padding: 10, color: "#111827", borderRadius: 10, border: "4px solid rgba(5, 0, 0, 0.15)" }}
          />
          <input
            value={last}
            onChange={(e) => setLast(e.target.value)}
            placeholder="Last"
            style={{ padding: 10, color: "#111827", borderRadius: 10, border: "4px solid rgba(0, 0, 0, 0.15)" }}
          />
        </div>

        <select
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "4px solid rgba(0,0,0,0.15)",
            background: "white",
            fontWeight: 700,
            color: "#000103",
          }}
        >
          <option value="">Select location…</option>
          {locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>

        <button
          onClick={() =>
            onUpdateProfile(user.id, {
              first_name: first.trim(),
              last_name: last.trim(),
              location: loc.trim(),
            })
          }
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "none",
            background: "#367C2B",
            color: "white",
            fontWeight: 900,
          }}
        >
          Save Profile
        </button>
      </div>

      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
        <select
          value={user.role}
          onChange={(e) => onSetRole(user.id, e.target.value as Role)}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid #367C2B",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 900,
            minWidth: 120,
          }}
        >
          <option value="viewer">viewer</option>
          <option value="verifier">verifier</option>
          <option value="admin">admin</option>
        </select>

        <button
          onClick={() => {
            if (!confirm(`Delete user ${user.email ?? user.id}? This cannot be undone.`)) return;
            onDelete(user.id);
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "2px solid rgba(220, 38, 38, 0.9)",
            background: "#fff",
            color: "#dc2626",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
