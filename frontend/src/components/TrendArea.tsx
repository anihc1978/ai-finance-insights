// src/components/TrendArea.tsx
// ---------------------------------------------------------------------------
// An area chart of total spend per month over time. Presentational: typed
// data in, chart out. No fetching.
// ---------------------------------------------------------------------------
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatMonthLabel, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";

interface MonthSpend {
  month: string; // "YYYY-MM"
  spend: number;
}

interface TrendAreaProps {
  data: MonthSpend[];
  currency: Currency;
}

const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
};

export function TrendArea({ data, currency }: TrendAreaProps) {
  // Add a human-friendly axis label without mutating the contract data.
  const chartData = data.map((d) => ({ ...d, label: formatMonthLabel(d.month) }));

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 500, color: tokens.colors.text }}>
        Gasto en el tiempo
      </h3>
      {chartData.length > 0 ? (
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.colors.accent} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={tokens.colors.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tokens.colors.border} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: tokens.colors.textMuted }} />
              <YAxis
                tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                width={80}
                tickFormatter={(v: number) => formatCurrency(v, currency)}
              />
              <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
              <Area
                type="monotone"
                dataKey="spend"
                stroke={tokens.colors.accent}
                strokeWidth={2}
                fill="url(#trendAreaFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: tokens.colors.textMuted }}>Aún no hay suficiente historial.</p>
      )}
    </section>
  );
}
