// src/components/AnalyticsPanel.tsx
// ---------------------------------------------------------------------------
// "Análisis" — the detailed, scrollable charts page that lives behind its own
// menu tab so the everyday overview can stay simple. Each chart sits in its own
// titled card (Spanish headings) and is wrapped in recharts' ResponsiveContainer
// so it fits a phone. This component is self-contained: it does its own fetching
// of the existing endpoints (/insights, /transactions, /rates/history, /afp) and
// reuses the shared helpers (categoryLabel, formatCurrency, SOURCE_CHIPS,
// tokens.categoryColors). No new endpoints are invented.
//
// Every chart degrades gracefully: a "Cargando…" state while loading, a friendly
// Spanish empty state when there's no data, and never crashes on missing fields.
// All themeable colours come from the shared tokens (light/dark both work); the
// only concrete hexes are the intentional per-category palette and the brand
// source colours.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "../lib/api";
import {
  categoryLabel,
  formatCurrency,
  formatMonthLabel,
  type Currency,
} from "../lib/format";
import { tokens } from "../lib/theme";
import { SOURCE_CHIPS } from "./SourceBadge";

// --- Endpoint contracts (mirror the shapes the rest of the app already uses) ---

// GET /insights — the slice this panel needs.
interface Insights {
  byCategory: { category: string; amount: number }[];
  monthOverMonth: { month: string; spend: number }[];
  forecastNextMonth: number;
}

// GET /transactions — income-by-source is derived from these rows.
type TxnCurrency = "PEN" | "USD";
interface Transaction {
  amount: number;
  source: string | null;
  currency: TxnCurrency;
}

// GET /rates/history — official compra/venta series.
interface HistoryPoint {
  date: string; // YYYY-MM-DD
  compra: number;
  venta: number;
}
interface HistoryResponse {
  series: HistoryPoint[];
}

// GET /afp — dated balance records (same shape AfpPanel consumes).
interface AfpRecord {
  as_of: string; // YYYY-MM-DD
  balance: number;
}

// The display currency is fixed to soles across the app (see Dashboard).
const CURRENCY: Currency = "PEN";

// --- Shared card chrome, matching the other panels --------------------------
const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
};

const titleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: tokens.spacing.sm,
  fontSize: 15,
  fontWeight: 500,
  color: tokens.colors.text,
};

const mutedTextStyle: React.CSSProperties = {
  color: tokens.colors.textMuted,
  fontSize: 13,
  margin: 0,
};

// Small reusable card wrapper so every chart shares the same loading/empty
// scaffolding. `ready` decides whether to show the chart or the empty/loading
// note; `loading` distinguishes "still fetching" from "loaded but no data".
function ChartCard({
  title,
  loading,
  ready,
  emptyText,
  children,
}: {
  title: string;
  loading: boolean;
  ready: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <h3 style={titleStyle}>{title}</h3>
      {loading ? (
        <p style={mutedTextStyle}>Cargando…</p>
      ) : ready ? (
        children
      ) : (
        <p style={mutedTextStyle}>{emptyText}</p>
      )}
    </section>
  );
}

// Look up a per-category colour. Backend category keys are capitalized
// ("Groceries"), but tokens.categoryColors keys are lowercase ("groceries"),
// so we lowercase before the lookup and fall back to the neutral "other".
function categoryColor(category: string): string {
  return (
    tokens.categoryColors[category.toLowerCase()] ?? tokens.categoryColors.other
  );
}

