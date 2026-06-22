// src/components/SubscriptionsPanel.tsx
// ---------------------------------------------------------------------------
// Recurring-charges dashboard (GET /subscriptions): the monthly subscription
// total + a list of each detected subscription with its next estimated charge.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { formatCurrency, categoryLabel } from "../lib/format";
import { tokens } from "../lib/theme";

interface Subscription {
  name: string;
  amount: number;
  occurrences: number;
  last_date: string;
  next_estimated: string;
  category: string | null;
}
interface SubsResponse {
  subscriptions: Subscription[];
  monthly_total: number;
}

export function SubscriptionsPanel() {
  const [data, setData] = useState<SubsResponse | null>(null);

  useEffect(() => {
    apiGet<SubsResponse>("/subscriptions")
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <p style={{ color: tokens.colors.textMuted }}>Cargando…</p>;
  if (data.subscriptions.length === 0)
    return (
      <p style={{ color: tokens.colors.textMuted }}>
        No detectamos suscripciones recurrentes todavía. Importa o agrega más movimientos.
      </p>
    );

  return (
    <div>
      <div
        style={{
          background: tokens.colors.surface,
          borderRadius: tokens.radii.card,
          padding: "1rem 1.25rem",
          marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: tokens.colors.textMuted }}>
          Pagas al mes en suscripciones
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 28, fontWeight: 500 }}>
          {formatCurrency(data.monthly_total, "PEN")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.subscriptions.map((s) => (
          <div
            key={s.name + s.last_date}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: tokens.colors.cardBg,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.card,
              padding: "10px 14px",
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 500 }}>{s.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: tokens.colors.textMuted }}>
                {categoryLabel(s.category)} · próximo cargo ~{s.next_estimated}
              </p>
            </div>
            <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
              {formatCurrency(s.amount, "PEN")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
