// src/components/FxWidget.tsx
// ---------------------------------------------------------------------------
// Compact, mobile-first "Tipo de cambio" widget for the overview dashboard.
//
// Replaces the old full-page "cambio" tab (ConverterPanel) for everyday phone
// use. A single small card that shows:
//   - today's rate (Oficial + Paralelo, compra/venta, compact)
//   - a tiny two-way Soles<->Dólares converter (amount in -> value out at the
//     relevant rate; a swap button flips direction)
//   - an optional "ver detalle" expand (banco row + actualizado), not required.
//
// Reuses the SAME GET /rates contract + compra/venta direction as
// ConverterPanel (../components/ConverterPanel):
//   PEN -> USD divides by VENTA · USD -> PEN multiplies by COMPRA.
//
// Spanish-first (Peru), "tú" form. All colours/spacing from the shared tokens
// so light/dark both work. No history chart (too heavy for the phone).
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { tokens } from "../lib/theme";
import { useLang, type Lang } from "../lib/i18n";

// Per-component strings. Spanish values are the EXISTING copy byte-for-byte;
// English is added alongside. Brand-ish "Banco" and currency symbols (S/, US$)
// are kept; only the words around them translate.
const T = {
  es: {
    title: "Tipo de cambio",
    oficial: "Oficial",
    paralelo: "Paralelo",
    banco: "Banco",
    ratesError: "No se pudo cargar el tipo de cambio.",
    loading: "Cargando…",
    compra: "Compra",
    venta: "Venta",
    ventaLower: "venta",
    compraLower: "compra",
    dolares: "Dólares (US$)",
    soles: "Soles (S/)",
    swap: "Cambiar de moneda",
    hideDetail: "Ocultar detalle",
    seeDetail: "Ver detalle",
    updated: "Actualizado",
    cached: " (en caché)",
    referencial: "El paralelo es referencial y no constituye oferta.",
    hide: "Ocultar",
  },
  en: {
    title: "Exchange rate",
    oficial: "Official",
    paralelo: "Parallel",
    banco: "Bank",
    ratesError: "Couldn't load the exchange rate.",
    loading: "Loading…",
    compra: "Buy",
    venta: "Sell",
    ventaLower: "sell",
    compraLower: "buy",
    dolares: "Dollars (US$)",
    soles: "Soles (S/)",
    swap: "Switch currency",
    hideDetail: "Hide detail",
    seeDetail: "See detail",
    updated: "Updated",
    cached: " (cached)",
    referencial: "The parallel rate is indicative and not an offer.",
    hide: "Hide",
  },
} as const;

// --- API contract (mirror backend app/services/fx.py, same as ConverterPanel) ---
interface RatePair {
  compra: number | null;
  venta: number | null;
}
interface RatesResponse {
  oficial: RatePair & { date: string };
  paralelo: RatePair & { referencial: boolean };
  bank: RatePair;
  fetched_at: string; // ISO8601
  stale: boolean;
}

// Which tier drives the converter. The widget defaults to "oficial" but the
// person can tap to use the paralelo (street) rate, which is what most people
// actually pay in Peru.
type Source = "oficial" | "paralelo";

// Converter direction.
type Dir = "PEN_USD" | "USD_PEN";

// Display labels for the two converter sources, language-aware. The keys
// ("oficial"/"paralelo") stay constant — only the rendered text translates.
function sourceLabel(s: Source, t: (typeof T)[Lang]): string {
  return s === "oficial" ? t.oficial : t.paralelo;
}

function fmtRate(v: number | null): string {
  // FX rates show 4 decimals (PEN per USD), e.g. 3.3841. Null -> em dash.
  return v == null ? "—" : v.toFixed(4);
}

function fmtFetchedAt(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === "en" ? "en-US" : "es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Small style helpers using the shared design tokens --------------------
const card: React.CSSProperties = {
  background: tokens.colors.surface,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
  display: "flex",
  flexDirection: "column",
  gap: tokens.spacing.sm,
};

const muted: React.CSSProperties = { color: tokens.colors.textMuted };

const numInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 17,
  fontWeight: 500,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.input,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  boxSizing: "border-box",
};

// Phone-width check — the FX widget is tall, so on mobile it collapses to a
// one-line rate summary you tap to expand.
function useIsMobile(): boolean {
  const [m, setM] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const on = () => setM(mql.matches);
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return m;
}

