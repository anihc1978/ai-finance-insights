// src/components/MonthOverMonth.tsx
// ---------------------------------------------------------------------------
// A bar chart of total spend per month, oldest -> newest, so the user can see
// the trend over time. Presentational: typed data in, chart out.
// ---------------------------------------------------------------------------
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatMonthLabel, type Currency } from "../lib/format";

// Matches the /insights contract's "monthOverMonth" row shape.
interface MonthSpend {
  month: string; // "YYYY-MM"
  spend: number;
}

interface MonthOverMonthProps {
  data: MonthSpend[];
  currency?: Currency;
}

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 8,
};

export function MonthOverMonth({ data, currency }: MonthOverMonthProps) {
  // Add a human-friendly axis label without mutating the contract data.
  const chartData = data.map((d) => ({ ...d, label: formatMonthLabel(d.month) }));

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Spending month over month</h3>
      {chartData.length > 0 ? (
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                width={80}
                tickFormatter={(v: number) => formatCurrency(v, currency)}
              />
              <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
              <Bar dataKey="spend" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: "#666" }}>Not enough history yet.</p>
      )}
    </section>
  );
}
