// src/lib/format.ts
// ---------------------------------------------------------------------------
// Small formatting helpers shared by the dashboard charts/cards.
// ---------------------------------------------------------------------------

/** The currencies the app can display money in (mirrors the backend's SUPPORTED_CURRENCIES). */
export type Currency = "USD" | "AUD" | "PEN";

// Each currency formats with its own locale so separators/symbol placement look
// native: USD en-US, AUD en-AU, PEN es-PE. Intl.NumberFormat also handles
// thousands separators and negatives — e.g. -1234.5 -> "-$1,234.50" — so we
// never hand-roll string math.
const FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }),
  AUD: new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }),
  PEN: new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    maximumFractionDigits: 2,
  }),
};

/**
 * Format a number as currency, e.g. 1234.56 -> "$1,234.56", -5 -> "-$5.00".
 * `currency` defaults to USD so existing single-arg calls still compile.
 */
export function formatCurrency(n: number, currency: Currency = "USD"): string {
  return FORMATTERS[currency].format(n);
}

/**
 * Spanish display label for a backend category key. The keys stay English in the
 * DB and logic (categorizer, budgets, charts); this only changes what's shown.
 */
const CATEGORY_LABELS_ES: Record<string, string> = {
  Groceries: "Alimentos",
  Dining: "Restaurantes",
  Transport: "Transporte",
  Utilities: "Servicios",
  Housing: "Vivienda",
  Shopping: "Compras",
  Entertainment: "Entretenimiento",
  Health: "Salud",
  Travel: "Viajes",
  Subscriptions: "Suscripciones",
  Income: "Ingresos",
  Transfers: "Transferencias",
  Other: "Otros",
};

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "Sin categoría";
  return CATEGORY_LABELS_ES[key] ?? key;
}

/** Turn a "YYYY-MM" period into a friendly label, e.g. "2026-06" -> "jun 2026". */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month; // fall back to the raw string if it's malformed
  return new Date(year, m - 1, 1).toLocaleDateString("es-PE", {
    month: "short",
    year: "numeric",
  });
}