export function FxWidget() {
  const lang = useLang();
  const t = T[lang];
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("oficial");
  const [dir, setDir] = useState<Dir>("USD_PEN"); // default: ¿cuántos soles son X dólares?
  const [amount, setAmount] = useState<string>("100");
  const [showDetail, setShowDetail] = useState(false);
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // --- Load rates once (same fetch as ConverterPanel) -----------------------
  useEffect(() => {
    let alive = true;
    apiGet<RatesResponse>("/rates")
      .then((r) => {
        if (alive) setRates(r);
      })
      .catch((e: unknown) => {
        if (alive) setRatesError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const active: RatePair | null = rates ? rates[source] : null;

  // --- Converter math -------------------------------------------------------
  // CRITICAL DIRECTION (matches ConverterPanel, do NOT invert):
  //   USD -> PEN  multiplies dollars by the source COMPRA
  //   PEN -> USD  divides soles by the source VENTA
  const result = useMemo<number | null>(() => {
    const n = parseFloat(amount);
    if (!active || amount.trim() === "" || Number.isNaN(n)) return null;
    if (dir === "USD_PEN") {
      if (active.compra == null) return null;
      return n * active.compra; // dólares -> soles
    }
    if (active.venta == null) return null;
    return n / active.venta; // soles -> dólares
  }, [amount, active, dir]);

  const fromCur = dir === "USD_PEN" ? "USD" : "PEN";
  const toCur = dir === "USD_PEN" ? "PEN" : "USD";
  const fromLabel = dir === "USD_PEN" ? t.dolares : t.soles;
  const usedRate = dir === "USD_PEN" ? active?.compra : active?.venta;
  const usedRateLabel = dir === "USD_PEN" ? t.compraLower : t.ventaLower;

  function swap() {
    setDir((d) => (d === "USD_PEN" ? "PEN_USD" : "USD_PEN"));
  }

  return (
    <section style={card}>
      {isMobile && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: tokens.spacing.sm,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: tokens.colors.text,
            font: "inherit",
          }}
        >
          <span style={{ fontWeight: 500 }}>{t.title}</span>
          <span
            style={{
              fontWeight: 500,
              color: tokens.colors.accent,
              whiteSpace: "nowrap",
            }}
          >
            {active
              ? `${sourceLabel(source, t)} · ${t.ventaLower} ${fmtRate(active.venta)}`
              : "…"}{" "}
            ›
          </span>
        </button>
      ) : (
        <>
      {/* header: title + source toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: tokens.spacing.sm,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
          {t.title}
        </h3>
        <div style={{ display: "flex", gap: 6 }}>
          {(["oficial", "paralelo"] as Source[]).map((s) => {
            const selected = s === source;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  borderRadius: tokens.radii.pill,
                  border: `1px solid ${
                    selected ? tokens.colors.accent : tokens.colors.border
                  }`,
                  background: selected
                    ? tokens.colors.accent
                    : tokens.colors.surface,
                  color: selected ? "#ffffff" : tokens.colors.text,
                }}
              >
                {sourceLabel(s, t)}
              </button>
            );
          })}
        </div>
      </div>

      {ratesError && (
        <p style={{ ...muted, fontSize: 13, margin: 0 }}>
          {t.ratesError}
        </p>
      )}
      {!rates && !ratesError && (
        <p style={{ ...muted, fontSize: 13, margin: 0 }}>{t.loading}</p>
      )}

      {rates && (
        <>
          {/* compact compra/venta for the selected source */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: tokens.spacing.sm,
            }}
          >
            <div
              style={{
                background: tokens.colors.cardBg,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.input,
                padding: "8px 10px",
              }}
            >
              <div style={{ ...muted, fontSize: 11 }}>{t.compra}</div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>
                {fmtRate(active?.compra ?? null)}
              </div>
            </div>
            <div
              style={{
                background: tokens.colors.cardBg,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.input,
                padding: "8px 10px",
              }}
            >
              <div style={{ ...muted, fontSize: 11 }}>{t.venta}</div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>
                {fmtRate(active?.venta ?? null)}
              </div>
            </div>
          </div>

          {/* tiny converter */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: tokens.spacing.sm,
            }}
          >
            <label
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 0,
              }}
            >
              <span style={{ ...muted, fontSize: 12 }}>{fromLabel}</span>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={numInput}
              />
            </label>
            <button
              type="button"
              onClick={swap}
              aria-label={t.swap}
              title={t.swap}
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                fontSize: 16,
                cursor: "pointer",
                borderRadius: tokens.radii.input,
                border: `1px solid ${tokens.colors.border}`,
                background: tokens.colors.surface,
                color: tokens.colors.text,
              }}
            >
              ⇄
            </button>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                minWidth: 0,
              }}
            >
              <span style={{ ...muted, fontSize: 12 }}>
                {toCur === "PEN" ? t.soles : t.dolares}
              </span>
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: 17,
                  fontWeight: 600,
                  border: `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radii.input,
                  background: tokens.colors.cardBg,
                  color: tokens.colors.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {result == null ? "—" : formatCurrency(result, toCur)}
              </div>
            </div>
          </div>

          {/* one-line explainer of the conversion */}
          {result != null && usedRate != null && (
            <p style={{ ...muted, fontSize: 12, margin: 0 }}>
              {formatCurrency(parseFloat(amount) || 0, fromCur)} ={" "}
              {formatCurrency(result, toCur)} · {sourceLabel(source, t)} (
              {usedRateLabel} {fmtRate(usedRate)})
            </p>
          )}

          {/* optional detail expand */}
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            style={{
              alignSelf: "flex-start",
              padding: 0,
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              background: "transparent",
              color: tokens.colors.accent,
            }}
          >
            {showDetail ? t.hideDetail : t.seeDetail}
          </button>

          {showDetail && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                paddingTop: 4,
                borderTop: `1px solid ${tokens.colors.border}`,
              }}
            >
              {(
                [
                  { key: "oficial", label: t.oficial, pair: rates.oficial },
                  { key: "paralelo", label: t.paralelo, pair: rates.paralelo },
                  { key: "bank", label: t.banco, pair: rates.bank },
                ] as { key: string; label: string; pair: RatePair }[]
              ).map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{row.label}</span>
                  <span style={muted}>
                    {fmtRate(row.pair.compra)} / {fmtRate(row.pair.venta)}
                  </span>
                </div>
              ))}
              <p style={{ ...muted, fontSize: 11, margin: 0 }}>
                {t.updated}: {fmtFetchedAt(rates.fetched_at, lang)}
                {rates.stale ? t.cached : ""}
              </p>
              <p style={{ ...muted, fontSize: 11, margin: 0 }}>
                {t.referencial}
              </p>
            </div>
          )}
        </>
      )}
          {isMobile && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                marginTop: tokens.spacing.sm,
                background: "none",
                border: "none",
                color: tokens.colors.accent,
                cursor: "pointer",
                padding: 0,
                font: "inherit",
              }}
            >
              ▾ {t.hide}
            </button>
          )}
        </>
      )}
    </section>
  );
}
