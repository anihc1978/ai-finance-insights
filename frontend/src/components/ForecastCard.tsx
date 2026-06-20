// src/components/ForecastCard.tsx
// ---------------------------------------------------------------------------
// A prominent card showing the pure-Python projection of next month's spend.
// Presentational only: one number in, one nicely-formatted card out.
// ---------------------------------------------------------------------------
import { formatCurrency } from "../lib/format";

interface ForecastCardProps {
  value: number;
}

export function ForecastCard({ value }: ForecastCardProps) {
  return (
    <section
      style={{
        marginTop: 24,
        padding: 20,
        borderRadius: 8,
        background: "#0ea5e9",
        color: "white",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, textTransform: "uppercase", opacity: 0.9 }}>
        Projected next-month spend
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 32, fontWeight: 700 }}>
        {formatCurrency(value)}
      </p>
    </section>
  );
}
