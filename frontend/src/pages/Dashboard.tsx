// src/pages/Dashboard.tsx
// ---------------------------------------------------------------------------
// Milestone 2: import a CSV of transactions and list them.
// Milestones 4–6: AI categorization + AI insights (category chart, month-over-
// month chart, narrative/flags panel, and a next-month forecast card).
//
// Every API call goes through the typed apiGet/apiPost/apiUpload helpers
// (JWT attached automatically), so this page also proves the JWT -> FastAPI
// round-trip by showing the user_id GET /me returns.
// ---------------------------------------------------------------------------
import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiPost, apiPut, apiUpload } from "../lib/api";
import { SpendingByCategory } from "../components/SpendingByCategory";
import { MonthOverMonth } from "../components/MonthOverMonth";
import { ForecastCard } from "../components/ForecastCard";
import { InsightsPanel } from "../components/InsightsPanel";
import { ChatAssistant } from "../components/ChatAssistant";
import { BudgetsPanel } from "../components/BudgetsPanel";
import { GoalsPanel } from "../components/GoalsPanel";
import { CurrencySelector } from "../components/CurrencySelector";
import { formatCurrency, type Currency } from "../lib/format";

// The shape of a transaction row coming back from GET /transactions.
interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
}

// The shape of GET /insights (see the shared contract). Keeping it co-located
// with the page that consumes it makes the data flow easy to follow.
interface Insights {
  month: string;
  totalSpend: number;
  totalIncome: number;
  byCategory: { category: string; amount: number }[];
  monthOverMonth: { month: string; spend: number }[];
  narrative: string;
  flags: string[];
  forecastNextMonth: number;
}

// The simple tabbed layout that holds the overview vs. the new feature panels.
type Tab = "overview" | "chat" | "budgets" | "goals";

export function Dashboard() {
  const { session, signOut } = useAuth();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [currency, setCurrency] = useState<Currency>("USD");
  const [tab, setTab] = useState<Tab>("overview");

  // Fetch the user's transactions (the generic types the response for us).
  async function loadTransactions() {
    const data = await apiGet<{ transactions: Transaction[] }>("/transactions");
    setTxns(data.transactions);
  }

  // Fetch AI insights. The backend returns 404 "No transactions to analyze"
  // when the user has none — we treat that as "no panels", not an error.
  async function loadInsights() {
    try {
      const data = await apiGet<Insights>("/insights");
      setInsights(data);
    } catch (e: unknown) {
      // apiGet throws "API 404: ..." on a 404; swallow that one case so a brand
      // new account doesn't show a scary error — just no insight panels yet.
      if (e instanceof Error && e.message.startsWith("API 404")) {
        setInsights(null);
        return;
      }
      throw e;
    }
  }

  // Prove the JWT -> FastAPI round-trip: /me echoes back the authenticated
  // user_id straight from the token the backend verified.
  async function loadMe() {
    const me = await apiGet<{ user_id: string; email: string }>("/me");
    setUserId(me.user_id);
  }

  // Load the user's display-currency preference (the backend auto-creates the
  // profile row with DEFAULT_CURRENCY when it's absent, so this always returns).
  async function loadProfile() {
    const p = await apiGet<{ currency: Currency }>("/profile");
    setCurrency(p.currency);
  }

  // Persist a currency change immediately, then reflect it in the UI.
  async function changeCurrency(next: Currency) {
    setCurrency(next); // optimistic — money re-renders right away
    try {
      const p = await apiPut<{ currency: Currency }, { currency: Currency }>(
        "/profile",
        { currency: next },
      );
      setCurrency(p.currency);
    } catch (err: unknown) {
      setError(String(err));
    }
  }

  // Load everything once on mount. Transactions first, then insights/me/profile.
  useEffect(() => {
    (async () => {
      await loadTransactions();
      await loadInsights();
      await loadMe();
      await loadProfile();
    })().catch((e: unknown) => setError(String(e)));
  }, []);

  // When the user picks a CSV: upload it, then refresh table + insights.
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      await apiUpload<{ imported: number }>("/transactions/import", file);
      await loadTransactions(); // refresh so the new rows appear
      await loadInsights(); // new data -> recompute insights
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setImporting(false);
      e.target.value = ""; // reset so the same file can be re-selected
    }
  }

  // Ask Claude to categorize uncategorized transactions, then refresh both the
  // table (new categories) and the insights (category chart depends on them).
  async function handleCategorize() {
    setCategorizing(true);
    setError(null);
    try {
      await apiPost<Record<string, never>, { categorized: number }>(
        "/transactions/categorize",
        {},
      );
      await loadTransactions();
      await loadInsights();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setCategorizing(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <CurrencySelector value={currency} onChange={changeCurrency} />
          <button onClick={signOut}>Sign out</button>
        </div>
      </header>

      <p>Logged in as: <strong>{session?.user.email}</strong></p>
      {userId && (
        <p style={{ color: "#666", fontSize: 13 }}>
          Verified user_id from FastAPI: <code>{userId}</code>
        </p>
      )}

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {/* Simple tab bar to keep overview, chat, budgets, and goals separated. */}
      <nav style={{ display: "flex", gap: 8, marginTop: 24, borderBottom: "1px solid #eee" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? "#111" : "#666",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <section style={{ marginTop: 24, padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>Import transactions</h3>
            <input type="file" accept=".csv" onChange={handleFile} disabled={importing} />
            {importing && <span style={{ marginLeft: 8 }}>Importing…</span>}
            <div style={{ marginTop: 12 }}>
              <button onClick={handleCategorize} disabled={categorizing}>
                {categorizing ? "Categorizing…" : "Categorize with AI"}
              </button>
            </div>
          </section>

          {/* AI insight panels — only shown once the backend has data to analyze. */}
          {insights && (
            <>
              <ForecastCard value={insights.forecastNextMonth} currency={currency} />
              <InsightsPanel
                narrative={insights.narrative}
                flags={insights.flags}
                totalSpend={insights.totalSpend}
                totalIncome={insights.totalIncome}
                currency={currency}
              />
              <SpendingByCategory data={insights.byCategory} currency={currency} />
              <MonthOverMonth data={insights.monthOverMonth} currency={currency} />
            </>
          )}

          <section style={{ marginTop: 24 }}>
            <h3>Your transactions ({txns.length})</h3>
            {txns.length === 0 ? (
              <p style={{ color: "#666" }}>No transactions yet — import a CSV above.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                    <th style={{ padding: 8 }}>Date</th>
                    <th style={{ padding: 8 }}>Description</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Amount</th>
                    <th style={{ padding: 8 }}>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => {
                    const amount = Number(t.amount);
                    return (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: 8 }}>{t.date}</td>
                        <td style={{ padding: 8 }}>{t.description}</td>
                        <td style={{ padding: 8, textAlign: "right", color: amount < 0 ? "crimson" : "green" }}>
                          {formatCurrency(amount, currency)}
                        </td>
                        <td style={{ padding: 8, color: "#666" }}>{t.category ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === "chat" && <ChatAssistant />}
      {tab === "budgets" && <BudgetsPanel currency={currency} />}
      {tab === "goals" && <GoalsPanel currency={currency} />}
    </div>
  );
}

// Tab definitions, kept module-level so the render loop stays declarative.
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "budgets", label: "Budgets" },
  { id: "goals", label: "Goals" },
];
