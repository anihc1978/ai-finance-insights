// src/lib/i18n.ts
// ---------------------------------------------------------------------------
// Language system — Spanish/English, switchable at runtime. The app keeps its
// translated strings PER COMPONENT (each component defines its own local
// `const T = { es: {...}, en: {...} }`), so there is no shared dictionary to
// fight over. This module only owns the *current language*: how to read it,
// how to set it (persisting + broadcasting a change event), and a React hook
// so every mounted component re-renders the instant the language flips.
//
// SSR-safe: every `window`/`localStorage`/`navigator` access is guarded with a
// `typeof window` check so importing this on the server never throws.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";

export type Lang = "es" | "en";

const LANG_KEY = "fin_lang";
const LANG_EVENT = "fin_lang_change";

/**
 * Read the current language. Order of precedence:
 *   1. the saved choice in localStorage ("fin_lang")
 *   2. otherwise the browser language — English only if it starts with "en",
 *      Spanish for everything else (this is a Peru-first app)
 * SSR-safe: with no `window` we default to Spanish.
 */
export function getLang(): Lang {
  if (typeof window === "undefined") return "es";
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // localStorage may be unavailable (private mode); fall back to navigator.
  }
  const nav = window.navigator?.language?.toLowerCase() ?? "";
  return nav.startsWith("en") ? "en" : "es";
}

/**
 * Set the language: persist it and broadcast a "fin_lang_change" event so every
 * component using `useLang()` re-renders. No-op on the server.
 */
export function setLang(l: Lang): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // localStorage may be unavailable; the event still fires so the UI updates.
  }
  window.dispatchEvent(new Event(LANG_EVENT));
}

/**
 * useLang — React hook returning the current language and re-rendering whenever
 * it changes (in this tab via the "fin_lang_change" event, or in another tab
 * via the native "storage" event). Components read their own `T[lang]`.
 */
export function useLang(): Lang {
  const [lang, setLangState] = useState<Lang>(getLang);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setLangState(getLang());
    window.addEventListener(LANG_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LANG_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return lang;
}
