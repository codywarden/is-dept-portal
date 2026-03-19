"use client";

import { useEffect, useState } from "react";

type NoteStatus = "not_started" | "in_progress" | "done";
type NotePriority = "low" | "medium" | "high" | "system_fail";

type DevNote = {
  id: string;
  note: string;
  status: NoteStatus;
  priority: NotePriority;
  created_at: string | null;
  updated_at: string | null;
};

const STATUS_LABELS: Record<NoteStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  done: "Done",
};

const PRIORITY_LABELS: Record<NotePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  system_fail: "System Fail",
};

export default function NotesClient() {
  const [notes, setNotes] = useState<DevNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newStatus, setNewStatus] = useState<NoteStatus>("not_started");
  const [newPriority, setNewPriority] = useState<NotePriority>("medium");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ note?: string; status?: NoteStatus; priority?: NotePriority }>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/dev-notes");
        const j = await res.json();
        if (!res.ok) {
          setMsg(j?.error ?? "Failed to load notes");
        } else {
          setNotes(j?.data ?? []);
        }
      } catch (err) {
        console.error(err);
        setMsg("Failed to load notes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addNote() {
    setMsg(null);
    const note = newNote.trim();
    if (!note) return setMsg("Note text required");

    const res = await fetch("/api/admin/dev-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, status: newStatus, priority: newPriority }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to add note");

    setNotes((prev) => [j.data, ...prev]);
    setNewNote("");
    setNewStatus("not_started");
    setNewPriority("medium");
    setMsg("Note added ✅");
  }

  function startEdit(note: DevNote) {
    setEditingId(note.id);
    setEditValues({ note: note.note, status: note.status, priority: note.priority });
  }

  async function saveEdit(id: string) {
    setMsg(null);
    const patch: { note?: string; status?: NoteStatus; priority?: NotePriority } = {};
    if (editValues.note !== undefined) patch.note = editValues.note;
    if (editValues.status !== undefined) patch.status = editValues.status;
    if (editValues.priority !== undefined) patch.priority = editValues.priority;

    const res = await fetch("/api/admin/dev-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to update note");

    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...j.data } : n)));
    setEditingId(null);
    setEditValues({});
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    setMsg(null);
    const res = await fetch("/api/admin/dev-notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    if (!res.ok) return setMsg(j?.error ?? "Failed to delete note");
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#d7d9cc", padding: 32 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111827", marginBottom: 8 }}>
          Development Notes
        </h1>
        <p style={{ color: "#374151", fontSize: 14, margin: 0 }}>
          Track items to revisit later.
        </p>
      </header>

      <div style={{ maxWidth: 800 }}>
        <div style={{ marginBottom: 24, background: "#f9fafb", padding: 16, borderRadius: 10, border: "1px solid rgba(0,0,0,0.12)" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Note</div>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a development note..."
            rows={3}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 8,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "white",
              color: "#111827",
              fontWeight: 500,
              resize: "vertical",
              marginBottom: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as NoteStatus)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                fontWeight: 700,
              }}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as NotePriority)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "#fff",
                fontWeight: 700,
              }}
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              className="btn-primary"
              onClick={addNote}
            >
              Add Note
            </button>
          </div>
        </div>

        {msg && (
          <div
            style={{
              marginBottom: 16,
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

        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading notes...</div>
        ) : notes.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No notes yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {notes.map((note) => (
              <div
                key={note.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 180px",
                  gap: 12,
                  background: "#fff",
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                  alignItems: "start",
                }}
              >
                <div>
                  {editingId === note.id ? (
                    <textarea
                      value={editValues.note ?? ""}
                      onChange={(e) => setEditValues((p) => ({ ...p, note: e.target.value }))}
                      rows={3}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: "#fff",
                      }}
                    />
                  ) : (
                    <div style={{ fontWeight: 600, color: "#111827" }}>{note.note}</div>
                  )}
                </div>
                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  {editingId === note.id ? (
                    <select
                      value={editValues.status ?? "not_started"}
                      onChange={(e) => setEditValues((p) => ({ ...p, status: e.target.value as NoteStatus }))}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontWeight: 700 }}>{STATUS_LABELS[note.status]}</div>
                  )}
                  {editingId === note.id ? (
                    <select
                      value={editValues.priority ?? "medium"}
                      onChange={(e) => setEditValues((p) => ({ ...p, priority: e.target.value as NotePriority }))}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.2)",
                        background: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontWeight: 700 }}>{PRIORITY_LABELS[note.priority]}</div>
                  )}
                  {editingId === note.id ? (
                    <>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => saveEdit(note.id)}
                      >
                        Save
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          setEditingId(null);
                          setEditValues({});
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => startEdit(note)}
                      >
                        Update
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => deleteNote(note.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
