// src/components/InsightCard.tsx
// ---------------------------------------------------------------------------
// Renders Claude's plain-English narrative plus any anomaly/subscription
// flags. Premium restyle of the AI-insights panel. Presentational only.
// ---------------------------------------------------------------------------
import { tokens } from "../lib/theme";

interface InsightCardProps {
  narrative: string;
  flags: string[];
}

const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
};

export function InsightCard({ narrative, flags }: InsightCardProps) {
  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 500, color: tokens.colors.text }}>
        AI insights
      </h3>

      {narrative ? (
        <p style={{ whiteSpace: "pre-line", lineHeight: 1.5, color: tokens.colors.text }}>
          {narrative}
        </p>
      ) : (
        <p style={{ color: tokens.colors.textMuted }}>No narrative yet.</p>
      )}

      {flags.length > 0 && (
        <div style={{ marginTop: tokens.spacing.md }}>
          <h4
            style={{
              marginBottom: tokens.spacing.sm,
              fontSize: 13,
              fontWeight: 500,
              textTransform: "uppercase",
              color: tokens.colors.textMuted,
            }}
          >
            Flags
          </h4>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {flags.map((flag, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: tokens.spacing.sm,
                  alignItems: "flex-start",
                  marginBottom: tokens.spacing.sm,
                  padding: tokens.spacing.sm,
                  background: tokens.colors.surface,
                  border: `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radii.card,
                  color: tokens.colors.text,
                  fontSize: 14,
                }}
              >
                <span style={{ color: tokens.colors.down }}>•</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
