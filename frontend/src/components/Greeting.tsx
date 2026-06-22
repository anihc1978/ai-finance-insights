// src/components/Greeting.tsx
// ---------------------------------------------------------------------------
// A personal, time-aware header: "Buenos días, Eduardo". The name comes from
// localStorage (editable) and defaults to the capitalized local-part of the
// logged-in email so it feels personal from the first load.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { tokens } from "../lib/theme";

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function defaultName(email: string | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

export function Greeting() {
  const { session } = useAuth();
  const [name, setName] = useState<string>(
    () => localStorage.getItem("fin_nombre") ?? defaultName(session?.user.email),
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  function save() {
    const clean = draft.trim();
    setName(clean);
    localStorage.setItem("fin_nombre", clean);
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="Tu nombre"
          autoFocus
          style={{ fontSize: 22, padding: "4px 10px" }}
        />
        <button onClick={save}>Guardar</button>
      </div>
    );
  }

  return (
    <h1 style={{ margin: 0, fontWeight: 500, display: "flex", alignItems: "baseline", gap: 8 }}>
      {timeGreeting()}
      {name ? `, ${name}` : ""}
      <button
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        aria-label="Editar nombre"
        style={{
          fontSize: 13,
          color: tokens.colors.textMuted,
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        Editar
      </button>
    </h1>
  );
}
