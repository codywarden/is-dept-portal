"use client";

import { useEffect, useMemo, useState } from "react";

type Role = "admin" | "manager" | "user" | "guest";

type AdminRow = {
  id: string;
  email: string | null;
  role: Role;
  first_name: string | null;
  last_name: string | null;
  location: string | null;
  last_login: string | null; // ISO
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

const ACCOUNT_SEGMENT_LENGTHS = [2, 2, 3, 1] as const;
const SOLD_TO_CHANGE_LOCATION_KEY = "sold_to_change_location_enabled";

function splitAccountNumber(value: string): [string, string, string, string] {
  const parts = value.split("-");
  return ACCOUNT_SEGMENT_LENGTHS.map((length, index) =>
    (parts[index] ?? "").replace(/\D/g, "").slice(0, length)
  ) as [string, string, string, string];
}

function joinAccountNumber(parts: [string, string, string, string]) {
  let lastNonEmpty = parts.length - 1;
  while (lastNonEmpty >= 0 && !parts[lastNonEmpty]) {
    lastNonEmpty -= 1;
  }
  return lastNonEmpty >= 0 ? parts.slice(0, lastNonEmpty + 1).join("-") : "";
}


function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function AdminClient({ initialUsers }: { initialUsers: AdminRow[] }) {
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
    role: "user" as Role,
  });
  const [loading, setLoading] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [tab, setTab] = useState<"users" | "settings">("users");
  const [locations, setLocations] = useState<string[]>(Array.from(LOCATIONS));
  const [newLocation, setNewLocation] = useState("");
  const [locationCodes, setLocationCodes] = useState<{ id: string; code: string; location_name: string }[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newCodeLocation, setNewCodeLocation] = useState("");
  const [codesLoading, setCodesLoading] = useState(true);
  const [locationAccounts, setLocationAccounts] = useState<Record<string, string>>({});
  const [soldLocationAccounts, setSoldLocationAccounts] = useState<Record<string, string>>({});
  const [savingLocationAccount, setSavingLocationAccount] = useState(false);
  const [savingSoldLocationAccount, setSavingSoldLocationAccount] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"locations" | "codes" | "accounts" | "soldAccounts" | "features" | null>(null);
  const [soldToChangeLocationEnabled, setSoldToChangeLocationEnabled] = useState(false);
  const [savingFeatureSettings, setSavingFeatureSettings] = useState(false);

  useEffect(() => {
    // fetch locations from API if available
    (async () => {
      try {
        const res = await fetch("/api/admin/locations");
        if (!res.ok) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{ name?: string | null }>;
        setLocations(rows.map((row) => row.name).filter((name): name is string => Boolean(name)));
      } catch {
        // ignore
      }

      try {
        const res = await fetch("/api/admin/sold-location-accounts");
        if (!res.ok) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{
          location_name?: string | null;
          account_number?: string | null;
        }>;

        setSoldLocationAccounts(
          rows.reduce<Record<string, string>>((acc, row) => {
            if (row.location_name && row.account_number) {
              acc[row.location_name] = row.account_number;
            }
            return acc;
          }, {})
        );
      } catch {
        // ignore
      }

      try {
        const res = await fetch("/api/admin/location-codes");
        if (!res.ok) return;
        const j = await res.json();
        setLocationCodes(j?.data ?? []);
      } catch {
        // ignore
      } finally {
        setCodesLoading(false);
      }

      try {
        const res = await fetch("/api/admin/location-accounts");
        if (!res.ok) return;
        const j = await res.json();
        const rows = (j?.data ?? []) as Array<{
          location_name?: string | null;
          account_number?: string | null;
        }>;

        setLocationAccounts(
          rows.reduce<Record<string, string>>((acc, row) => {
            if (row.location_name && row.account_number) {
              acc[row.location_name] = row.account_number;
            }
            return acc;
          }, {})
        );
      } catch {
        // ignore
      }

      try {
        const res = await fetch(`/api/admin/app-settings?key=${SOLD_TO_CHANGE_LOCATION_KEY}`);
        if (!res.ok) return;
        const j = await res.json();
        const row = (j?.data ?? [])[0] as { value?: string | null } | undefined;
        setSoldToChangeLocationEnabled(row?.value === "true");
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
    // Basic client-side validation with detailed feedback
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

    // Add new user to the list
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
      role: "user",
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

  async function addLocation() {
    setMsg(null);
    const name = newLocation.trim();
    if (!name) return setMsg("Location name required");
    const res = await fetch("/api/admin/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to add location");
    setLocations((prev) => [j.data.name, ...prev.filter((p) => p !== j.data.name)]);
    setNewLocation("");
    setMsg("Location added ✅");
  }

  async function deleteLocation(name: string) {
    setMsg(null);
    if (!confirm(`Delete location ${name}?`)) return;
    const res = await fetch("/api/admin/locations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to delete location");
    setLocations((prev) => prev.filter((p) => p !== name));
    setMsg("Location removed ✅");
  }

  async function addLocationCode() {
    setMsg(null);
    const code = newCode.trim().toUpperCase();
    const location_name = newCodeLocation.trim();
    if (!code || !location_name) return setMsg("Code and location are required");

    const res = await fetch("/api/admin/location-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, location_name }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to add location code");
    setLocationCodes((prev) => [j.data, ...prev.filter((p) => p.code !== j.data.code)]);
    setNewCode("");
    setNewCodeLocation("");
    setMsg("Location code added ✅");
  }

  async function deleteLocationCode(id: string, code: string) {
    setMsg(null);
    if (!confirm(`Delete code ${code}?`)) return;
    const res = await fetch("/api/admin/location-codes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to delete location code");
    setLocationCodes((prev) => prev.filter((p) => p.id !== id));
    setMsg("Location code removed ✅");
  }

  async function saveAllLocationAccounts() {
    setMsg(null);
    setSavingLocationAccount(true);
    try {
      const failures: string[] = [];
      for (const locationName of locations) {
        const res = await fetch("/api/admin/location-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationName,
            accountNumber: locationAccounts[locationName] ?? "",
          }),
        });
        if (!res.ok) {
          failures.push(locationName);
        }
      }

      if (failures.length) {
        setMsg(`Failed to save account numbers for: ${failures.join(", ")}`);
        return;
      }

      setMsg("Account numbers saved ✅");
    } catch {
      setMsg("Failed to save account numbers");
    } finally {
      setSavingLocationAccount(false);
    }
  }

  async function saveAllSoldLocationAccounts() {
    setMsg(null);
    setSavingSoldLocationAccount(true);
    try {
      const failures: string[] = [];
      for (const locationName of locations) {
        const res = await fetch("/api/admin/sold-location-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationName,
            accountNumber: soldLocationAccounts[locationName] ?? "",
          }),
        });
        if (!res.ok) {
          failures.push(locationName);
        }
      }

      if (failures.length) {
        setMsg(`Failed to save sold-to account numbers for: ${failures.join(", ")}`);
        return;
      }

      setMsg("Sold-to account numbers saved ✅");
    } catch {
      setMsg("Failed to save sold-to account numbers");
    } finally {
      setSavingSoldLocationAccount(false);
    }
  }

  async function saveFeatureToggles(nextValue?: boolean) {
    setMsg(null);
    setSavingFeatureSettings(true);
    const value = nextValue ?? soldToChangeLocationEnabled;
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: SOLD_TO_CHANGE_LOCATION_KEY,
          value: value ? "true" : "false",
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg(j?.error ?? "Failed to save feature settings");
        return;
      }
      setMsg("Feature settings saved ✅");
    } catch {
      setMsg("Failed to save feature settings");
    } finally {
      setSavingFeatureSettings(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <button
          className="btn-secondary"
          onClick={() => setTab("users")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: tab === "users" ? "2px solid #367C2B" : "1px solid rgba(0,0,0,0.12)",
            background: tab === "users" ? "#f9fafb" : "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Users
        </button>
        <button
          className="btn-secondary"
          onClick={() => setTab("settings")}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: tab === "settings" ? "2px solid #367C2B" : "1px solid rgba(0,0,0,0.12)",
            background: tab === "settings" ? "#f9fafb" : "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Settings
        </button>
      </div>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B" }}>
          Admin
        </h1>

          {tab === "users" ? (
            <>
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
                  className="btn-primary btn-lg"
                  onClick={() => {
                    const next = !showAddForm;
                    setShowAddForm(next);
                    setAttemptedSubmit(next);
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
                      <option value="user">User</option>
                      <option value="guest">Guest</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <button
                    className="btn-primary btn-lg"
                    onClick={addUser}
                    disabled={loading}
                    style={{
                      marginTop: 12,
                      opacity: loading || !canSubmit ? 0.6 : 1,
                    }}
                  >
                    {loading ? "Adding..." : "Add User"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ marginTop: 14, display: "grid", gap: 16 }}>
                <section style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setSettingsSection((prev) => (prev === "codes" ? null : "codes"))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontWeight: 800,
                    }}
                  >
                    <span>ISACTIVE Location Codes</span>
                    <span>{settingsSection === "codes" ? "▾" : "▸"}</span>
                  </button>
                  {settingsSection === "codes" && (
                    <div style={{ padding: "14px 14px 16px" }}>
                      <p style={{ marginTop: 0, marginBottom: 10, color: "#4b5563", fontSize: 13 }}>
                        Map invoice codes (e.g., ISACTIVE1) to a location.
                      </p>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                        <input
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value)}
                          placeholder="Code (e.g., ISACTIVE1)"
                          style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", minWidth: 180 }}
                        />
                        <select
                          value={newCodeLocation}
                          onChange={(e) => setNewCodeLocation(e.target.value)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", minWidth: 180 }}
                        >
                          <option value="">Select location</option>
                          {locations.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <button className="btn-primary btn-sm" onClick={addLocationCode}>
                          Add Code
                        </button>
                      </div>

                      {codesLoading ? (
                        <div style={{ color: "#6b7280" }}>Loading codes...</div>
                      ) : locationCodes.length === 0 ? (
                        <div style={{ color: "#6b7280" }}>No codes yet.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                          {locationCodes.map((row) => (
                            <div
                              key={row.id}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                background: "#fff",
                                padding: 8,
                                borderRadius: 8,
                                border: "1px solid rgba(0,0,0,0.06)",
                              }}
                            >
                              <div style={{ fontWeight: 600, color: "#111827" }}>
                                {row.code} → {row.location_name}
                              </div>
                              <button
                                className="btn-danger btn-sm"
                                onClick={() => deleteLocationCode(row.id, row.code)}
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setSettingsSection((prev) => (prev === "locations" ? null : "locations"))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontWeight: 800,
                    }}
                  >
                    <span>Manage Locations</span>
                    <span>{settingsSection === "locations" ? "▾" : "▸"}</span>
                  </button>
                  {settingsSection === "locations" && (
                    <div style={{ padding: "14px 14px 16px" }}>
                      <p style={{ marginTop: 0, marginBottom: 8, color: "#374151" }}>
                        Manage available locations used by user profiles.
                      </p>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <input
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          placeholder="New location name"
                          style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)", minWidth: 220 }}
                        />
                        <button className="btn-primary btn-sm" onClick={addLocation}>
                          Add Location
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {locations.length === 0 ? (
                          <div style={{ color: "#6b7280" }}>No locations yet.</div>
                        ) : (
                          locations.map((l) => (
                            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                              <div>{l}</div>
                              <button className="btn-danger btn-sm" onClick={() => deleteLocation(l)}>Delete</button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </section>

                <section style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setSettingsSection((prev) => (prev === "accounts" ? null : "accounts"))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontWeight: 800,
                    }}
                  >
                    <span>Activation Cost Account #</span>
                    <span>{settingsSection === "accounts" ? "▾" : "▸"}</span>
                  </button>
                  {settingsSection === "accounts" && (
                    <div style={{ padding: "14px 14px 16px" }}>
                      <p style={{ marginTop: 0, marginBottom: 10, color: "#4b5563", fontSize: 13 }}>
                        Set the account number used for Change Location print files (example: 01-90-363-4).
                      </p>
                      <div style={{ marginBottom: 10 }}>
                        <button
                          className="btn-primary btn-sm"
                          onClick={saveAllLocationAccounts}
                          disabled={savingLocationAccount}
                        >
                          {savingLocationAccount ? "Saving..." : "Save All"}
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {[...locations].sort((a, b) => {
                          const aFirst = parseInt(splitAccountNumber(locationAccounts[a] ?? "")[0] || "0", 10);
                          const bFirst = parseInt(splitAccountNumber(locationAccounts[b] ?? "")[0] || "0", 10);
                          if (!aFirst && !bFirst) return a.localeCompare(b);
                          if (!aFirst) return 1;
                          if (!bFirst) return -1;
                          return aFirst - bFirst;
                        }).map((locationName) => (
                          <div
                            key={`acct-${locationName}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 1.5fr)",
                              gap: 8,
                              alignItems: "center",
                              background: "#fff",
                              padding: 8,
                              borderRadius: 8,
                              border: "1px solid rgba(0,0,0,0.06)",
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#111827" }}>{locationName}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {(() => {
                                const segments = splitAccountNumber(locationAccounts[locationName] ?? "");
                                return (
                                  <>
                                    {segments.map((segment, segmentIndex) => (
                                      <div key={`${locationName}-segment-${segmentIndex}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <input
                                          id={`account-${locationName}-${segmentIndex}`}
                                          inputMode="numeric"
                                          maxLength={ACCOUNT_SEGMENT_LENGTHS[segmentIndex]}
                                          value={segment}
                                          onChange={(e) => {
                                            const sanitized = e.target.value
                                              .replace(/\D/g, "")
                                              .slice(0, ACCOUNT_SEGMENT_LENGTHS[segmentIndex]);
                                            const next = [...segments] as [string, string, string, string];
                                            next[segmentIndex] = sanitized;
                                            setLocationAccounts((prev) => ({
                                              ...prev,
                                              [locationName]: joinAccountNumber(next),
                                            }));

                                            const isSegmentComplete =
                                              sanitized.length === ACCOUNT_SEGMENT_LENGTHS[segmentIndex];
                                            if (isSegmentComplete && segmentIndex < ACCOUNT_SEGMENT_LENGTHS.length - 1) {
                                              const nextInputId = `account-${locationName}-${segmentIndex + 1}`;
                                              const nextInput = document.getElementById(nextInputId) as HTMLInputElement | null;
                                              nextInput?.focus();
                                            }
                                          }}
                                          placeholder={"0".repeat(ACCOUNT_SEGMENT_LENGTHS[segmentIndex])}
                                          style={{
                                            width: `${Math.max(52, ACCOUNT_SEGMENT_LENGTHS[segmentIndex] * 18)}px`,
                                            padding: "8px 8px",
                                            textAlign: "center",
                                            borderRadius: 8,
                                            border: "1px solid rgba(0,0,0,0.15)",
                                            background: "white",
                                            color: "#111827",
                                            fontWeight: 700,
                                          }}
                                        />
                                        {segmentIndex < segments.length - 1 && (
                                          <span style={{ color: "#6b7280", fontWeight: 800 }}>-</span>
                                        )}
                                      </div>
                                    ))}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setSettingsSection((prev) => (prev === "soldAccounts" ? null : "soldAccounts"))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontWeight: 800,
                    }}
                  >
                    <span>Activation Sold Account #</span>
                    <span>{settingsSection === "soldAccounts" ? "▾" : "▸"}</span>
                  </button>
                  {settingsSection === "soldAccounts" && (
                    <div style={{ padding: "14px 14px 16px" }}>
                      <p style={{ marginTop: 0, marginBottom: 10, color: "#4b5563", fontSize: 13 }}>
                        Set sold-to account numbers by location for Sold-To Change Location print files.
                      </p>
                      <div style={{ marginBottom: 10 }}>
                        <button
                          className="btn-primary btn-sm"
                          onClick={saveAllSoldLocationAccounts}
                          disabled={savingSoldLocationAccount}
                        >
                          {savingSoldLocationAccount ? "Saving..." : "Save All Sold-To Accounts"}
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {[...locations].sort((a, b) => {
                          const aFirst = parseInt(splitAccountNumber(soldLocationAccounts[a] ?? "")[0] || "0", 10);
                          const bFirst = parseInt(splitAccountNumber(soldLocationAccounts[b] ?? "")[0] || "0", 10);
                          if (!aFirst && !bFirst) return a.localeCompare(b);
                          if (!aFirst) return 1;
                          if (!bFirst) return -1;
                          return aFirst - bFirst;
                        }).map((locationName) => (
                          <div
                            key={`sold-acct-${locationName}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(140px, 1fr) minmax(220px, 1.5fr)",
                              gap: 8,
                              alignItems: "center",
                              background: "#fff",
                              padding: 8,
                              borderRadius: 8,
                              border: "1px solid rgba(0,0,0,0.06)",
                            }}
                          >
                            <div style={{ fontWeight: 700, color: "#111827" }}>{locationName}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {(() => {
                                const segments = splitAccountNumber(soldLocationAccounts[locationName] ?? "");
                                return (
                                  <>
                                    {segments.map((segment, segmentIndex) => (
                                      <div key={`${locationName}-sold-segment-${segmentIndex}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <input
                                          id={`sold-account-${locationName}-${segmentIndex}`}
                                          inputMode="numeric"
                                          maxLength={ACCOUNT_SEGMENT_LENGTHS[segmentIndex]}
                                          value={segment}
                                          onChange={(e) => {
                                            const sanitized = e.target.value
                                              .replace(/\D/g, "")
                                              .slice(0, ACCOUNT_SEGMENT_LENGTHS[segmentIndex]);
                                            const next = [...segments] as [string, string, string, string];
                                            next[segmentIndex] = sanitized;
                                            setSoldLocationAccounts((prev) => ({
                                              ...prev,
                                              [locationName]: joinAccountNumber(next),
                                            }));

                                            const isSegmentComplete =
                                              sanitized.length === ACCOUNT_SEGMENT_LENGTHS[segmentIndex];
                                            if (isSegmentComplete && segmentIndex < ACCOUNT_SEGMENT_LENGTHS.length - 1) {
                                              const nextInputId = `sold-account-${locationName}-${segmentIndex + 1}`;
                                              const nextInput = document.getElementById(nextInputId) as HTMLInputElement | null;
                                              nextInput?.focus();
                                            }
                                          }}
                                          placeholder={"0".repeat(ACCOUNT_SEGMENT_LENGTHS[segmentIndex])}
                                          style={{
                                            width: `${Math.max(52, ACCOUNT_SEGMENT_LENGTHS[segmentIndex] * 18)}px`,
                                            padding: "8px 8px",
                                            textAlign: "center",
                                            borderRadius: 8,
                                            border: "1px solid rgba(0,0,0,0.15)",
                                            background: "white",
                                            color: "#111827",
                                            fontWeight: 700,
                                          }}
                                        />
                                        {segmentIndex < segments.length - 1 && (
                                          <span style={{ color: "#6b7280", fontWeight: 800 }}>-</span>
                                        )}
                                      </div>
                                    ))}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section style={{ background: "#f9fafb", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)" }}>
                  <button
                    className="btn-secondary"
                    onClick={() =>
                      setSettingsSection((prev) => (prev === "features" ? null : "features"))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontWeight: 800,
                    }}
                  >
                    <span>Feature Toggles</span>
                    <span>{settingsSection === "features" ? "▾" : "▸"}</span>
                  </button>
                  {settingsSection === "features" && (
                    <div style={{ padding: "14px 14px 16px", display: "grid", gap: 12 }}>
                      <label className="toggle-switch" style={{ fontWeight: 700, color: "#111827" }}>
                        <input
                          type="checkbox"
                          checked={soldToChangeLocationEnabled}
                          onChange={(e) => {
                            const nextValue = e.target.checked;
                            setSoldToChangeLocationEnabled(nextValue);
                            saveFeatureToggles(nextValue);
                          }}
                          disabled={savingFeatureSettings}
                        />
                        <span className="toggle-slider" />
                        <span>Enable Sold-To Change Location</span>
                      </label>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </header>

        {tab === "users" && (
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
        )}
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
          className="btn-primary btn-sm"
          onClick={() =>
            onUpdateProfile(user.id, {
              first_name: first.trim(),
              last_name: last.trim(),
              location: loc.trim(),
            })
          }
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
          <option value="user">user</option>
          <option value="guest">guest</option>
          <option value="manager">manager</option>
          <option value="admin">admin</option>
        </select>

        <button
          className="btn-danger btn-sm"
          onClick={() => {
            if (!confirm(`Delete user ${user.email ?? user.id}? This cannot be undone.`)) return;
            onDelete(user.id);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}