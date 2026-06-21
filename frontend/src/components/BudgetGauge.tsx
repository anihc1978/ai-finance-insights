// src/components/BudgetGauge.tsx
// ---------------------------------------------------------------------------
// A circular SVG progress gauge for budget usage. Draws a full-circle ring,
// filled to spent/limit (clamped 0..1). The fill is the accent teal while
// under budget and turns red once spending crosses 100%. The center shows the
// percentage plus "S/ spent de S/ limit". Pure inline SVG — no extra deps.
// Presentational: numbers in, gauge out. No fetching.
// ---------------------------------------------------------------------------
import { formatCurrency, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";

interface BudgetGaugeProps {
  spent: number;
  limit: number;
  currency: Currency;
}

// Geometry constants for the ring.
const SIZE = 160;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function BudgetGauge({ spent, limit, currency }: BudgetGaugeProps) {
  // Ratio of the limit used, clamped to 0..1 so the arc never overflows the ring.
  const ratio = limit > 0 ? Math.min(1, Math.max(0, spent / limit)) : 0;
  const over = limit > 0 && spent > limit;
  const fillColor = over ? tokens.colors.down : tokens.colors.accent;
  // The visible (used) portion of the dasharray; the rest stays as the track.
  const dash = ratio * CIRCUMFERENCE;
  const pctLabel = limit > 0 ? Math.round((spent / limit) * 100) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: tokens.spacing.sm,
      }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${pctLabel}% del presupuesto usado`}
      >
        {/* Rotate so the arc starts at 12 o'clock and fills clockwise. */}
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={tokens.colors.surface}
            strokeWidth={STROKE}
          />
          {/* Progress */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={fillColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
          />
        </g>
        {/* Center percentage */}
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 28, fontWeight: 600, fill: over ? tokens.colors.down : tokens.colors.text }}
        >
          {pctLabel}%
        </text>
        {/* Center spent / limit */}
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 11, fill: tokens.colors.textMuted }}
        >
          {formatCurrency(spent, currency)} de {formatCurrency(limit, currency)}
        </text>
      </svg>
    </div>
  );
}
