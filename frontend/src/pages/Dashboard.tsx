// src/pages/Dashboard.tsx
// ---------------------------------------------------------------------------
// Milestone 2: import a CSV of transactions and list them.
// Milestones 4–6: AI categorization + AI insights (category chart, month-over-
// month chart, narrative/flags panel, and a next-month forecast card).
//
// Peru FX suite: the Overview tab is rebuilt to a premium, card-based design
// (KpiCard / CategoryDonut / TrendArea / InsightCard / WalletSplit), a "Cambio"
// tab renders the dual-currency converter (ConverterPanel), and CSV import is
// dual-currency aware (rows are tagged PEN or USD).
//
// Every API call goes through the typed apiGet/apiPost/apiUpload helpers
// (JWT attached automatically), so this page also proves the JWT -> FastAPI
// round-trip by showing the user_id GET /me returns.
// ---------------------------------------------------------------------------
import { useEffect, useState, type ChangeEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiPost, apiUpload, apiDelete } from "../lib/api";
import { ChatAssistant } from "../components/ChatAssistant";
import { BudgetsPanel } from "../components/BudgetsPanel";
import { GoalsPanel } from "../components/GoalsPanel";
import { KpiCard } from "../components/KpiCard";
import { CategoryDonut } from "../components/CategoryDonut";
import { TrendArea } from "../components/TrendArea";
import { InsightCard } from "../components/InsightCard";
import { WalletSplit } from "../components/WalletSplit";
import { ConverterPanel } from "../components/ConverterPanel";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { AfpPanel } from "../components/AfpPanel";
import { SpendCalendar } from "../components/SpendCalendar";
import { TransactionEditor } from "../components/TransactionEditor";
import { tokens } from "../lib/theme";
import { formatCurrency, categoryLabel, type Currency } from "../lib/format";

// The currency a transaction is denominated in (mirrors the backend column).
type TxnCurrency = "PEN" | "USD";

// The shape of a transaction row coming back from GET /transactions.
// `currency` is the dual-currency tag added by the Peru FX suite.
interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  currency: TxnCurrency;
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
  highlights: { title: string; detail: string }[];
  forecastNextMonth: number;
}

// The simple tabbed layout that holds the overview vs. the new feature panels.
type Tab = "overview" | "cambio" | "afp" | "chat" | "budgets" | "goals";

