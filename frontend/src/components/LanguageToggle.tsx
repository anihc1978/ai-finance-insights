// src/components/LanguageToggle.tsx
// ---------------------------------------------------------------------------
// A compact, premium segmented control for switching the app between Spanish
// ("ES") and English ("EN"). It mirrors ThemeToggle's look exactly. It reads
// the current language from i18n.ts via the useLang() hook, calls setLang on
// click (which persists the choice and broadcasts a "fin_lang_change" event so
// every component re-renders), and themes itself from `tokens` so it recolors
// along with the rest of the dashboard. Self-contained.
// ---------------------------------------------------------------------------
import { tokens } from "../lib/theme";
import { setLang, useLang, type Lang } from "../lib/i18n";

const OPTIONS: { name: Lang; label: string }[] = [
  { name: "es", label: "ES" },
  { name: "en", label: "EN" },
];

export function LanguageToggle() {
  const lang = useLang();

  return (
    <div
      role="group"
      aria-label="Idioma / Language"
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
        const active = lang === opt.name;
        return (
          <button
            key={opt.name}
            type="button"
            onClick={() => setLang(opt.name)}
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
