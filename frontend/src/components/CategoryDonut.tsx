// src/components/CategoryDonut.tsx
// ---------------------------------------------------------------------------
// A donut chart of spend per category, coloured from the design-spec palette.
// Presentational: typed data in, chart out. No fetching.
// ---------------------------------------------------------------------------
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { categoryLabel, formatCurrency, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";
import { useLang } from "../lib/i18n";

const T = {
  es: { title: "Gasto por categoría", empty: "No hay gastos para mostrar este mes." },
  en: { title: "Spending by category", empty: "No spending to show this month." },
} as const;

interface CategorySpend {
  category: string;
  amount: number;
}

interface CategoryDonutProps {
  data: CategorySpend[];
  currency: Currency;
}

const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
};

function colorFor(category: string): string {
  // Category keys come capitalized (e.g. "Groceries"); the palette is keyed
  // lowercase, so normalize before lookup (else every slice falls back to grey).
  return tokens.categoryColors[category.toLowerCase()] ?? tokens.categoryColors.other;
}

export function CategoryDonut({ data, currency }: CategoryDonutProps) {
  const lang = useLang();
  const t = T[lang];
  // Keep the raw `category` key (drives colours); add a label for the
  // legend/tooltip without touching the contract data.
  const slices = data
    .filter((d) => d.amount > 0)
    .map((d) => ({ ...d, label: categoryLabel(d.category, lang) }));

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 500, color: tokens.colors.text }}>
        {t.title}
      </h3>
      {slices.length > 0 ? (
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="amount"
                nameKey="label"
                innerRadius={64}
                outerRadius={100}
                paddingAngle={2}
                stroke="none"
              >
                {slices.map((d) => (
                  <Cell key={d.category} fill={colorFor(d.category)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, color: tokens.colors.textMuted }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p style={{ color: tokens.colors.textMuted }}>{t.empty}</p>
      )}
    </section>
  );
}
