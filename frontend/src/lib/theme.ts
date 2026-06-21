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
    // Single accent.
    accent: "#1D9E75",
    // Text.
    text: "#1A1A19", // charcoal primary
    textMuted: "#6B6B68", // muted secondary
    // Surfaces.
    cardBg: "#FFFFFF",
    surface: "#F6F6F4", // soft surface for KPI cards
    border: "#E6E6E2", // 1px hairline
    // Trend chips.
    up: "#1D9E75",
    down: "#D85A30",
    flat: "#888780",
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
