// src/components/ThemeToggle.tsx
// ---------------------------------------------------------------------------
// A compact, premium segmented control for switching the app between the light
// ("Claro") and dark ("Oscuro") themes. It reads the current theme from
// theme.ts, calls applyTheme on click (which flips the [data-theme] attribute
// and persists the choice to localStorage), and re-renders so the active side
// stays highlighted. It themes itself from `tokens`, so it recolors along with
// the rest of the dashboard. Self-contained, Spanish labels.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { tokens } from "../lib/theme";
import { applyTheme, getCurrentTheme, type ThemeName } from "../lib/theme";

const OPTIONS: { name: ThemeName; label: string }[] = [
  { name: "light", label: "☀️ Claro" },
  { name: "dark", label: "🌙 Oscuro" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>(getCurrentTheme);

  function pick(name: ThemeName) {
    applyTheme(name);
    setTheme(name);
  }

  return (
    <div
      role="group"
      aria-label="Tema"
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 2,
        borderRadius: tokens.radii.pill,
        background: tokens.colors.surface,
        border: `1px solid ${tokens.colors.border}`,
      }}
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.name;
        return (
          <button
            key={opt.name}
            type="button"
            onClick={() => pick(opt.name)}
            aria-pressed={active}
            style={{
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              lineHeight: 1,
              padding: "6px 12px",
              borderRadius: tokens.radii.pill,
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: active ? tokens.colors.cardBg : "transparent",
              color: active ? tokens.colors.text : tokens.colors.textMuted,
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "background-color .15s, color .15s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
