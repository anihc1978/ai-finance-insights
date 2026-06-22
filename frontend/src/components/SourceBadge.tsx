// src/components/SourceBadge.tsx
// ---------------------------------------------------------------------------
// Brand-colored "source chips" that show where a transaction or income comes
// from — Peruvian banks, wallets (Yape/Plin) and AFPs. The backend returns a
// canonical source KEY (e.g. "yape", "bcp"); this module maps that key to a
// {label, color} and renders a small brand-colored pill. Presentational only.
// ---------------------------------------------------------------------------

interface SourceChip {
  label: string;
  color: string;
}

/** Canonical source key → display label + brand color. */
export const SOURCE_CHIPS: Record<string, SourceChip> = {
  yape: { label: "Yape", color: "#7A2A90" },
  plin: { label: "Plin", color: "#11B5A4" },
  bcp: { label: "BCP", color: "#00529B" },
  interbank: { label: "Interbank", color: "#00833E" },
  bbva: { label: "BBVA", color: "#004481" },
  scotiabank: { label: "Scotiabank", color: "#EC111A" },
  bn: { label: "BN", color: "#C8102E" },
  integra: { label: "Integra", color: "#E4002B" },
  prima: { label: "Prima", color: "#0033A0" },
  profuturo: { label: "Profuturo", color: "#F37021" },
  habitat: { label: "Habitat", color: "#66A726" },
};

/** Returns the display label for a source key, or null if unknown. */
export function sourceLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SOURCE_CHIPS[key]?.label ?? null;
}

interface SourceBadgeProps {
  source: string | null;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const chip = source ? SOURCE_CHIPS[source] : undefined;
  if (!chip) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.4,
        color: "#ffffff",
        background: chip.color,
        borderRadius: 999,
        padding: "1px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {chip.label}
    </span>
  );
}
