// src/components/SpendingByCategory.tsx
// ---------------------------------------------------------------------------
// A bar chart of how much was spent per category in the selected month.
// Pure presentational component: it takes typed data and draws it. No fetching.
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
import { formatCurrency, type Currency } from "../lib/format";

// The exact row shape the /insights contract gives us under "byCategory".
interface CategorySpend {
  category: string;
  amount: number;
}

interface SpendingByCategoryProps {
  data: CategorySpend[];
  currency?: Currency;
}

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 8,
};

export function SpendingByCategory({ data, currency }: SpendingByCategoryProps) {
  const hasData = data.length > 0 && data.some((d) => d.amount > 0);

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Spending by category</h3>
      {hasData ? (
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                width={80}
                tickFormatter={(v: number) => formatCurrency(v, currency)}
              />
              <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
              <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: "#666" }}>No spending to chart for this month.</p>
      )}
    </section>
  );
}
