"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "admin" | "manager" | "user" | "guest";

type AdminRow = {
  id: string;
  email: string | null;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  locations: string[] | null;
  page_permissions: Record<string, boolean> | null;
  last_login: string | null;
  created_at?: string | null;
  cell_phone?: string | null;
};

const LOCATIONS_DEFAULT = [
  "Bucklin",
  "Greensburg",
  "Ness City",
  "Pratt",
  "Hoxie",
  "Great Bend",
] as const;

const PAGE_GROUPS: {
  key: string;
  label: string;
  subpages: { key: string; label: string }[];
}[] = [
  {
    key: "admin",
    label: "Admin",
    subpages: [
      { key: "admin/users", label: "Manage Users" },
      { key: "admin/users/add", label: "Add User" },
      { key: "admin/users/delete", label: "Delete User" },
      { key: "admin/settings", label: "Settings" },
      { key: "admin/notes", label: "Notes" },
    ],
  },
  { key: "see-spray", label: "See & Spray", subpages: [] },
  { key: "sprayers", label: "Sprayers", subpages: [] },
  {
    key: "frankie",
    label: "Frankie (Tractor Control)",
    subpages: [
      { key: "frankie_firmware", label: "Firmware Management" },
    ],
  },
  {
    key: "activation",
    label: "Activation",
    subpages: [
      { key: "activation/upload", label: "Upload Cost" },
      { key: "activation/sold-upload", label: "Upload Sold" },
      { key: "activation/cost-account", label: "Cost Account" },
      { key: "activation/location-summary", label: "Location Summary" },
      { key: "activation/change-location", label: "Change Location" },
      { key: "activation/reconcile", label: "Reconcile" },
      { key: "activation/auto-reconcile", label: "Auto Reconcile" },
      { key: "activation/check", label: "Business System Numbers" },
    ],
  },
  {
    key: "service-agreements",
    label: "Service Agreements",
    subpages: [
      { key: "service-agreements/customers", label: "Customers" },
      { key: "service-agreements/equipment", label: "Equipment" },
      { key: "service-agreements/tasks", label: "Tasks" },
      { key: "service-agreements/settings", label: "Settings" },
    ],
  },
];

function fmtPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function UsersClient({ initialUsers, canAddUser, canDeleteUser, canAssignAdmin }: { initialUsers: AdminRow[]; canAddUser: boolean; canDeleteUser: boolean; canAssignAdmin: boolean }) {
  const [users, setUsers] = useState<AdminRow[]>(initialUsers);
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    locations: [] as string[],
    role: "user" as Role,
    cell_phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [locations, setLocations] = useState<string[]>(Array.from(LOCATIONS_DEFAULT));

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
      formData.role
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase();
      const locs = (u.locations ?? (u.location ? [u.location] : [])).join(" ").toLowerCase();
      return (
        (u.email ?? "").toLowerCase().includes(q) ||
        u.id.includes(q) ||
        name.includes(q) ||
        locs.includes(q)
      );
    });
  }, [users, query]);

  async function setRole(userId: string, role: Role) {
    const res = await fetch("/api/admin/set-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data?.error ?? "Failed to update role");
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  }


  async function addUser() {
    setMsg(null);
    const { email, password, firstName, lastName, locations: locs, role } = formData;
    const missing: string[] = [];
    if (!email?.trim()) missing.push("Email");
    if (!password?.trim()) missing.push("Password");
    if (!firstName?.trim()) missing.push("First name");
    if (!lastName?.trim()) missing.push("Last name");
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
        locations: locs,
        location: locs[0] ?? null,
        role: formData.role,
        cell_phone: formData.cell_phone.trim() || null,
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
      locations: data.user.locations ?? (data.user.location ? [data.user.location] : []),
      page_permissions: null,
      role: data.user.role,
      last_login: null,
      created_at: new Date().toISOString(),
    };

    setUsers((prev) => [newUser, ...prev]);
    setMsg("User added successfully ✅");
    setShowAddForm(false);
    setFormData({ email: "", password: "", firstName: "", lastName: "", locations: [], role: "user", cell_phone: "" });
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

  function toggleAddFormLocation(loc: string) {
    setFormData((prev) => ({
      ...prev,
      locations: prev.locations.includes(loc)
        ? prev.locations.filter((l) => l !== loc)
        : [...prev.locations, loc],
    }));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>Manage Users</h1>

        <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, name, location, id…"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
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
          {canAddUser && (
            <button
              className="btn-primary btn-lg"
              onClick={() => {
                const next = !showAddForm;
                setShowAddForm(next);
                setAttemptedSubmit(false);
              }}
            >
              {showAddForm ? "Cancel" : "+ Add User"}
            </button>
          )}
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
              <input
                type="tel"
                placeholder="Cell phone (optional)"
                value={formData.cell_phone}
                onChange={(e) => setFormData({ ...formData, cell_phone: fmtPhone(e.target.value) })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              />
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  background: "white",
                  color: "#111827",
                  fontWeight: 500,
                }}
              >
                <option value="">Select Role *</option>
                <option value="user">User</option>
                <option value="guest">Guest</option>
                {canAssignAdmin && <option value="manager">Manager</option>}
                {canAssignAdmin && <option value="admin">Admin</option>}
              </select>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111827", marginBottom: 8 }}>
                Locations
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                {locations.map((l) => (
                  <label
                    key={l}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: formData.locations.includes(l) ? "2px solid #367C2B" : "1px solid rgba(0,0,0,0.12)",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 14,
                      color: "#111827",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.locations.includes(l)}
                      onChange={() => toggleAddFormLocation(l)}
                      style={{ accentColor: "#367C2B", width: 16, height: 16 }}
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>

            <button
              className="btn-primary btn-lg"
              onClick={addUser}
              disabled={loading}
              style={{ marginTop: 12, opacity: loading || !canSubmit ? 0.6 : 1 }}
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
            canDeleteUser={canDeleteUser}
            canAssignAdmin={canAssignAdmin}
            onSetRole={setRole}
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
  canDeleteUser,
  canAssignAdmin,
  onSetRole,
  onDelete,
}: {
  user: AdminRow;
  locations: string[];
  canDeleteUser: boolean;
  canAssignAdmin: boolean;
  onSetRole: (id: string, role: Role) => Promise<void>;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [first, setFirst] = useState(user.first_name ?? "");
  const [last, setLast] = useState(user.last_name ?? "");
  const [displayEmail, setDisplayEmail] = useState(user.email ?? "");
  const [displayPhone, setDisplayPhone] = useState(user.cell_phone ?? "");
  const [locs, setLocs] = useState<string[]>(
    user.locations ?? (user.location ? [user.location] : [])
  );
  const [perms, setPerms] = useState<Record<string, boolean>>(user.page_permissions ?? {});
  const [showPerms, setShowPerms] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [resetPwSaving, setResetPwSaving] = useState(false);
  const [resetPwMsg, setResetPwMsg] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editSaveStatus, setEditSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const isFirstRender = useRef(true);
  const isEditFirstChange = useRef(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setSaveStatus("saving");
    debounceTimer.current = setTimeout(async () => {
      const res = await fetch("/api/admin/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          patch: { locations: locs, page_permissions: perms },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSaveError(d?.error ?? "Failed to save");
        setSaveStatus("error");
      } else {
        setSaveError(null);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    }, 1200);
  }, [locs, perms]);

  useEffect(() => {
    if (!showEdit) return;
    if (isEditFirstChange.current) {
      isEditFirstChange.current = false;
      return;
    }
    if (editDebounceTimer.current) clearTimeout(editDebounceTimer.current);
    setEditSaveStatus("saving");
    setEditError(null);
    editDebounceTimer.current = setTimeout(async () => {
      const res = await fetch("/api/admin/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          patch: {
            first_name: editFirst.trim(),
            last_name: editLast.trim(),
            email: editEmail.trim() !== displayEmail ? editEmail.trim() : undefined,
            cell_phone: editPhone.trim() !== displayPhone ? (editPhone.trim() || null) : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data?.error ?? "Failed to save");
        setEditSaveStatus("idle");
        return;
      }
      setFirst(editFirst.trim());
      setLast(editLast.trim());
      if (editEmail.trim() !== displayEmail) setDisplayEmail(editEmail.trim());
      if (editPhone.trim() !== displayPhone) setDisplayPhone(editPhone.trim());
      setEditSaveStatus("saved");
      setTimeout(() => setEditSaveStatus("idle"), 2000);
    }, 1200);
  }, [editFirst, editLast, editEmail, editPhone]);

  function openEdit() {
    isEditFirstChange.current = true;
    setEditFirst(first);
    setEditLast(last);
    setEditEmail(displayEmail);
    setEditPhone(displayPhone);
    setEditError(null);
    setEditSaveStatus("idle");
    setShowEdit(true);
  }

  function toggleLoc(loc: string) {
    setLocs((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  }

  function togglePerm(key: string, value: boolean) {
    setPerms((prev) => ({ ...prev, [key]: value }));
  }

  function toggleGroup(groupKey: string, subpages: { key: string }[], value: boolean) {
    setPerms((prev) => {
      const next = { ...prev, [groupKey]: value };
      for (const s of subpages) next[s.key] = value;
      return next;
    });
  }

  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: 14,
        boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      {/* Main row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 180px",
          gap: 12,
          alignItems: "start",
          padding: 14,
        }}
      >
        {/* Left: identity */}
        <div>
          {(first || last) && (
            <div style={{ fontWeight: 900, fontSize: 15, color: "#111827" }}>
              {[first, last].filter(Boolean).join(" ")}
            </div>
          )}
          <div style={{ fontWeight: first || last ? 500 : 900, color: "#111827", marginTop: first || last ? 2 : 0 }}>
            {displayEmail || "(no email)"}
          </div>
          {displayPhone && (
            <div style={{ marginTop: 2, fontSize: 13, color: "#374151" }}>{displayPhone}</div>
          )}
          <div style={{ marginTop: 6, fontSize: 13, color: "#111827" }}>
            <b>Last login:</b> {fmtDate(user.last_login)}
          </div>
        </div>

        {/* Right: role badge + permissions toggle + delete */}
        <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
          <div style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "2px solid #367C2B",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 900,
            fontSize: 13,
            minWidth: 120,
            textAlign: "center",
            textTransform: "capitalize",
          }}>
            {user.role}
          </div>

          <button
            onClick={openEdit}
            style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid #6b7280", background: "white", color: "#374151", fontWeight: 700, cursor: "pointer", fontSize: 12, minWidth: 120 }}
          >
            Edit Profile
          </button>

          <button
            onClick={() => { setShowResetPw((v) => !v); setNewPassword(""); setResetPwMsg(null); }}
            style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid #6b7280", background: showResetPw ? "#374151" : "white", color: showResetPw ? "white" : "#374151", fontWeight: 700, cursor: "pointer", fontSize: 12, minWidth: 120 }}
          >
            Reset Password
          </button>

          <button
            onClick={() => setShowPerms((v) => !v)}
            style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid #6b7280", background: showPerms ? "#374151" : "white", color: showPerms ? "white" : "#374151", fontWeight: 700, cursor: "pointer", fontSize: 12, minWidth: 120 }}
          >
            {showPerms ? "Hide Permissions" : "Page Permissions"}
          </button>

          {canDeleteUser && (
            <button
              onClick={() => {
                if (!confirm(`Delete user ${user.email ?? user.id}? This cannot be undone.`)) return;
                onDelete(user.id);
              }}
              style={{ padding: "8px 12px", borderRadius: 10, border: "2px solid #dc2626", background: "white", color: "#dc2626", fontWeight: 700, cursor: "pointer", fontSize: 12, minWidth: 120 }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Edit name/email panel */}
      {showEdit && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", padding: "14px 16px", background: "#f3f4f6" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, maxWidth: 800 }}>
            <input
              value={editFirst}
              onChange={(e) => setEditFirst(e.target.value)}
              placeholder="First name"
              style={{ padding: 10, color: "#111827", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
            />
            <input
              value={editLast}
              onChange={(e) => setEditLast(e.target.value)}
              placeholder="Last name"
              style={{ padding: 10, color: "#111827", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
            />
            <input
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              placeholder="Email"
              type="email"
              style={{ padding: 10, color: "#111827", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
            />
            <input
              value={editPhone}
              onChange={(e) => setEditPhone(fmtPhone(e.target.value))}
              placeholder="Cell phone (optional)"
              type="tel"
              style={{ padding: 10, color: "#111827", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white" }}
            />
          </div>
          {editError && <div style={{ marginTop: 8, fontSize: 13, color: "#dc2626" }}>{editError}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
            <button
              onClick={() => setShowEdit(false)}
              style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.2)", background: "white", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Close
            </button>
            <div style={{ fontSize: 13, fontWeight: 700, color: editSaveStatus === "saved" ? "#367C2B" : "#6b7280", visibility: editSaveStatus === "idle" ? "hidden" : "visible" }}>
              {editSaveStatus === "saving" ? "Saving…" : "Saved ✓"}
            </div>
          </div>
        </div>
      )}

      {/* Reset password panel */}
      {showResetPw && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", padding: "14px 16px", background: "#f3f4f6" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#111827", marginBottom: 10 }}>Set New Password</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 460 }}>
            <input
              type={showPw ? "text" : "password"}
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setResetPwMsg(null); }}
              placeholder="New password (min 6 chars)"
              style={{ flex: 1, padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#111827", fontWeight: 600 }}
            />
            <button
              onClick={() => setShowPw((v) => !v)}
              style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#6b7280", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {showPw ? "Hide" : "Show"}
            </button>
            <button
              onClick={async () => {
                if (newPassword.length < 6) return setResetPwMsg({ type: "error", text: "Password must be at least 6 characters" });
                setResetPwSaving(true);
                const res = await fetch("/api/admin/reset-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: user.id, password: newPassword }),
                });
                const data = await res.json();
                setResetPwSaving(false);
                if (!res.ok) return setResetPwMsg({ type: "error", text: data?.error ?? "Failed to reset password" });
                setResetPwMsg({ type: "success", text: "Password updated ✓" });
                setNewPassword("");
              }}
              disabled={resetPwSaving}
              style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#367C2B", color: "white", fontWeight: 700, fontSize: 13, cursor: resetPwSaving ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              {resetPwSaving ? "Saving…" : "Set Password"}
            </button>
          </div>
          {resetPwMsg && (
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: resetPwMsg.type === "success" ? "#367C2B" : "#dc2626" }}>
              {resetPwMsg.text}
            </div>
          )}
        </div>
      )}

      {/* Expandable permissions panel */}
      {showPerms && (
        <div
          style={{
            borderTop: "1px solid rgba(0,0,0,0.1)",
            padding: "14px 16px",
            background: "#f3f4f6",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>

            {/* Location & Setup header */}
            <div style={{ gridColumn: "1 / -1", fontWeight: 800, fontSize: 14, color: "#111827" }}>
              Location & Setup
            </div>

            {/* Locations card */}
            <div
              style={{
                background: "white",
                borderRadius: 10,
                border: locs.length === locations.length && locations.length > 0 ? "2px solid #367C2B" : "1px solid rgba(0,0,0,0.12)",
                padding: "10px 12px",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 14, color: "#111827" }}>
                <input
                  type="checkbox"
                  checked={locs.length === locations.length && locations.length > 0}
                  onChange={(e) => setLocs(e.target.checked ? [...locations] : [])}
                  style={{ accentColor: "#367C2B", width: 16, height: 16 }}
                />
                Select All
              </label>
              <div style={{ marginTop: 8, paddingLeft: 24, display: "grid", gap: 5 }}>
                {locations.map((l) => (
                  <label key={l} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#374151", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={locs.includes(l)}
                      onChange={() => toggleLoc(l)}
                      style={{ accentColor: "#367C2B" }}
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>

            {/* Role card */}
            <div style={{
              background: "white",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              padding: "10px 12px",
            }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#111827", marginBottom: 8 }}>Role</div>
              <div style={{ display: "grid", gap: 5 }}>
                {(["user", "guest", ...(canAssignAdmin ? ["manager", "admin"] : [])] as Role[]).map((r) => (
                  <label key={r} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#374151", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={user.role === r}
                      onChange={async () => {
                        if (user.role === r) return;
                        if (r === "admin") {
                          if (!confirm(`Are you sure you want to give ${user.email ?? "this user"} admin access? Admins have full control of the system.`)) return;
                        }
                        await onSetRole(user.id, r);
                      }}
                      style={{ accentColor: "#367C2B" }}
                    />
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* Page Permissions header */}
            <div style={{ gridColumn: "1 / -1", fontWeight: 800, fontSize: 14, color: "#111827", marginTop: 8 }}>
              Page Permissions
              <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 12, color: "#6b7280" }}>
                (leave all off to use role-based defaults)
              </span>
            </div>

            {/* Permission cards */}
            {PAGE_GROUPS.map((group) => {
              const groupOn = perms[group.key] === true;
              return (
                <div
                  key={group.key}
                  style={{
                    background: "white",
                    borderRadius: 10,
                    border: groupOn ? "2px solid #367C2B" : "1px solid rgba(0,0,0,0.12)",
                    padding: "10px 12px",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 800, fontSize: 14, color: "#111827" }}>
                    <input
                      type="checkbox"
                      checked={groupOn}
                      onChange={(e) => toggleGroup(group.key, group.subpages, e.target.checked)}
                      style={{ accentColor: "#367C2B", width: 16, height: 16 }}
                    />
                    {group.label}
                  </label>
                  {group.subpages.length > 0 && (
                    <div style={{ marginTop: 8, paddingLeft: 24, display: "grid", gap: 5 }}>
                      {group.subpages.map((sub) => (
                        <label key={sub.key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "#374151", fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={perms[sub.key] === true}
                            onChange={(e) => togglePerm(sub.key, e.target.checked)}
                            style={{ accentColor: "#367C2B" }}
                          />
                          {sub.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

          </div>

          <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: saveStatus === "saved" ? "#367C2B" : saveStatus === "error" ? "#dc2626" : "#6b7280", visibility: saveStatus === "idle" ? "hidden" : "visible" }}>
            {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? `Error: ${saveError}` : "Saved ✓"}
          </div>
        </div>
      )}
    </div>
  );
}
