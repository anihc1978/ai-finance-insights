// src/components/KpiCard.tsx
// ---------------------------------------------------------------------------
// A single KPI metric card: muted label, big number, optional trend chip.
// Presentational only — caller passes already-formatted strings.
// ---------------------------------------------------------------------------
import { tokens } from "../lib/theme";

interface KpiCardProps {
  label: string;
  value: string;
  trend?: { dir: "up" | "down" | "flat"; text: string };
}

const TREND_COLOR: Record<"up" | "down" | "flat", string> = {
  up: tokens.colors.up,
  down: tokens.colors.down,
  flat: tokens.colors.flat,
};

const TREND_ARROW: Record<"up" | "down" | "flat", string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

export function KpiCard({ label, value, trend }: KpiCardProps) {
  return (
    <div
      style={{
        background: tokens.colors.surface,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.card,
        padding: tokens.spacing.md,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacing.sm,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 400, color: tokens.colors.textMuted }}>
        {label}
      </span>
      <span style={{ fontSize: 24, fontWeight: 500, color: tokens.colors.text }}>
        {value}
      </span>
      {trend && (
        <span
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            fontWeight: 500,
            color: TREND_COLOR[trend.dir],
            background: tokens.colors.cardBg,
            border: `1px solid ${tokens.colors.border}`,
            borderRadius: tokens.radii.chip,
            padding: "2px 8px",
          }}
        >
          {TREND_ARROW[trend.dir]} {trend.text}
        </span>
      )}
    </div>
  );
}
