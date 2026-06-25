// src/components/InsightCard.tsx
// ---------------------------------------------------------------------------
// Renders Claude's structured highlights ("Esto encontramos", Origin-style)
// plus the plain-English narrative and any anomaly/subscription flags.
// Premium restyle of the AI-insights panel. Presentational only.
// ---------------------------------------------------------------------------
import { tokens } from "../lib/theme";
import { useLang } from "../lib/i18n";

const T = {
  es: {
    title: "Análisis con IA",
    found: "Esto encontramos",
    none: "Aún no hay análisis.",
    alerts: "Alertas",
  },
  en: {
    title: "AI analysis",
    found: "Here is what we found",
    none: "No analysis yet.",
    alerts: "Alerts",
  },
} as const;

interface Highlight {
  title: string;
  detail: string;
}

interface InsightCardProps {
  narrative: string;
  flags: string[];
  highlights: Highlight[];
}

const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
};

export function InsightCard({ narrative, flags, highlights }: InsightCardProps) {
  const lang = useLang();
  const t = T[lang];
  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 500, color: tokens.colors.text }}>
        {t.title}
      </h3>

      {highlights.length > 0 && (
        <div style={{ marginBottom: tokens.spacing.md }}>
          <h4
            style={{
              marginTop: 0,
              marginBottom: tokens.spacing.sm,
              fontSize: 13,
              fontWeight: 500,
              textTransform: "uppercase",
              color: tokens.colors.textMuted,
            }}
          >
            {t.found}
          </h4>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {highlights.map((h, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: tokens.spacing.sm,
                  alignItems: "flex-start",
                  marginBottom: tokens.spacing.sm,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 8,
                    height: 8,
                    marginTop: 6,
                    borderRadius: "50%",
                    background: tokens.colors.accent,
                  }}
                />
                <span>
                  <span
                    style={{
                      display: "block",
                      fontWeight: 500,
                      fontSize: 14,
                      color: tokens.colors.text,
                    }}
                  >
                    {h.title}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: tokens.colors.textMuted,
                    }}
                  >
                    {h.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative ? (
        <p
          style={{
            whiteSpace: "pre-line",
            lineHeight: 1.5,
            fontSize: highlights.length > 0 ? 13 : 14,
            color: highlights.length > 0 ? tokens.colors.textMuted : tokens.colors.text,
            marginTop: 0,
          }}
        >
          {narrative}
        </p>
      ) : (
        highlights.length === 0 && (
          <p style={{ color: tokens.colors.textMuted }}>{t.none}</p>
        )
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
            {t.alerts}
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
