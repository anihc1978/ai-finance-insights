// src/lib/theme.ts
// ---------------------------------------------------------------------------
// Design tokens for the premium dashboard redesign. One accent (deep teal),
// flat light cards with hairline borders, charcoal/muted text, two font
// weights. Every new presentational component reads its colours/spacing from
// here so the redesign stays visually consistent.
// ---------------------------------------------------------------------------

/** The category palette from the design spec (keys match the backend CATEGORIES). */
export const categoryColors: Record<string, string> = {
  housing: "#1D9E75",
  groceries: "#378ADD",
  dining: "#D85A30",
  transport: "#EF9F27",
  utilities: "#7F77DD",
  entertainment: "#D4537E",
  subscriptions: "#639922",
  other: "#888780",
};

export const tokens = {
  colors: {
    // All themeable colours read from CSS variables defined in index.css.
    // Light values live in :root; [data-theme="dark"] overrides them. This lets
    // the whole app re-theme at runtime with zero per-component edits.
    // Single accent.
    accent: "var(--c-accent)",
    // Text.
    text: "var(--c-text)", // charcoal primary
    textMuted: "var(--c-text-muted)", // muted secondary
    // Surfaces.
    cardBg: "var(--c-card)",
    surface: "var(--c-surface)", // soft surface for KPI cards
    border: "var(--c-border)", // 1px hairline
    // Trend chips.
    up: "var(--c-up)",
    down: "var(--c-down)",
    flat: "var(--c-flat)",
  },
  radii: {
    card: 12,
    chip: 999,
    input: 8,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  categoryColors,
} as const;

export type Tokens = typeof tokens;

// ---------------------------------------------------------------------------
// Theme system — light/dark, switchable at runtime via a data-attribute on
// <html>. The actual colour values live as CSS variables in index.css; here we
// only flip the attribute and remember the choice.
// ---------------------------------------------------------------------------

export type ThemeName = "light" | "dark";

const THEME_KEY = "fin_theme";

/** Apply a theme: set <html data-theme> and persist the choice. */
export function applyTheme(name: ThemeName): void {
  document.documentElement.dataset.theme = name;
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch {
    // localStorage may be unavailable (private mode); theme still applies.
  }
}

/** Read the theme currently applied to <html>, defaulting to "light". */
export function getCurrentTheme(): ThemeName {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Decide the initial theme: saved choice, else the OS preference. */
export function getInitialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore and fall back to system preference
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
