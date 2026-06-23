// src/pages/Dashboard.tsx
// ---------------------------------------------------------------------------
// Milestone 2: import a CSV of transactions and list them.
// Milestones 4–6: AI categorization + AI insights (category chart, month-over-
// month chart, narrative/flags panel, and a next-month forecast card).
//
// Peru FX suite: the Overview tab is a premium, card-based design (KpiCard /
// CategoryDonut / TrendArea / InsightCard / WalletSplit). Tipo de cambio and
// AFP are surfaced inline at the top of the overview (FxWidget / AfpSummary)
// instead of as menu tabs, and CSV import is dual-currency aware (rows are
// tagged PEN or USD). The layout compacts to a single column on phones.
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
import { FxWidget } from "../components/FxWidget";
import { AfpSummary } from "../components/AfpSummary";
import { ReceiptScanner } from "../components/ReceiptScanner";
import { SpendCalendar } from "../components/SpendCalendar";
import { Greeting } from "../components/Greeting";
import { WeeklyRecap } from "../components/WeeklyRecap";
import { UpcomingPayments } from "../components/UpcomingPayments";
import { SubscriptionsPanel } from "../components/SubscriptionsPanel";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { TransactionEditor } from "../components/TransactionEditor";
import { SourceBadge, SOURCE_CHIPS } from "../components/SourceBadge";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { ThemeToggle } from "../components/ThemeToggle";
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
  // Where the movement came from (Yape/Plin/bank/AFP). The backend returns the
  // canonical key (or null); the UI maps it to a brand chip via SourceBadge.
  source: string | null;
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
type Tab = "overview" | "analisis" | "suscripciones" | "budgets" | "goals";

