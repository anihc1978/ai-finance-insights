// src/components/GoalsPanel.tsx
// ---------------------------------------------------------------------------
// Savings goals. Fetches GET /goals, draws a saved/target progress bar per
// goal, and lets the user add a goal (POST /goals), add to its savings or
// rename/retarget it (PATCH /goals/{id}), or delete it (DELETE /goals/{id}).
// Self-contained: it does its own fetching and owns its local state.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { supabase } from "../lib/supabase";
import { formatCurrency, type Currency } from "../lib/format";

interface GoalsPanelProps {
  currency: Currency;
}

// One row from GET /goals.
interface Goal {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  target_date: string | null;
}

const API_BASE = import.meta.env.VITE_API_BASE as string;

const cardStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 16,
  border: "1px solid #eee",
  borderRadius: 8,
};

// PATCH/DELETE aren't covered by the shared api.ts helpers (GET/POST/upload
// only), so we attach the JWT the same way they do for these two verbs.
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiPatch<TBody, TResponse>(path: string, body: TBody): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
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

export function GoalsPanel({ currency }: GoalsPanelProps) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // New-goal inputs.
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [targetDate, setTargetDate] = useState("");

  async function loadGoals() {
    const data = await apiGet<{ goals: Goal[] }>("/goals");
    setGoals(data.goals);
  }

  useEffect(() => {
    loadGoals().catch((e: unknown) => setError(String(e)));
  }, []);

  async function handleAdd() {
    const target_amount = Number(target);
    if (!name.trim() || !Number.isFinite(target_amount) || target_amount <= 0) {
      setError("Ingresa un nombre y un objetivo positivo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost<
        { name: string; target_amount: number; target_date: string | null },
        { goal: Goal }
      >("/goals", {
        name: name.trim(),
        target_amount,
        target_date: targetDate || null,
      });
      setName("");
      setTarget("");
      setTargetDate("");
      await loadGoals();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Add a contribution to a goal's saved_amount (PATCH the running total).
  async function handleAddSavings(g: Goal) {
    const input = window.prompt(`Agregar al ahorro de "${g.name}":`, "");
    if (input === null) return;
    const delta = Number(input);
    if (!Number.isFinite(delta) || delta <= 0) {
      setError("Ingresa un monto positivo para agregar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPatch<{ saved_amount: number }, { goal: Goal }>(`/goals/${g.id}`, {
        saved_amount: g.saved_amount + delta,
      });
      await loadGoals();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete<{ deleted: boolean }>(`/goals/${id}`);
      await loadGoals();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0 }}>Metas de ahorro</h3>

      {/* Add a goal */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la meta"
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
        />
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Objetivo"
          type="number"
          min="0"
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6, width: 130 }}
        />
        <input
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          type="date"
          style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
        />
        <button onClick={handleAdd} disabled={busy}>
          {busy ? "Guardando…" : "Agregar meta"}
        </button>
      </div>

      {error && <p style={{ color: "crimson", marginTop: 12 }}>Error: {error}</p>}

      {goals.length === 0 ? (
        <p style={{ color: "#666", marginTop: 12 }}>
          Aún no hay metas — agrega una arriba.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {goals.map((g) => {
            const pct = g.target_amount > 0
              ? Math.min(100, (g.saved_amount / g.target_amount) * 100)
              : 0;
            const done = g.saved_amount >= g.target_amount;
            return (
              <div key={g.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <strong>{g.name}</strong>
                  <span style={{ color: done ? "green" : "#333" }}>
                    {formatCurrency(g.saved_amount, currency)} / {formatCurrency(g.target_amount, currency)}
                  </span>
                </div>
                {/* Progress bar: green fill once the target is reached. */}
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
                      background: done ? "green" : "#0ea5e9",
                    }}
                  />
                </div>
                {g.target_date && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
                    Fecha objetivo: {g.target_date}
                  </p>
                )}
                <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
                  <button
                    onClick={() => handleAddSavings(g)}
                    disabled={busy}
                    style={{ fontSize: 12, padding: "2px 8px" }}
                  >
                    Agregar ahorro
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
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
