// src/components/WeeklyRecap.tsx
// ---------------------------------------------------------------------------
// "Esta semana" card: the latest 7-day spend + a short AI recap (GET /recap/weekly).
// Hidden gracefully when there's nothing to show.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { formatCurrency, categoryLabel } from "../lib/format";
import { tokens } from "../lib/theme";

interface Recap {
  start: string | null;
  end: string | null;
  total: number;
  byCategory: { category: string; amount: number }[];
  narrative: string;
}

export function WeeklyRecap() {
  const [recap, setRecap] = useState<Recap | null>(null);

  useEffect(() => {
    apiGet<Recap>("/recap/weekly")
      .then(setRecap)
      .catch(() => setRecap(null));
  }, []);

  if (!recap || recap.total <= 0) return null;

  return (
    <div
      style={{
        background: tokens.colors.cardBg,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.card,
        padding: "1rem 1.25rem",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: tokens.colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        Esta semana
      </p>
      <p style={{ margin: "4px 0 8px", fontSize: 24, fontWeight: 500 }}>
        {formatCurrency(recap.total, "PEN")}
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        {recap.byCategory.slice(0, 3).map((c) => (
          <span key={c.category} style={{ fontSize: 13, color: tokens.colors.textMuted }}>
            {categoryLabel(c.category)} {formatCurrency(c.amount, "PEN")}
          </span>
        ))}
      </div>
      {recap.narrative && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: tokens.colors.text }}>
          {recap.narrative}
        </p>
      )}
    </div>
  );
}
