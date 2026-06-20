// src/components/InsightsPanel.tsx
// ---------------------------------------------------------------------------
// Renders Claude's plain-English narrative, the totals (income/spend), and any
// anomaly/subscription flags it surfaced. Presentational only.
// ---------------------------------------------------------------------------
import { formatCurrency } from "../lib/format";

interface InsightsPanelProps {
  narrative: string;
  flags: string[];
  totalSpend: number;
  totalIncome: number;
}

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 8,
};

export function InsightsPanel({
  narrative,
  flags,
  totalSpend,
  totalIncome,
}: InsightsPanelProps) {
  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>AI insights</h3>

      {/* Totals row */}
      <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
        <span>
          Total income:{" "}
          <strong style={{ color: "green" }}>{formatCurrency(totalIncome)}</strong>
        </span>
        <span>
          Total spend:{" "}
          <strong style={{ color: "crimson" }}>{formatCurrency(totalSpend)}</strong>
        </span>
      </div>

      {narrative ? (
        <p style={{ whiteSpace: "pre-line", lineHeight: 1.5, color: "#333" }}>
          {narrative}
        </p>
      ) : (
        <p style={{ color: "#666" }}>No narrative yet.</p>
      )}

      {flags.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ marginBottom: 8, fontSize: 13, textTransform: "uppercase", color: "#888" }}>
            Flags
          </h4>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {flags.map((flag, i) => (
              <li key={i} style={{ marginBottom: 4, color: "#92400e" }}>
                ⚠️ {flag}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