// True when the viewport is phone-sized. Drives the compact, single-column
// layout (stacked transaction cards, 2-col KPIs, trimmed padding). Listens for
// viewport changes and cleans up on unmount.
function useIsMobile(): boolean {
  const query = "(max-width: 640px)";
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

export function Dashboard() {
  const { signOut } = useAuth();
  const isMobile = useIsMobile();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
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
  // Which source (Yape/Plin/bank/AFP) the next CSV import should be tagged with.
  // Empty = "Sin especificar" (let the backend detect per-row from descriptions).
  const [importSource, setImportSource] = useState<string>("");
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

  // Load everything once on mount. Transactions first, then insights.
  useEffect(() => {
    (async () => {
      await loadTransactions();
      await loadInsights();
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
        source: importSource,
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

  // "Ingresos por fuente": group positive movements by their source key (skip
  // rows with no detected source), summing the amount per source. Sorted by
  // total descending so the biggest income source leads.
  const incomeBySource = Object.entries(
    txns
      .filter((t) => Number(t.amount) > 0 && t.source)
      .reduce<Record<string, number>>((acc, t) => {
        const key = t.source as string;
        acc[key] = (acc[key] ?? 0) + Number(t.amount);
        return acc;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // Yape/Plin: how much money has flowed through each digital wallet — the
  // running total Peru's bank/wallet apps don't surface. `out` = spent/sent,
  // `inc` = received. Both wallets are always shown so the totals have a home.
  const walletMovement = (["yape", "plin"] as const).map((key) => {
    const rows = txns.filter((t) => t.source === key);
    const out = rows
      .filter((t) => Number(t.amount) < 0)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const inc = rows
      .filter((t) => Number(t.amount) > 0)
      .reduce((s, t) => s + Number(t.amount), 0);
    return { key, out, inc, count: rows.length };
  });

  return (
    <div
      style={{
        maxWidth: 860,
        margin: isMobile ? "16px auto" : "40px auto",
        fontFamily: "system-ui",
        color: tokens.colors.text,
        padding: `0 ${isMobile ? tokens.spacing.md : tokens.spacing.lg}px`,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Greeting />
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ThemeToggle />
          <ProfileAvatar />
          <button onClick={signOut}>Cerrar sesión</button>
        </div>
      </header>

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {/* Tab bar: overview, suscripciones, budgets, goals. Horizontally
          scrollable so tabs never wrap or break the layout on a phone. */}
      <nav
        style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: 8,
          marginTop: 24,
          borderBottom: `1px solid ${tokens.colors.border}`,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
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
              whiteSpace: "nowrap",
              color: tab === t.id ? tokens.colors.text : tokens.colors.textMuted,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          {/* AI chat — the centerpiece, placed on top above the numbers. */}
          <section style={{ marginTop: tokens.spacing.lg }}>
            <ChatAssistant />
          </section>

          {/* KPI metric cards: Spent / Income / Saved / Forecast. Only shown
              once the backend has data to analyze. */}
          {insights && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr 1fr"
                  : "repeat(auto-fit, minmax(160px, 1fr))",
                gap: tokens.spacing.md,
                marginTop: tokens.spacing.lg,
              }}
            >
              <KpiCard
                label="Ingresos"
                value={formatCurrency(insights.totalIncome, currency)}
              />
              <KpiCard
                label="Gastado"
                value={formatCurrency(insights.totalSpend, currency)}
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
          )}

          <section style={{ marginTop: 16 }}>
            <WeeklyRecap />
          </section>

          {/* Tus billeteras — directly after Esta semana, same section treatment. */}
          <section style={{ marginTop: 16 }}>
            <WalletSplit pen={penTotal} usd={usdTotal} currency={currency} />
          </section>

          {/* Yape y Plin: total moved through each digital wallet — the running
              total the bank apps don't show. */}
          <section
            style={{
              marginTop: 16,
              padding: tokens.spacing.lg,
              background: tokens.colors.surface,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.card,
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 2, fontWeight: 500 }}>
              Yape y Plin
            </h3>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: tokens.colors.textMuted,
              }}
            >
              Lo que has gastado y enviado por cada billetera.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: tokens.spacing.md,
              }}
            >
              {walletMovement.map((w) => (
                <div
                  key={w.key}
                  style={{
                    padding: tokens.spacing.md,
                    background: tokens.colors.cardBg,
                    border: `1px solid ${tokens.colors.border}`,
                    borderRadius: tokens.radii.card,
                  }}
                >
                  <SourceBadge source={w.key} />
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: tokens.colors.textMuted,
                    }}
                  >
                    Gastado / enviado
                  </p>
                  <p style={{ margin: "2px 0 2px", fontSize: 24, fontWeight: 600 }}>
                    {formatCurrency(w.out, currency)}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: tokens.colors.textMuted,
                    }}
                  >
                    {w.count}{" "}
                    {w.count === 1 ? "movimiento" : "movimientos"}
                    {w.inc > 0
                      ? ` · recibido ${formatCurrency(w.inc, currency)}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Próximos pagos: alertas de pagos y recordatorios próximos. */}
          <section style={{ marginTop: tokens.spacing.lg }}>
            <UpcomingPayments />
          </section>

          {/* Ingresos por fuente: a mini-breakdown of where income comes from. */}
          {incomeBySource.length > 0 && (
            <section
              style={{
                marginTop: tokens.spacing.lg,
                padding: tokens.spacing.lg,
                background: tokens.colors.surface,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.card,
              }}
            >
              <h3 style={{ marginTop: 0, fontWeight: 500 }}>
                Ingresos por fuente
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {incomeBySource.map(([key, total]) => (
                  <div
                    key={key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <SourceBadge source={key} />
                    <strong style={{ color: tokens.colors.text }}>
                      {formatCurrency(total, currency)}
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tipo de cambio + AFP, surfaced inline (no menu): compact 2-up on
              desktop, stacked on mobile. */}
          <section
            style={{
              marginTop: tokens.spacing.lg,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: tokens.spacing.md,
              alignItems: "stretch",
            }}
          >
            <FxWidget />
            <AfpSummary currency={currency} />
          </section>

          {/* Origin-style spend heatmap for the current month (soles). */}
          <SpendCalendar transactions={txns} />

          {/* AI insight panels — only shown once the backend has data to analyze. */}
          {insights && (
            <>
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
              <label
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  fontSize: 13,
                  color: tokens.colors.textMuted,
                }}
              >
                Origen
                <select
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  aria-label="Origen de importación"
                  style={{
                    padding: "6px 8px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: `1px solid ${tokens.colors.border}`,
                    background: "white",
                  }}
                >
                  <option value="">Sin especificar</option>
                  {Object.entries(SOURCE_CHIPS).map(([key, chip]) => (
                    <option key={key} value={key}>
                      {chip.label}
                    </option>
                  ))}
                </select>
              </label>
              {importing && <span>Importando y categorizando con IA…</span>}
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
            ) : isMobile ? (
              /* Stacked cards on a phone so nothing overflows horizontally. */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: tokens.spacing.sm,
                  marginTop: tokens.spacing.sm,
                }}
              >
                {txns.map((t) => {
                  const amount = Number(t.amount);
                  return (
                    <div
                      key={t.id}
                      style={{
                        padding: tokens.spacing.md,
                        background: tokens.colors.surface,
                        border: `1px solid ${tokens.colors.border}`,
                        borderRadius: tokens.radii.card,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: tokens.colors.textMuted,
                          }}
                        >
                          {t.date}
                        </span>
                        <strong
                          style={{
                            color: amount < 0 ? "crimson" : "green",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatCurrency(amount, t.currency)}
                        </strong>
                      </div>
                      <div style={{ fontWeight: 500 }}>{t.description}</div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        <SourceBadge source={t.source} />
                        <CurrencyBadge currency={t.currency} />
                        <span
                          style={{
                            fontSize: 12,
                            color: tokens.colors.textMuted,
                          }}
                        >
                          {categoryLabel(t.category)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 6,
                          marginTop: 2,
                        }}
                      >
                        <button
                          onClick={() => setEditor({ mode: "edit", txn: t })}
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteTxn(t.id)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            color: "crimson",
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                          <SourceBadge source={t.source} />
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

      {tab === "analisis" && <AnalyticsPanel />}
      {tab === "suscripciones" && <SubscriptionsPanel />}
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
  { id: "analisis", label: "📊 Análisis" },
  { id: "suscripciones", label: "Suscripciones" },
  { id: "budgets", label: "Presupuestos" },
  { id: "goals", label: "Metas" },
];
