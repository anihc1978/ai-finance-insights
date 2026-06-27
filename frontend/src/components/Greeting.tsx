// src/components/Greeting.tsx
// ---------------------------------------------------------------------------
// A personal, time-aware header: "Buenos días, <name>". The name comes from
// localStorage (editable). It starts EMPTY so a new person sees just the
// greeting and fills in their own name via "Editar".
// ---------------------------------------------------------------------------
import { useState } from "react";
import { tokens } from "../lib/theme";
import { useLang, type Lang } from "../lib/i18n";

const T = {
  es: {
    morning: "Buenos días",
    afternoon: "Buenas tardes",
    evening: "Buenas noches",
    yourName: "Tu nombre",
    save: "Guardar",
    edit: "Editar",
    editName: "Editar nombre",
  },
  en: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    yourName: "Your name",
    save: "Save",
    edit: "Edit",
    editName: "Edit name",
  },
} as const;

function timeGreeting(lang: Lang): string {
  const t = T[lang];
  const h = new Date().getHours();
  if (h < 12) return t.morning;
  if (h < 19) return t.afternoon;
  return t.evening;
}

export function Greeting() {
  const lang = useLang();
  const t = T[lang];
  const [name, setName] = useState<string>(
    () => localStorage.getItem("fin_nombre") ?? "",
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
          placeholder={t.yourName}
          autoFocus
          style={{ fontSize: 22, padding: "4px 10px" }}
        />
        <button onClick={save}>{t.save}</button>
      </div>
    );
  }

  return (
    <h1 style={{ margin: 0, fontWeight: 500, display: "flex", alignItems: "baseline", gap: 8 }}>
      {timeGreeting(lang)}
      {name ? `, ${name}` : ""}
      <button
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        aria-label={t.editName}
        style={{
          fontSize: 13,
          color: tokens.colors.textMuted,
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {t.edit}
      </button>
    </h1>
  );
}
