// src/lib/displayCurrency.ts
// ---------------------------------------------------------------------------
// Display currency — which single currency the dashboard's roll-up totals are
// computed/labelled in (KPIs, charts, calendar, wallet emphasis). This is the
// user's *view* preference, NOT a converter: amounts are never converted across
// currencies. It only decides which currency the single-number totals report —
// correct for the common case of a single-currency user (a Peru user sees S/, a
// Spain user sees €). Per-row transaction amounts always keep their own currency.
//
// Resolution order:
//   1. the saved override in localStorage ("fin_display_currency") if set, else
//   2. the user's MOST-COMMON transaction currency (the currency appearing on
//      the most rows; ties/empty -> "PEN", this being a Peru-first app).
//
// Mirrors i18n.ts: persist + broadcast a change event so every mounted hook
// re-renders the instant the choice flips. SSR-safe — every window access is
// guarded with a `typeof window` check so importing on the server never throws.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import type { Currency } from "./format";

const DISPLAY_KEY = "fin_display_currency";
const DISPLAY_EVENT = "fin_display_currency_change";

// The currencies a user can pick to display roll-up totals in. Mirrors the
// per-row currencies transactions actually carry (PEN | USD | EUR).
export const DISPLAY_CURRENCIES: Currency[] = ["PEN", "USD", "EUR"];

/** A row only needs its `currency` for us to count denominations. */
interface HasCurrency {
  currency: string;
}

/**
 * The most-common currency across the given transactions: the `currency` value
 * appearing on the most rows. Ties (or no rows) fall back to "PEN".
 */
export function dominantCurrency(transactions: HasCurrency[]): Currency {
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    const c = t.currency;
    if (c) counts[c] = (counts[c] ?? 0) + 1;
  }
  let best: Currency = "PEN";
  let bestCount = -1;
  for (const c of DISPLAY_CURRENCIES) {
    const n = counts[c] ?? 0;
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

/** Read the saved override, if any. SSR-safe; returns null when none/unavailable. */
function getSavedOverride(): Currency | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(DISPLAY_KEY);
    if (saved && (DISPLAY_CURRENCIES as string[]).includes(saved)) {
      return saved as Currency;
    }
  } catch {
    // localStorage may be unavailable (private mode); treat as no override.
  }
  return null;
}

/**
 * Persist the display-currency override and broadcast a change event so every
 * component using `useDisplayCurrency()` re-renders. No-op on the server.
 */
export function setDisplayCurrency(c: Currency): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISPLAY_KEY, c);
  } catch {
    // localStorage may be unavailable; the event still fires so the UI updates.
  }
  window.dispatchEvent(new Event(DISPLAY_EVENT));
}

/**
 * useDisplayCurrency — returns the active display currency and a setter.
 *
 * The active value is the saved override if the user set one, otherwise the
 * dominant currency of the passed `transactions` (so a brand-new all-EUR user
 * auto-sees €, a Peru user S/). Re-renders when the override changes here (via
 * the change event) or in another tab (via the native "storage" event).
 */
export function useDisplayCurrency(
  transactions: HasCurrency[],
): [Currency, (c: Currency) => void] {
  const [override, setOverride] = useState<Currency | null>(getSavedOverride);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOverride(getSavedOverride());
    window.addEventListener(DISPLAY_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISPLAY_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const active = override ?? dominantCurrency(transactions);
  return [active, setDisplayCurrency];
}
