// src/components/AfpSummary.tsx
// ---------------------------------------------------------------------------
// Compact AFP (Peru private pension) summary for the phone-first dashboard.
// AFP used to be its own menu tab; now it lives inline as a small stat card
// showing the latest fund balance ("AFP · Saldo S/ X"). Tapping it opens a
// modal that renders the FULL existing AfpPanel, so scanning a statement and
// viewing/adding/deleting records still works — nothing is lost.
//
// This component only OWNS the summary card + the modal shell. It reuses
// AfpPanel as-is for the full experience. It does its own light fetch of
// GET /afp just to know the latest balance for the card; AfpPanel re-fetches
// the same endpoint when the modal opens. After the modal closes we refresh
// the card so a freshly-saved/deleted record is reflected. Spanish labels.
// ---------------------------------------------------------------------------
import { Fragment, useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import { formatCurrency, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";
import { AfpPanel } from "./AfpPanel";

interface AfpSummaryProps {
  currency: Currency;
}

// Minimal shape we need from GET /afp (mirrors AfpPanel's AfpRecord).
interface AfpRecord {
  id: string;
  as_of: string;
  balance: number;
  afp_name: string | null;
}

// Spanish month labels, locale-free so they never render in English.
const MESES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
function monthLabel(as_of: string): string {
  const parts = as_of.split("-");
  const idx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  return `${MESES[idx]}. ${parts[0]}`;
}

// Example "AFP Integra" monthly aporte + saldo (mirrors the full panel's sample)
// shown when there are no real records, so the card previews a month-by-month
// table instead of a big empty space below the total.
const EXAMPLE_MONTHS: { as_of: string; aporte: number; balance: number }[] = [
  { as_of: "2026-01-31", aporte: 430, balance: 12540 },
  { as_of: "2026-02-28", aporte: 430, balance: 13180 },
  { as_of: "2026-03-31", aporte: 430, balance: 13690 },
  { as_of: "2026-04-30", aporte: 430, balance: 14420 },
  { as_of: "2026-05-31", aporte: 430, balance: 15010 },
  { as_of: "2026-06-30", aporte: 430, balance: 15640 },
];

export function AfpSummary({ currency }: AfpSummaryProps) {
  const [latest, setLatest] = useState<AfpRecord | null>(null);
  const [records, setRecords] = useState<AfpRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  async function loadLatest() {
    try {
      // GET /afp returns records ordered by as_of asc, so the last is latest.
      const data = await apiGet<{ records: AfpRecord[] }>("/afp");
      setRecords(data.records);
      setLatest(data.records.length ? data.records[data.records.length - 1] : null);
    } catch {
      // A failed fetch just means we show the neutral "sin datos" state; the
      // full panel (which surfaces errors) is one tap away.
      setRecords([]);
      setLatest(null);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void loadLatest();
  }, []);

  // Refresh the card after the modal closes so it reflects any change made
  // inside the full panel (a new scan, a manual entry, a deletion).
  function handleClose() {
    setOpen(false);
    void loadLatest();
  }

  const hasData = latest != null;
  // When there are no real records, show the same "AFP Integra" example total
  // the full panel falls back to, tagged "ejemplo", instead of a bare empty
  // state — so the dashboard card isn't empty before the first real entry.
  const EXAMPLE_TOTAL = 15640;
  const showExample = loaded && !hasData;
  // Preview table below the total (Mes | Aporte | Saldo | Variación), last 3
  // months. Variación = saldo − saldo del mes anterior (computed over the full
  // series, then sliced). Aporte only exists in the example; real records don't
  // carry it, so it shows "—".
  const fullSeries: { as_of: string; aporte: number | null; balance: number }[] =
    hasData
      ? records.map((r) => ({ as_of: r.as_of, aporte: null, balance: r.balance }))
      : showExample
      ? EXAMPLE_MONTHS.map((r) => ({ ...r }))
      : [];
  const monthRows = fullSeries
    .map((r, i) => ({
      ...r,
      variacion: i > 0 ? r.balance - fullSeries[i - 1].balance : null,
    }))
    .slice(-3);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          // Full-width, card-styled, but a real button so it's obviously tappable.
          // Flex column + full height so it matches the Fx widget's height in the
          // 2-up row (the grid stretches both cells); content spreads top→bottom.
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          height: "100%",
          width: "100%",
          textAlign: "left",
          background: tokens.colors.cardBg,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.card,
          padding: tokens.spacing.md,
          cursor: "pointer",
          color: tokens.colors.text,
          font: "inherit",
        }}
        aria-label="Ver detalle de AFP"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: tokens.spacing.sm,
          }}
        >
          <span style={{ fontSize: 13, color: tokens.colors.textMuted }}>
            AFP
            {hasData && latest.afp_name
              ? ` · ${latest.afp_name}`
              : showExample
              ? " · Integra"
              : ""}
          </span>
          <span style={{ fontSize: 13, color: tokens.colors.accent }}>Ver →</span>
        </div>

        {loaded ? (
          <>
            {/* Total balance (real latest, or the Integra example). */}
            <div
              style={{
                marginTop: 4,
                display: "flex",
                alignItems: "baseline",
                gap: tokens.spacing.sm,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 600, color: tokens.colors.text }}>
                {formatCurrency(latest ? latest.balance : EXAMPLE_TOTAL, currency)}
              </span>
              {showExample && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: tokens.colors.accent,
                    background: tokens.colors.surface,
                    border: `1px solid ${tokens.colors.border}`,
                    borderRadius: tokens.radii.chip,
                    padding: "2px 8px",
                  }}
                >
                  ejemplo
                </span>
              )}
            </div>

            {/* Preview table (Mes | Aporte | Saldo | Variación) so the card
                isn't empty below the total. */}
            {monthRows.length > 0 && (
              <div
                style={{
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: `1px solid ${tokens.colors.border}`,
                  display: "grid",
                  gridTemplateColumns: "auto 1fr 1fr 1fr",
                  columnGap: tokens.spacing.sm,
                  rowGap: 4,
                  fontSize: 11,
                }}
              >
                <span style={{ color: tokens.colors.textMuted }}>Mes</span>
                <span style={{ color: tokens.colors.textMuted, textAlign: "right" }}>
                  Aporte
                </span>
                <span style={{ color: tokens.colors.textMuted, textAlign: "right" }}>
                  Saldo
                </span>
                <span style={{ color: tokens.colors.textMuted, textAlign: "right" }}>
                  Variación
                </span>
                {monthRows.map((r) => (
                  <Fragment key={r.as_of}>
                    <span style={{ color: tokens.colors.text }}>{monthLabel(r.as_of)}</span>
                    <span style={{ color: tokens.colors.textMuted, textAlign: "right" }}>
                      {r.aporte != null ? formatCurrency(r.aporte, currency) : "—"}
                    </span>
                    <span style={{ color: tokens.colors.text, textAlign: "right" }}>
                      {formatCurrency(r.balance, currency)}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        color:
                          r.variacion == null
                            ? tokens.colors.textMuted
                            : r.variacion >= 0
                            ? tokens.colors.up
                            : tokens.colors.down,
                      }}
                    >
                      {r.variacion == null
                        ? "—"
                        : `${r.variacion >= 0 ? "+" : "−"}${formatCurrency(
                            Math.abs(r.variacion),
                            currency,
                          )}`}
                    </span>
                  </Fragment>
                ))}
              </div>
            )}

            <div style={{ marginTop: 8, fontSize: 12, color: tokens.colors.textMuted }}>
              {latest
                ? `Saldo al ${latest.as_of}`
                : "Agrega tu AFP — escanea tu estado de cuenta."}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 4, fontSize: 13, color: tokens.colors.textMuted }}>
            Cargando…
          </div>
        )}
      </button>

      {/* Modal — reuses the full existing AfpPanel untouched. */}
      {open && (
        <div
          // Backdrop — clicking outside the card closes the modal.
          onClick={handleClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 1000,
            padding: tokens.spacing.md,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 640,
              margin: "auto",
              background: tokens.colors.cardBg,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.card,
              padding: tokens.spacing.lg,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: tokens.spacing.sm,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 500,
                  color: tokens.colors.text,
                }}
              >
                Mi AFP
              </h3>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                  color: tokens.colors.textMuted,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            <AfpPanel currency={currency} />
          </div>
        </div>
      )}
    </>
  );
}
