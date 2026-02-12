"use client";

import BackButton from "../../components/BackButton";
import { useEffect, useState } from "react";

type Role = "admin" | "verifier" | "viewer";

type Task = {
  id: string;
  title: string;
  due_date?: string;
  status: "not_started" | "in_progress" | "complete";
  created_at?: string;
};

const DEFAULT_LOCATIONS = [
  "Bucklin",
  "Greensburg",
  "Ness City",
  "Pratt",
  "Hoxie",
  "Great Bend",
] as const;

export default function TasksClient({ role }: { role: Role }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locations, setLocations] = useState<string[]>(Array.from(DEFAULT_LOCATIONS));
  const [selectedLocation, setSelectedLocation] = useState("");

  async function loadTasks(locationFilter?: string) {
    try {
      const params = new URLSearchParams();
      if (role === "admin" && locationFilter) params.set("location", locationFilter);
      const url = params.toString()
        ? `/api/service-agreements/tasks?${params.toString()}`
        : "/api/service-agreements/tasks";
      const res = await fetch(url);
      if (!res.ok) return;
      const { data } = await res.json();
      setTasks(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  // Load tasks from API on mount / filter change
  useEffect(() => {
    loadTasks(selectedLocation);
  }, [selectedLocation]);

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

  async function addTask() {
    if (!title.trim()) return setMsg("Title required");
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/service-agreements/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          due_date: due || null,
          status: "not_started",
        }),
      });

      const { data, error } = await res.json();
      setLoading(false);

      if (!res.ok) return setMsg(error || "Failed to add task");

      setTasks((s) => [data, ...s]);
      setTitle("");
      setDue("");
      setMsg("Task added ✅");
    } catch (err) {
      setLoading(false);
      setMsg("Error adding task");
      console.error(err);
    }
  }

  async function updateStatus(id: string, status: Task["status"]) {
    try {
      const res = await fetch("/api/service-agreements/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: { status } }),
      });

      if (!res.ok) return setMsg("Failed to update task");
      setTasks((s) => s.map((t) => (t.id === id ? { ...t, status } : t)));
    } catch (err) {
      console.error(err);
    }
  }

  const counts = tasks.reduce(
    (acc, t) => {
      if (t.status === "complete") acc.green++;
      else if (t.status === "in_progress") acc.yellow++;
      else acc.red++;
      acc.total++;
      return acc;
    },
    { green: 0, yellow: 0, red: 0, total: 0 }
  );

  const greenPct = counts.total ? (counts.green / counts.total) * 100 : 0;
  const yellowPct = counts.total ? (counts.yellow / counts.total) * 100 : 0;
  const redPct = counts.total ? (counts.red / counts.total) * 100 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <BackButton />
      <h1 style={{ fontSize: 30, fontWeight: 900, color: "#367C2B", marginBottom: 8 }}>Tasks</h1>

      {role === "admin" && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontWeight: 700, color: "#000" }}>Filter by location:</label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", background: "white", color: "#000", fontWeight: 500 }}
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        style={{
          marginBottom: 12,
          padding: "10px 12px",
          borderRadius: 10,
          background: "#f9fafb",
          border: "1px solid rgba(0,0,0,0.12)",
          color: "#111827",
          fontWeight: 700,
        }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>Green: {counts.green}</div>
          <div>Yellow: {counts.yellow}</div>
          <div>Red: {counts.red}</div>
          <div>Total: {counts.total}</div>
        </div>
        <div style={{ marginTop: 8, height: 10, borderRadius: 8, overflow: "hidden", background: "#e5e7eb" }}>
          <div style={{ width: `${redPct}%`, height: "100%", background: "#dc2626", float: "left" }} />
          <div style={{ width: `${yellowPct}%`, height: "100%", background: "#f59e0b", float: "left" }} />
          <div style={{ width: `${greenPct}%`, height: "100%", background: "#16a34a", float: "left" }} />
        </div>
      </div>
      {msg && (
        <div
          style={{
            marginBottom: 12,
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
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            minWidth: 200,
            background: "white",
            color: "#000",
            fontWeight: 500,
          }}
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "white",
            color: "#000",
            fontWeight: 500,
          }}
        />
        {(role === "admin" || role === "verifier") && (
          <button
            onClick={addTask}
            disabled={loading}
            style={{
              backgroundColor: "#367C2B",
              color: "#FFC72C",
              padding: "10px 16px",
              borderRadius: 6,
              fontWeight: 600,
              border: "2px solid #FFC72C",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Adding..." : "+ Add Task"}
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              background: "#f9fafb",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 10,
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: "#111827" }}>{task.title}</div>
              {task.due_date && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Due: {task.due_date}</div>
              )}
            </div>
            <select
              value={task.status}
              onChange={(e) => updateStatus(task.id, e.target.value as Task["status"])}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "2px solid #367C2B",
                backgroundColor:
                  task.status === "complete" ? "#dcfce7" : task.status === "in_progress" ? "#fef3c7" : "#fee2e2",
                color: task.status === "complete" ? "#16a34a" : task.status === "in_progress" ? "#d97706" : "#dc2626",
                fontWeight: 700,
              }}
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
