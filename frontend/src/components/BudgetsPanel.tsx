// src/components/BudgetsPanel.tsx
// ---------------------------------------------------------------------------
// Per-category monthly budgets. Fetches GET /budgets (each row carries the
// configured monthly_limit plus the current-month spent total computed by the
// backend), draws a spent/limit progress bar (red when over), and lets the
// user set/edit a limit (PUT /budgets), delete one (DELETE /budgets/{category}),
// or prefill limits from an AI suggestion (POST /budgets/suggest).
// Self-contained: it does its own fetching and owns its local state.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { supabase } from "../lib/supabase";
import { formatCurrency, categoryLabel, type Currency } from "../lib/format";
import { BudgetGauge } from "./BudgetGauge";

interface BudgetsPanelProps {
  currency: Currency;
}

// One row from GET /budgets.
interface Budget {
  category: string;
  monthly_limit: number;
  spent: number;
}

// One row from POST /budgets/suggest.
interface BudgetSuggestion {
  category: string;
  suggested_limit: number;
}

const API_BASE = import.meta.env.VITE_API_BASE as string;

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 8,
};

// PUT/DELETE aren't covered by the shared api.ts helpers (which only do
// GET/POST/upload), so we attach the JWT the same way they do for these two
// verbs. Kept local to this component to avoid touching api.ts.
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiPut<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as TResponse;
}

async function apiDelete<TResponse>(path: string): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (await res.json()) as TResponse;
}

export function BudgetsPanel({ currency }: BudgetsPanelProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Inputs for adding/editing a limit. `category` doubles as the upsert key.
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");

  async function loadBudgets() {
    const data = await apiGet<{ budgets: Budget[] }>("/budgets");
    setBudgets(data.budgets);
  }

  useEffect(() => {
    loadBudgets().catch((e: unknown) => setError(String(e)));
  }, []);

  // Set or edit a category's monthly limit (backend upserts on user+category).
  async function handleSave() {
    const monthly_limit = Number(limit);
    if (!category.trim() || !Number.isFinite(monthly_limit) || monthly_limit <= 0) {
      setError("Ingresa una categoría y un límite positivo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPut<{ category: string; monthly_limit: number }, { category: string; monthly_limit: number }>(
        "/budgets",
        { category: category.trim(), monthly_limit },
      );
      setCategory("");
      setLimit("");
      await loadBudgets();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Load a category + limit back into the inputs so a save overwrites it.
  function startEdit(b: Budget) {
    setCategory(b.category);
    setLimit(String(b.monthly_limit));
  }

  async function handleDelete(cat: string) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete<{ deleted: boolean }>(`/budgets/${encodeURIComponent(cat)}`);
      await loadBudgets();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Ask Claude for limits based on spending history, then prefill the first
  // suggestion into the inputs so the user can review before saving.
  async function handleSuggest() {
    setSuggesting(true);
    setError(null);
    try {
      const data = await apiPost<Record<string, never>, { suggestions: BudgetSuggestion[] }>(
        "/budgets/suggest",
        {},
      );
      const first = data.suggestions[0];
      if (first) {
        setCategory(first.category);
        setLimit(String(first.suggested_limit));
      } else {
        setError("Aún no hay sugerencias — importa algunos movimientos primero.");
      }
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setSuggesting(false);
    }
  }

  // Totals across every category, for the overall budget gauge at the top.
  const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
  const totalLimit = budgets.reduce((sum, b) => sum + b.monthly_limit, 0);

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Presupuestos</h3>

      {/* Overall usage: total spent vs total limit across all categories */}
      {totalLimit > 0 && (
        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 20px" }}>
          <BudgetGauge spent={totalSpent} limit={totalLimit} currency={currency} />
        </div>
      )}

      {/* Add / edit a limit */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Categoría"
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
        />
        <input
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          placeholder="Límite mensual"
          type="number"
          min="0"
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6, width: 130 }}
        />
        <button onClick={handleSave} disabled={busy}>
          {busy ? "Guardando…" : "Fijar límite"}
        </button>
        <button onClick={handleSuggest} disabled={suggesting}>
          {suggesting ? "Pensando…" : "Sugerir con IA"}
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Error: {error}</p>}

      {budgets.length === 0 ? (
        <p style={{ color: "#666", marginTop: 12 }}>
          Aún no hay presupuestos — fija un límite por categoría arriba.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {budgets.map((b) => {
            const over = b.spent > b.monthly_limit;
            const pct = b.monthly_limit > 0
              ? Math.min(100, (b.spent / b.monthly_limit) * 100)
              : 0;
            return (
              <div key={b.category}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <strong>{categoryLabel(b.category)}</strong>
                  <span style={{ color: over ? "crimson" : "#333" }}>
                    {formatCurrency(b.spent, currency)} / {formatCurrency(b.monthly_limit, currency)}
                  </span>
                </div>
                {/* Progress bar: red fill when over the limit. */}
                <div
                  style={{
                    height: 8,
                    background: "#f0f0f0",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: over ? "crimson" : "#6366f1",
                    }}
                  />
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                  <button
                    onClick={() => startEdit(b)}
                    style={{ fontSize: 12, padding: "2px 8px" }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(b.category)}
                    disabled={busy}
                    style={{ fontSize: 12, padding: "2px 8px", color: "crimson" }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
