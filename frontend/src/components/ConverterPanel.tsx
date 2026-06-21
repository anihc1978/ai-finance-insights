// src/components/ConverterPanel.tsx
// ---------------------------------------------------------------------------
// "Cambio" tab — Peru FX suite UI. Self-contained panel that:
//   (a) shows a 3-tier rate table (Oficial / Paralelo / Banco) from GET /rates
//   (b) a live two-way Soles<->Dolares calculator with a source toggle
//   (c) a history line chart of the official venta from GET /rates/history
//
// Money/labels are Spanish-first (this is a Peru-facing feature). All money is
// rendered with formatCurrency from ../lib/format. Visual tokens come from the
// shared theme (../lib/theme) so this matches the premium dashboard redesign.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { tokens } from "../lib/theme";

// --- API contracts (mirror backend app/services/fx.py) ---------------------
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
interface HistoryPoint {
  date: string; // YYYY-MM-DD
  compra: number;
  venta: number;
}
interface HistoryResponse {
  series: HistoryPoint[];
}

// Which tier's rates drive the calculator.
type Source = "oficial" | "paralelo" | "bank";

const SOURCE_LABELS: Record<Source, string> = {
  oficial: "Oficial",
  paralelo: "Paralelo",
  bank: "Banco",
};

// History range selector options (label -> days for /rates/history?days=N).
const RANGES: { label: string; days: number }[] = [
  { label: "1S", days: 7 },
  { label: "2S", days: 14 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
];

const AMOUNT_SHORTCUTS = [1, 10, 100, 1000];

// --- Small style helpers using the shared design tokens --------------------
const card: React.CSSProperties = {
  background: tokens.colors.surface,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.lg,
};

const muted: React.CSSProperties = { color: tokens.colors.textMuted };

const thStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 500,
  color: tokens.colors.textMuted,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 15,
  fontWeight: 400,
  textAlign: "right",
  borderTop: `1px solid ${tokens.colors.border}`,
};

const numInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 18,
  fontWeight: 500,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.input,
  background: tokens.colors.surface,
  color: tokens.colors.text,
  boxSizing: "border-box",
};

function fmtRate(v: number | null): string {
  // FX rates show 4 decimals (PEN per USD), e.g. 3.3841. Null -> em dash.
  return v == null ? "—" : v.toFixed(4);
}

function fmtFetchedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConverterPanel() {
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyDays, setHistoryDays] = useState<number>(30);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("oficial");
  // Calculator state. We track which field the user last edited so we only
  // recompute the *other* one (avoids fighting the user's cursor).
  const [soles, setSoles] = useState<string>("100");
  const [dolares, setDolares] = useState<string>("");

  // --- Load rates once ------------------------------------------------------
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

  // --- Load history; refetch whenever the range changes ---------------------
  useEffect(() => {
    let alive = true;
    setHistoryError(null);
    apiGet<HistoryResponse>(`/rates/history?days=${historyDays}`)
      .then((r) => {
        if (alive) setHistory(r.series ?? []);
      })
      .catch((e: unknown) => {
        if (alive) setHistoryError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [historyDays]);

  // The compra/venta for the currently selected source.
  const active: RatePair | null = rates ? rates[source] : null;

  // --- Calculator math ------------------------------------------------------
  // CRITICAL DIRECTION (do NOT invert):
  //   USD -> PEN  multiplies the dollar amount by the source COMPRA
  //   PEN -> USD  divides the soles amount by the source VENTA
  function recomputeFromSoles(value: string, pair: RatePair | null) {
    setSoles(value);
    const n = parseFloat(value);
    if (!pair || pair.venta == null || value.trim() === "" || Number.isNaN(n)) {
      setDolares("");
      return;
    }
    // PEN -> USD: divide soles by VENTA.
    setDolares((n / pair.venta).toFixed(2));
  }

  function recomputeFromDolares(value: string, pair: RatePair | null) {
    setDolares(value);
    const n = parseFloat(value);
    if (!pair || pair.compra == null || value.trim() === "" || Number.isNaN(n)) {
      setSoles("");
      return;
    }
    // USD -> PEN: multiply dollars by COMPRA.
    setSoles((n * pair.compra).toFixed(2));
  }

  // When the source toggles, re-derive dolares from the current soles so the
  // two fields stay consistent with the newly selected rate.
  function changeSource(next: Source) {
    setSource(next);
    const pair = rates ? rates[next] : null;
    recomputeFromSoles(soles, pair);
  }

  // --- 3-tier rate table rows ----------------------------------------------
  const tableRows = useMemo(() => {
    if (!rates) return [];
    return [
      { key: "oficial", label: "Oficial (SUNAT/BCRP)", pair: rates.oficial },
      { key: "paralelo", label: "Paralelo (referencial)", pair: rates.paralelo },
      { key: "bank", label: "Banco", pair: rates.bank },
    ];
  }, [rates]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.lg }}>
      {/* ---------------------------------------------------------------- */}
      {/* (a) RATE TABLE                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section style={card}>
        <h3 style={{ margin: `0 0 ${tokens.spacing.md}px`, fontWeight: 500 }}>
          Tipo de cambio
        </h3>

        {ratesError && (
          <p style={muted}>No se pudieron cargar los tipos de cambio.</p>
        )}

        {!rates && !ratesError && <p style={muted}>Cargando tipos de cambio…</p>}

        {rates && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Fuente</th>
                  <th style={thStyle}>Compra</th>
                  <th style={thStyle}>Venta</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.key}>
                    <td style={{ ...tdStyle, textAlign: "left", fontWeight: 500 }}>
                      {row.label}
                    </td>
                    <td style={tdStyle}>{fmtRate(row.pair.compra)}</td>
                    <td style={tdStyle}>{fmtRate(row.pair.venta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p style={{ ...muted, fontSize: 13, marginTop: tokens.spacing.md }}>
              Actualizado: {fmtFetchedAt(rates.fetched_at)}
              {rates.stale ? " (datos en caché)" : ""}
            </p>
            <p style={{ ...muted, fontSize: 12, marginTop: 4 }}>
              El paralelo es referencial y no constituye oferta.
            </p>
          </>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* (b) CALCULATOR                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section style={card}>
        <h3 style={{ margin: `0 0 ${tokens.spacing.md}px`, fontWeight: 500 }}>
          Calculadora
        </h3>

        {/* source toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: tokens.spacing.md }}>
          {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => {
            const selected = s === source;
            return (
              <button
                key={s}
                type="button"
                onClick={() => changeSource(s)}
                style={{
                  padding: "6px 14px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  borderRadius: tokens.radii.pill,
                  border: `1px solid ${
                    selected ? tokens.colors.accent : tokens.colors.border
                  }`,
                  background: selected ? tokens.colors.accent : tokens.colors.surface,
                  color: selected ? "#ffffff" : tokens.colors.text,
                }}
              >
                {SOURCE_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* two inputs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: tokens.spacing.md,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...muted, fontSize: 13 }}>Soles (S/)</span>
            <input
              type="number"
              inputMode="decimal"
              value={soles}
              onChange={(e) => recomputeFromSoles(e.target.value, active)}
              style={numInput}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...muted, fontSize: 13 }}>Dólares (US$)</span>
            <input
              type="number"
              inputMode="decimal"
              value={dolares}
              onChange={(e) => recomputeFromDolares(e.target.value, active)}
              style={numInput}
            />
          </label>
        </div>

        {/* amount shortcuts (apply to the Dólares field) */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: tokens.spacing.md,
            flexWrap: "wrap",
          }}
        >
          <span style={{ ...muted, fontSize: 13, alignSelf: "center" }}>US$</span>
          {AMOUNT_SHORTCUTS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => recomputeFromDolares(String(amt), active)}
              style={{
                padding: "6px 12px",
                fontSize: 14,
                cursor: "pointer",
                borderRadius: tokens.radii.pill,
                border: `1px solid ${tokens.colors.border}`,
                background: tokens.colors.surface,
                color: tokens.colors.text,
              }}
            >
              {amt}
            </button>
          ))}
        </div>

        {/* live readout using the app's currency formatter */}
        {active && active.compra != null && active.venta != null && (
          <p style={{ ...muted, fontSize: 13, marginTop: tokens.spacing.md }}>
            {formatCurrency(parseFloat(soles) || 0, "PEN")} ≈{" "}
            {formatCurrency(parseFloat(dolares) || 0, "USD")} · {SOURCE_LABELS[source]}{" "}
            (compra {fmtRate(active.compra)} / venta {fmtRate(active.venta)})
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* (c) HISTORY CHART                                                */}
      {/* ---------------------------------------------------------------- */}
      <section style={card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: tokens.spacing.md,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h3 style={{ margin: 0, fontWeight: 500 }}>Histórico (venta oficial)</h3>
          <div style={{ display: "flex", gap: 6 }}>
            {RANGES.map((r) => {
              const selected = r.days === historyDays;
              return (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setHistoryDays(r.days)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    borderRadius: tokens.radii.pill,
                    border: `1px solid ${
                      selected ? tokens.colors.accent : tokens.colors.border
                    }`,
                    background: selected ? tokens.colors.accent : tokens.colors.surface,
                    color: selected ? "#ffffff" : tokens.colors.text,
                  }}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>

        {historyError && (
          <p style={muted}>No se pudo cargar el histórico.</p>
        )}

        {!historyError && history.length === 0 && (
          <p style={muted}>Sin datos para este período.</p>
        )}

        {history.length > 0 && (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history}
                margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={56}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => v.toFixed(3)}
                />
                <Tooltip formatter={(value: number) => value.toFixed(4)} />
                <Line
                  type="monotone"
                  dataKey="venta"
                  stroke={tokens.colors.accent}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* footer disclaimer */}
      <p style={{ ...muted, fontSize: 12 }}>
        Tipo de cambio referencial, no constituye oferta. Fuente: BCRP/SUNAT y
        cuantoestaeldolar.pe
      </p>
    </div>
  );
}
