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
import { LanguageToggle } from "../components/LanguageToggle";
import { tokens } from "../lib/theme";
import { formatCurrency, categoryLabel, type Currency } from "../lib/format";
import { useLang } from "../lib/i18n";
import { useDisplayCurrency, DISPLAY_CURRENCIES } from "../lib/displayCurrency";

// The currency a transaction is denominated in (mirrors the backend column).
type TxnCurrency = "PEN" | "USD" | "EUR";

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
  const lang = useLang();
  const t = T[lang];
  const isMobile = useIsMobile();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [recategorizing, setRecategorizing] = useState(false);
  // How many movements the list shows before the "Ver más" button (10 at a time).
  const [visibleCount, setVisibleCount] = useState(10);
  // Display currency: the single currency the roll-up totals (KPIs, charts,
  // calendar, wallet emphasis) are computed/labelled in. Defaults to the user's
  // most-common transaction currency (so a Peru user sees S/, a Spain user €),
  // with an explicit override they can pick below. This NEVER converts amounts —
  // it only chooses which currency the single-number totals report in, which is
  // correct for the common single-currency user. Per-row amounts keep their own
  // currency (rendered via txn.currency in the table).
  const [currency, setCurrency] = useDisplayCurrency(txns);
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

  // The section tabs in the current language.
  const tabs = tabsFor(t);

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

  // Re-categorize everything still in the catch-all "Other" (plus any null),
  // e.g. data imported before auto-categorization existed.
  async function handleRecategorize() {
    setRecategorizing(true);
    setError(null);
    try {
      await apiPost<Record<string, never>, { categorized: number }>(
        "/transactions/recategorize",
        {},
      );
      await loadTransactions();
      await loadInsights();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setRecategorizing(false);
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
  const eurTotal = txns
    .filter((t) => t.currency === "EUR")
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
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Greeting />
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <LanguageToggle />
          <ThemeToggle />
          <ProfileAvatar />
          <button onClick={signOut}>{t.signOut}</button>
        </div>
      </header>

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {/* Section nav: a full-width dropdown on phones (the 5 Spanish labels are
          too long for a tab row), the classic tab bar on desktop. */}
      {isMobile ? (
        <div
          style={{
            marginTop: 24,
            paddingBottom: 12,
            borderBottom: `1px solid ${tokens.colors.border}`,
          }}
        >
          <select
            aria-label={t.sectionAria}
            value={tab}
            onChange={(e) => setTab(e.target.value as Tab)}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 15,
              fontWeight: 500,
              color: tokens.colors.text,
              background: tokens.colors.cardBg,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.input,
            }}
          >
            {tabs.map((tb) => (
              <option key={tb.id} value={tb.id}>
                {tb.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
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
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              style={{
                padding: "8px 14px",
                border: "none",
                borderBottom:
                  tab === tb.id
                    ? `2px solid ${tokens.colors.accent}`
                    : "2px solid transparent",
                background: "none",
                cursor: "pointer",
                fontWeight: tab === tb.id ? 500 : 400,
                whiteSpace: "nowrap",
                color: tab === tb.id ? tokens.colors.text : tokens.colors.textMuted,
              }}
            >
              {tb.label}
            </button>
          ))}
        </nav>
      )}

      {tab === "overview" && (
        <>
          {/* AI chat — the centerpiece, placed on top above the numbers. */}
          <section style={{ marginTop: tokens.spacing.lg }}>
            <ChatAssistant />
          </section>

          {/* Import + scan, on top so a new (empty) user can add data right away. */}
          <section
            style={{
              marginTop: 24,
              padding: tokens.spacing.lg,
              background: tokens.colors.surface,
              border: `1px solid ${tokens.colors.border}`,
              borderRadius: tokens.radii.card,
            }}
          >
            <h3 style={{ marginTop: 0, fontWeight: 500 }}>{t.importTransactions}</h3>
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
                {t.currencyLabel}
                <select
                  value={importCurrency}
                  onChange={(e) =>
                    setImportCurrency(e.target.value as TxnCurrency)
                  }
                  aria-label={t.importCurrencyAria}
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
                  <option value="EUR">EUR (€)</option>
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
                {t.sourceLabel}
                <select
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  aria-label={t.importSourceAria}
                  style={{
                    padding: "6px 8px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: `1px solid ${tokens.colors.border}`,
                    background: "white",
                  }}
                >
                  <option value="">{t.unspecified}</option>
                  {Object.entries(SOURCE_CHIPS).map(([key, chip]) => (
                    <option key={key} value={key}>
                      {chip.label}
                    </option>
                  ))}
                </select>
              </label>
              {importing && <span>{t.importingWithAI}</span>}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleCategorize} disabled={categorizing || recategorizing}>
                {categorizing ? t.categorizing : t.categorizeWithAI}
              </button>
              <button
                onClick={handleRecategorize}
                disabled={categorizing || recategorizing}
                title="Relabel old movements stuck in 'Otros'"
              >
                {recategorizing ? t.recategorizing : t.recategorizeAll}
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

          {/* KPI metric cards: Spent / Income / Saved / Forecast. Only shown
              once the backend has data to analyze. */}
          {insights && (
            <>
            {/* Display-currency override: which currency the totals below are
                shown in. Defaults to the user's most-common transaction
                currency; this only relabels the single-number roll-ups (no
                conversion). Discreet, right-aligned above the KPI cards. */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 6,
                marginTop: tokens.spacing.lg,
                fontSize: 13,
                color: tokens.colors.textMuted,
              }}
            >
              <label
                htmlFor="display-currency"
                style={{ display: "flex", gap: 6, alignItems: "center" }}
              >
                {t.showIn}:
                <select
                  id="display-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  aria-label={t.displayCurrencyAria}
                  style={{
                    padding: "4px 8px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: `1px solid ${tokens.colors.border}`,
                    background: tokens.colors.cardBg,
                    color: tokens.colors.text,
                  }}
                >
                  {DISPLAY_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {DISPLAY_CURRENCY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr 1fr"
                  : "repeat(auto-fit, minmax(160px, 1fr))",
                gap: tokens.spacing.md,
                marginTop: tokens.spacing.md,
              }}
            >
              <KpiCard
                label={t.income}
                value={formatCurrency(insights.totalIncome, currency)}
              />
              <KpiCard
                label={t.spent}
                value={formatCurrency(insights.totalSpend, currency)}
              />
              <KpiCard
                label={t.saved}
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
                      ? t.positiveBalance
                      : t.negativeBalance,
                }}
              />
              <KpiCard
                label={t.forecastNextMonth}
                value={formatCurrency(insights.forecastNextMonth, currency)}
              />
            </div>
            </>
          )}

          <section style={{ marginTop: 16 }}>
            <WeeklyRecap />
          </section>

          {/* Tus billeteras — directly after Esta semana, same section treatment. */}
          <section style={{ marginTop: 16 }}>
            <WalletSplit
              pen={penTotal}
              usd={usdTotal}
              eur={eurTotal}
              currency={currency}
            />
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
              {t.yapePlinTitle}
            </h3>
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                color: tokens.colors.textMuted,
              }}
            >
              {t.yapePlinSub}
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
                    {t.spentSent}
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
                    {w.count === 1 ? t.transactionSingular : t.transactionPlural}
                    {w.inc > 0
                      ? ` · ${t.received} ${formatCurrency(w.inc, currency)}`
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
                {t.incomeBySource}
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

          {/* Origin-style spend heatmap for the current month, in the display
              currency (so a EUR user sees their euro spend). */}
          <SpendCalendar transactions={txns} displayCurrency={currency} />

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

          <section style={{ marginTop: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontWeight: 500 }}>
                {t.yourTransactions} ({txns.length})
              </h3>
              <button onClick={() => setEditor({ mode: "add" })}>
                + {t.addTransaction}
              </button>
            </div>
            {txns.length === 0 ? (
              <p style={{ color: tokens.colors.textMuted }}>
                {t.noTransactions}
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
                {txns.slice(0, visibleCount).map((txn) => {
                  const amount = Number(txn.amount);
                  return (
                    <div
                      key={txn.id}
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
                          {txn.date}
                        </span>
                        <strong
                          style={{
                            color: amount < 0 ? "crimson" : "green",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatCurrency(amount, txn.currency)}
                        </strong>
                      </div>
                      <div style={{ fontWeight: 500 }}>{txn.description}</div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        <SourceBadge source={txn.source} />
                        <CurrencyBadge currency={txn.currency} />
                        <span
                          style={{
                            fontSize: 12,
                            color: tokens.colors.textMuted,
                          }}
                        >
                          {categoryLabel(txn.category, lang)}
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
                          onClick={() => setEditor({ mode: "edit", txn })}
                          style={{ fontSize: 12, padding: "4px 10px" }}
                        >
                          {t.edit}
                        </button>
                        <button
                          onClick={() => handleDeleteTxn(txn.id)}
                          style={{
                            fontSize: 12,
                            padding: "4px 10px",
                            color: "crimson",
                          }}
                        >
                          {t.delete}
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
                    <th style={{ padding: 8 }}>{t.thDate}</th>
                    <th style={{ padding: 8 }}>{t.thDescription}</th>
                    <th style={{ padding: 8, textAlign: "right" }}>{t.thAmount}</th>
                    <th style={{ padding: 8 }}>{t.thCategory}</th>
                    <th style={{ padding: 8, textAlign: "right" }}>{t.thActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.slice(0, visibleCount).map((txn) => {
                    const amount = Number(txn.amount);
                    return (
                      <tr
                        key={txn.id}
                        style={{
                          borderBottom: `1px solid ${tokens.colors.border}`,
                        }}
                      >
                        <td style={{ padding: 8 }}>{txn.date}</td>
                        <td style={{ padding: 8 }}>
                          {txn.description}
                          <SourceBadge source={txn.source} />
                          <CurrencyBadge currency={txn.currency} />
                        </td>
                        <td
                          style={{
                            padding: 8,
                            textAlign: "right",
                            color: amount < 0 ? "crimson" : "green",
                          }}
                        >
                          {formatCurrency(amount, txn.currency)}
                        </td>
                        <td style={{ padding: 8, color: tokens.colors.textMuted }}>
                          {categoryLabel(txn.category, lang)}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => setEditor({ mode: "edit", txn })}
                            style={{ fontSize: 12, padding: "2px 8px" }}
                          >
                            {t.edit}
                          </button>
                          <button
                            onClick={() => handleDeleteTxn(txn.id)}
                            style={{
                              fontSize: 12,
                              padding: "2px 8px",
                              marginLeft: 6,
                              color: "crimson",
                            }}
                          >
                            {t.delete}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {txns.length > visibleCount && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setVisibleCount((n) => n + 10)}>
                  {t.seeMoreTransactions} ({t.remaining(txns.length - visibleCount)})
                </button>
              </div>
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
  const symbol = currency === "PEN" ? "S/" : currency === "EUR" ? "€" : "US$";
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
      {symbol}
    </span>
  );
}

// Symbol-annotated labels for the display-currency selector, so the option text
// reads "PEN (S/)" / "USD (US$)" / "EUR (€)" like the import-currency dropdown.
const DISPLAY_CURRENCY_LABELS: Record<Currency, string> = {
  PEN: "PEN (S/)",
  USD: "USD (US$)",
  EUR: "EUR (€)",
  AUD: "AUD (A$)",
};

// Tab definitions, kept module-level so the render loop stays declarative. The
// labels come from the active language's strings (passed in) so the bar
// translates without restructuring the loop.
function tabsFor(t: (typeof T)[keyof typeof T]): { id: Tab; label: string }[] {
  return [
    { id: "overview", label: t.tabOverview },
    { id: "analisis", label: t.tabAnalytics },
    { id: "suscripciones", label: t.tabSubscriptions },
    { id: "budgets", label: t.tabBudgets },
    { id: "goals", label: t.tabGoals },
  ];
}

// Per-component translations. The `es` values are the EXACT Spanish text this
// page shipped with (do not reword); `en` is the new English. Brand names
// (Yape, Plin), currency symbols (S/, US$) and category KEYS are not translated.
const T = {
  es: {
    signOut: "Cerrar sesión",
    sectionAria: "Sección",
    tabOverview: "Resumen",
    tabAnalytics: "📊 Análisis",
    tabSubscriptions: "Suscripciones",
    tabBudgets: "Presupuestos",
    tabGoals: "Metas",
    income: "Ingresos",
    spent: "Gastado",
    saved: "Ahorrado",
    positiveBalance: "Saldo positivo",
    negativeBalance: "Saldo negativo",
    forecastNextMonth: "Pronóstico próximo mes",
    yapePlinTitle: "Yape y Plin",
    yapePlinSub: "Lo que has gastado y enviado por cada billetera.",
    spentSent: "Gastado / enviado",
    transactionSingular: "movimiento",
    transactionPlural: "movimientos",
    received: "recibido",
    incomeBySource: "Ingresos por fuente",
    importTransactions: "Importar movimientos",
    currencyLabel: "Moneda",
    importCurrencyAria: "Moneda de importación",
    sourceLabel: "Origen",
    importSourceAria: "Origen de importación",
    unspecified: "Sin especificar",
    importingWithAI: "Importando y categorizando con IA…",
    categorizing: "Categorizando…",
    categorizeWithAI: "Categorizar con IA",
    recategorizing: "Re-categorizando…",
    recategorizeAll: "Re-categorizar todo",
    yourTransactions: "Tus movimientos",
    addTransaction: "Agregar movimiento",
    noTransactions: "Aún no hay movimientos — importa un CSV arriba.",
    edit: "Editar",
    delete: "Eliminar",
    thDate: "Fecha",
    thDescription: "Descripción",
    thAmount: "Monto",
    thCategory: "Categoría",
    thActions: "Acciones",
    seeMoreTransactions: "Ver más movimientos",
    remaining: (n: number) => `${n} restantes`,
    showIn: "Mostrar en",
    displayCurrencyAria: "Moneda a mostrar",
  },
  en: {
    signOut: "Sign out",
    sectionAria: "Section",
    tabOverview: "Overview",
    tabAnalytics: "📊 Analytics",
    tabSubscriptions: "Subscriptions",
    tabBudgets: "Budgets",
    tabGoals: "Goals",
    income: "Income",
    spent: "Spent",
    saved: "Saved",
    positiveBalance: "Positive balance",
    negativeBalance: "Negative balance",
    forecastNextMonth: "Next-month forecast",
    yapePlinTitle: "Yape & Plin",
    yapePlinSub: "What you've spent and sent through each wallet.",
    spentSent: "Spent / sent",
    transactionSingular: "transaction",
    transactionPlural: "transactions",
    received: "received",
    incomeBySource: "Income by source",
    importTransactions: "Import transactions",
    currencyLabel: "Currency",
    importCurrencyAria: "Import currency",
    sourceLabel: "Source",
    importSourceAria: "Import source",
    unspecified: "Unspecified",
    importingWithAI: "Importing and categorizing with AI…",
    categorizing: "Categorizing…",
    categorizeWithAI: "Categorize with AI",
    recategorizing: "Re-categorizing…",
    recategorizeAll: "Re-categorize all",
    yourTransactions: "Your transactions",
    addTransaction: "Add transaction",
    noTransactions: "No transactions yet — import a CSV above.",
    edit: "Edit",
    delete: "Delete",
    thDate: "Date",
    thDescription: "Description",
    thAmount: "Amount",
    thCategory: "Category",
    thActions: "Actions",
    seeMoreTransactions: "See more transactions",
    remaining: (n: number) => `${n} remaining`,
    showIn: "Show in",
    displayCurrencyAria: "Display currency",
  },
} as const;