export function Dashboard() {
  const { session, signOut } = useAuth();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  // Display currency is fixed to soles (S/). We don't offer a global toggle —
  // it only relabelled amounts (S/100 -> "$100") without converting, which was
  // misleading. Each row still shows in its own currency via t.currency.
  const currency: Currency = "PEN";
  // Which currency the next CSV import is denominated in (PEN by default,
  // matching the backend column default). Separate from the display currency.
  const [importCurrency, setImportCurrency] = useState<TxnCurrency>("PEN");
  const [tab, setTab] = useState<Tab>("overview");
  // Manual add/edit editor: null = closed; otherwise the mode + the row being
  // edited (undefined when adding a brand-new movement).
  const [editor, setEditor] = useState<
    { mode: "add" | "edit"; txn?: Transaction } | null
  >(null);

  // Delete a transaction, then refresh the table + insights.
  async function handleDeleteTxn(id: string) {
    setError(null);
    try {
      await apiDelete<{ deleted: boolean }>(`/transactions/${id}`);
      await loadTransactions();
      await loadInsights();
    } catch (e: unknown) {
      setError(String(e));
    }
  }

  // Called by the editor after a successful add/edit: close + refresh.
  async function handleEditorSaved() {
    setEditor(null);
    await loadTransactions();
    await loadInsights();
  }

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

  // Load everything once on mount. Transactions first, then insights/me.
  useEffect(() => {
    (async () => {
      await loadTransactions();
      await loadInsights();
      await loadMe();
    })().catch((e: unknown) => setError(String(e)));
  }, []);

  // When the user picks a CSV: upload it (tagged with the chosen import
  // currency), then refresh table + insights.
  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      await apiUpload<{ imported: number }>("/transactions/import", file, {
        currency: importCurrency,
      });
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

  // Wallet totals: sum the raw transaction amounts per denomination so the
  // two-wallets card can show the S/ total and US$ total side by side.
  const penTotal = txns
    .filter((t) => t.currency === "PEN")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const usdTotal = txns
    .filter((t) => t.currency === "USD")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div
      style={{
        maxWidth: 860,
        margin: "40px auto",
        fontFamily: "system-ui",
        color: tokens.colors.text,
        padding: `0 ${tokens.spacing.lg}px`,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontWeight: 500 }}>Panel</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={signOut}>Cerrar sesión</button>
        </div>
      </header>

      <p style={{ color: tokens.colors.textMuted }}>
        Sesión iniciada como: <strong>{session?.user.email}</strong>
      </p>
      {userId && (
        <p style={{ color: tokens.colors.textMuted, fontSize: 13 }}>
          user_id verificado desde FastAPI: <code>{userId}</code>
        </p>
      )}

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {/* Tab bar: overview, the new Cambio converter, chat, budgets, goals. */}
      <nav
        style={{
          display: "flex",
          gap: 8,
          marginTop: 24,
          borderBottom: `1px solid ${tokens.colors.border}`,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              border: "none",
              borderBottom:
                tab === t.id
                  ? `2px solid ${tokens.colors.accent}`
                  : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t.id ? 500 : 400,
              color: tab === t.id ? tokens.colors.text : tokens.colors.textMuted,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          {/* Import — dual-currency aware: the picker tags the next upload. */}
          <section
            style={{
              marginTop: 24,
              padding: tokens.spacing.lg,
              background: tokens.colors.surface,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.card,
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 500 }}>Importar movimientos</h3>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFile}
                disabled={importing}
              />
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 13,
                  color: tokens.colors.textMuted,
                }}
              >
                Moneda
                <select
                  value={importCurrency}
                  onChange={(e) =>
                    setImportCurrency(e.target.value as TxnCurrency)
                  }
                  aria-label="Moneda de importación"
                  style={{
                    padding: "6px 8px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: `1px solid ${tokens.colors.border}`,
                    background: "white",
                  }}
                >
                  <option value="PEN">PEN (S/)</option>
                  <option value="USD">USD (US$)</option>
                </select>
              </label>
              {importing && <span>Importando…</span>}
            </div>
            <div style={{ marginTop: 12 }}>
              <button onClick={handleCategorize} disabled={categorizing}>
                {categorizing ? "Categorizando…" : "Categorizar con IA"}
              </button>
            </div>

            {/* Scan Yape/Plin receipt screenshots → AI extracts transactions. */}
            <div
              style={{
                marginTop: tokens.spacing.lg,
                paddingTop: tokens.spacing.lg,
                borderTop: `1px solid ${tokens.colors.border}`,
              }}
            >
              <ReceiptScanner onImported={loadTransactions} />
            </div>
          </section>

          {/* Two wallets: S/ total and US$ total side by side. */}
          <WalletSplit pen={penTotal} usd={usdTotal} currency={currency} />

          {/* Origin-style spend heatmap for the current month (soles). */}
          <SpendCalendar transactions={txns} />

          {/* AI insight panels — only shown once the backend has data to analyze. */}
          {insights && (
            <>
              {/* KPI metric cards: Spent / Income / Saved / Forecast. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: tokens.spacing.md,
                  marginTop: tokens.spacing.lg,
                }}
              >
                <KpiCard
                  label="Gastado"
                  value={formatCurrency(insights.totalSpend, currency)}
                />
                <KpiCard
                  label="Ingresos"
                  value={formatCurrency(insights.totalIncome, currency)}
                />
                <KpiCard
                  label="Ahorrado"
                  value={formatCurrency(
                    insights.totalIncome - insights.totalSpend,
                    currency,
                  )}
                  trend={{
                    dir:
                      insights.totalIncome - insights.totalSpend > 0
                        ? "up"
                        : insights.totalIncome - insights.totalSpend < 0
                          ? "down"
                          : "flat",
                    text:
                      insights.totalIncome - insights.totalSpend >= 0
                        ? "Saldo positivo"
                        : "Saldo negativo",
                  }}
                />
                <KpiCard
                  label="Pronóstico próximo mes"
                  value={formatCurrency(insights.forecastNextMonth, currency)}
                />
              </div>

              {/* Spending mix + month-over-month trend. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: tokens.spacing.md,
                  marginTop: tokens.spacing.lg,
                }}
              >
                <CategoryDonut data={insights.byCategory} currency={currency} />
                <TrendArea
                  data={insights.monthOverMonth}
                  currency={currency}
                />
              </div>

              {/* Claude's "Esto encontramos" highlights + narrative + flags. */}
              <InsightCard
                narrative={insights.narrative}
                flags={insights.flags}
                highlights={insights.highlights ?? []}
              />
            </>
          )}

          <section style={{ marginTop: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontWeight: 500 }}>
                Tus movimientos ({txns.length})
              </h3>
              <button onClick={() => setEditor({ mode: "add" })}>
                + Agregar movimiento
              </button>
            </div>
            {txns.length === 0 ? (
              <p style={{ color: tokens.colors.textMuted }}>
                Aún no hay movimientos — importa un CSV arriba.
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: `1px solid ${tokens.colors.border}`,
                    }}
                  >
                    <th style={{ padding: 8 }}>Fecha</th>
                    <th style={{ padding: 8 }}>Descripción</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Monto</th>
                    <th style={{ padding: 8 }}>Categoría</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => {
                    const amount = Number(t.amount);
                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: `1px solid ${tokens.colors.border}`,
                        }}
                      >
                        <td style={{ padding: 8 }}>{t.date}</td>
                        <td style={{ padding: 8 }}>
                          {t.description}
                          <CurrencyBadge currency={t.currency} />
                        </td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            color: amount < 0 ? "crimson" : "green",
                          }}
                        >
                          {formatCurrency(amount, t.currency)}
                        </td>
                        <td style={{ padding: 8, color: tokens.colors.textMuted }}>
                          {categoryLabel(t.category)}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => setEditor({ mode: "edit", txn: t })}
                            style={{ fontSize: 12, padding: "2px 8px" }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteTxn(t.id)}
                            style={{
                              fontSize: 12,
                              padding: "2px 8px",
                              marginLeft: 6,
                              color: "crimson",
                            }}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === "cambio" && <ConverterPanel />}
      {tab === "afp" && <AfpPanel currency={currency} />}
      {tab === "chat" && <ChatAssistant />}
      {tab === "budgets" && <BudgetsPanel currency={currency} />}
      {tab === "goals" && <GoalsPanel currency={currency} />}

      {/* Manual add/edit modal — overlays the whole page. */}
      {editor && (
        <TransactionEditor
          mode={editor.mode}
          initial={
            editor.txn
              ? {
                  id: editor.txn.id,
                  date: editor.txn.date,
                  description: editor.txn.description,
                  amount: Number(editor.txn.amount),
                  category: editor.txn.category,
                  currency: editor.txn.currency,
                }
              : undefined
          }
          onSaved={handleEditorSaved}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

// A small pill that marks which currency a row is denominated in. Inline so the
// transactions table stays self-contained.
function CurrencyBadge({ currency }: { currency: TxnCurrency }) {
  const isPen = currency === "PEN";
  return (
    <span
      style={{
        marginLeft: 8,
        padding: "1px 6px",
        fontSize: 11,
        fontWeight: 500,
        borderRadius: tokens.radii.chip,
        color: isPen ? tokens.colors.accent : tokens.colors.text,
        background: isPen ? "#1D9E7515" : tokens.colors.surface,
        border: `1px solid ${tokens.colors.border}`,
      }}
    >
      {isPen ? "S/" : "US$"}
    </span>
  );
}

// Tab definitions, kept module-level so the render loop stays declarative.
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Resumen" },
  { id: "cambio", label: "Cambio" },
  { id: "afp", label: "AFP" },
  { id: "chat", label: "Chat" },
  { id: "budgets", label: "Presupuestos" },
  { id: "goals", label: "Metas" },
];
