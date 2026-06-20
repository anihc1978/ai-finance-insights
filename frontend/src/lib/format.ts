// src/lib/format.ts
// ---------------------------------------------------------------------------
// Small formatting helpers shared by the dashboard charts/cards.
// ---------------------------------------------------------------------------

// Intl.NumberFormat is the right tool for currency: it handles thousands
// separators, the dollar sign, and (importantly) negatives — e.g. -1234.5
// becomes "-$1,234.50" — so we never hand-roll string math.
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Format a number as USD, e.g. 1234.56 -> "$1,234.56", -5 -> "-$5.00". */
export function formatCurrency(n: number): string {
  return currency.format(n);
}

/** Turn a "YYYY-MM" period into a friendly label, e.g. "2026-06" -> "Jun 2026". */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month; // fall back to the raw string if it's malformed
  return new Date(year, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