export function AnalyticsPanel() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const [txns, setTxns] = useState<Transaction[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(true);

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [afp, setAfp] = useState<AfpRecord[]>([]);
  const [afpLoading, setAfpLoading] = useState(true);

  // Each fetch is independent and tolerant: a failure (e.g. /insights 404 when
  // there are no transactions yet) just leaves that chart in its empty state.
  useEffect(() => {
    let alive = true;

    apiGet<Insights>("/insights")
      .then((d) => alive && setInsights(d))
      .catch(() => alive && setInsights(null))
      .finally(() => alive && setInsightsLoading(false));

    apiGet<{ transactions: Transaction[] }>("/transactions")
      .then((d) => alive && setTxns(d.transactions ?? []))
      .catch(() => alive && setTxns([]))
      .finally(() => alive && setTxnsLoading(false));

    apiGet<HistoryResponse>("/rates/history?days=90")
      .then((d) => alive && setHistory(d.series ?? []))
      .catch(() => alive && setHistory([]))
      .finally(() => alive && setHistoryLoading(false));

    apiGet<{ records: AfpRecord[] }>("/afp")
      .then((d) => alive && setAfp(d.records ?? []))
      .catch(() => alive && setAfp([]))
      .finally(() => alive && setAfpLoading(false));

    return () => {
      alive = false;
    };
  }, []);

  // (1) Gasto por categoría — horizontal bar, Spanish labels, per-category colour.
  const categoryData = (insights?.byCategory ?? [])
    .filter((d) => d.amount > 0)
    .map((d) => ({
      category: d.category,
      amount: d.amount,
      label: categoryLabel(d.category),
    }))
    .sort((a, b) => b.amount - a.amount);

  // (2) Tendencia de gasto — historical months + a distinct projected point for
  // the forecast. `projected` carries only the bridge (last actual → forecast)
  // so it renders as a separate dashed segment/point without doubling the line.
  const trendData = (() => {
    const base = (insights?.monthOverMonth ?? []).map((d) => ({
      month: d.month,
      label: formatMonthLabel(d.month),
      spend: d.spend,
      projected: null as number | null,
    }));
    if (base.length === 0) return base;
    const forecast = insights?.forecastNextMonth;
    if (forecast == null || !Number.isFinite(forecast)) return base;
    // Anchor the projected segment to the last real point so the dashed line
    // connects continuously, then add the forecast month itself.
    const last = base[base.length - 1];
    last.projected = last.spend;
    base.push({
      month: "forecast",
      label: "Proyección",
      spend: null as unknown as number,
      projected: forecast,
    });
    return base;
  })();
  const hasTrend = (insights?.monthOverMonth ?? []).length > 0;

  // (3) Ingresos por fuente — group positive movements by source key (skip rows
  // with no source), label + colour via SOURCE_CHIPS. Sorted biggest-first.
  const incomeData = Object.entries(
    txns
      .filter((t) => Number(t.amount) > 0 && t.source && SOURCE_CHIPS[t.source])
      .reduce<Record<string, number>>((acc, t) => {
        const key = t.source as string;
        acc[key] = (acc[key] ?? 0) + Number(t.amount);
        return acc;
      }, {}),
  )
    .map(([key, amount]) => ({
      key,
      amount,
      label: SOURCE_CHIPS[key].label,
      color: SOURCE_CHIPS[key].color,
    }))
    .sort((a, b) => b.amount - a.amount);

  // (4) Tipo de cambio — official venta over time.
  const fxData = history.map((p) => ({ date: p.date, venta: p.venta }));

  // (5) AFP — balance over time (needs ≥ 2 dated points to draw a line).
  const afpData = [...afp]
    .filter((r) => r.as_of && Number.isFinite(Number(r.balance)))
    .sort((a, b) => a.as_of.localeCompare(b.as_of))
    .map((r) => ({ as_of: r.as_of, balance: Number(r.balance) }));

  const wrap: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacing.md,
  };
  const chartBox: React.CSSProperties = { width: "100%", height: 280 };

  return (
    <div style={wrap}>
      {/* Intro: this is the "detalle de todo" page; keep the overview simple. */}
      <p style={{ ...mutedTextStyle, fontSize: 14 }}>
        Aquí ves todo en detalle: tus gráficos de gastos, ingresos, tipo de
        cambio y AFP. El resumen se queda simple — esto es para cuando quieres
        profundizar.
      </p>

      {/* (1) Gasto por categoría */}
      <ChartCard
        title="Gasto por categoría"
        loading={insightsLoading}
        ready={categoryData.length > 0}
        emptyText="No hay gastos para mostrar este mes."
      >
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={categoryData}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke={tokens.colors.border}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                tickFormatter={(v: number) => formatCurrency(v, CURRENCY)}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={96}
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value, CURRENCY)}
                cursor={{ fill: tokens.colors.surface }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {categoryData.map((d) => (
                  <Cell key={d.category} fill={categoryColor(d.category)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* (2) Tendencia de gasto mensual (con proyección) */}
      <ChartCard
        title="Tendencia de gasto mensual"
        loading={insightsLoading}
        ready={hasTrend}
        emptyText="Aún no hay suficiente historial."
      >
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trendData}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <defs>
                <linearGradient id="analyticsTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.colors.accent} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={tokens.colors.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={tokens.colors.border}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                width={80}
                tickFormatter={(v: number) => formatCurrency(v, CURRENCY)}
              />
              <Tooltip
                formatter={(value: number, name) => [
                  formatCurrency(value, CURRENCY),
                  name === "projected" ? "Proyección" : "Gasto",
                ]}
              />
              {/* Real history */}
              <Area
                type="monotone"
                dataKey="spend"
                name="spend"
                stroke={tokens.colors.accent}
                strokeWidth={2}
                fill="url(#analyticsTrendFill)"
                connectNulls
                dot={{ r: 3 }}
              />
              {/* Projected next month — distinct dashed segment + marker */}
              <Line
                type="monotone"
                dataKey="projected"
                name="projected"
                stroke={tokens.colors.accent}
                strokeWidth={2}
                strokeDasharray="5 4"
                connectNulls
                dot={{ r: 4, stroke: tokens.colors.accent, fill: tokens.colors.cardBg }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p style={{ ...mutedTextStyle, marginTop: tokens.spacing.sm }}>
          La línea punteada es la proyección del próximo mes.
        </p>
      </ChartCard>

      {/* (3) Ingresos por fuente */}
      <ChartCard
        title="Ingresos por fuente"
        loading={txnsLoading}
        ready={incomeData.length > 0}
        emptyText="Aún no hay ingresos con una fuente identificada."
      >
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={incomeData}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={tokens.colors.border}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                width={80}
                tickFormatter={(v: number) => formatCurrency(v, CURRENCY)}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value, CURRENCY)}
                cursor={{ fill: tokens.colors.surface }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {incomeData.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* (4) Tipo de cambio — historial */}
      <ChartCard
        title="Tipo de cambio — historial"
        loading={historyLoading}
        ready={fxData.length > 1}
        emptyText="Aún no hay historial de tipo de cambio."
      >
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={fxData}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={tokens.colors.border}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: tokens.colors.textMuted }}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                width={56}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              <Tooltip
                formatter={(value: number) => [value.toFixed(4), "Venta (S/ por US$)"]}
              />
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
        <p style={{ ...mutedTextStyle, marginTop: tokens.spacing.sm }}>
          Tipo de cambio oficial (venta), últimos 90 días.
        </p>
      </ChartCard>

      {/* (5) AFP — evolución del saldo */}
      <ChartCard
        title="AFP — evolución del saldo"
        loading={afpLoading}
        ready={afpData.length > 1}
        emptyText="Agrega al menos dos registros de AFP para ver la evolución de tu fondo."
      >
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={afpData}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={tokens.colors.border}
              />
              <XAxis
                dataKey="as_of"
                tick={{ fontSize: 11, fill: tokens.colors.textMuted }}
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                width={80}
                tickFormatter={(v: number) => formatCurrency(v, CURRENCY)}
              />
              <Tooltip formatter={(value: number) => formatCurrency(value, CURRENCY)} />
              <Line
                type="monotone"
                dataKey="balance"
                stroke={tokens.colors.accent}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
