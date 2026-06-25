// src/components/TransactionEditor.tsx
// ---------------------------------------------------------------------------
// A small inline modal to ADD or EDIT one transaction by hand (Origin-style
// manual entry). On submit it POSTs (add) or PATCHes (edit) /transactions and
// calls onSaved so the parent can refresh. All labels in Peruvian Spanish.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { apiPost, apiPatch } from "../lib/api";
import { tokens } from "../lib/theme";
import { categoryLabel } from "../lib/format";
import { useLang } from "../lib/i18n";

const T = {
  es: {
    addTitle: "Agregar movimiento",
    editTitle: "Editar movimiento",
    date: "Fecha",
    description: "Descripción",
    descPlaceholder: "Ej. Compras en el mercado",
    amount: "Monto (negativo = gasto)",
    currency: "Moneda",
    category: "Categoría",
    noCategory: "Sin categoría",
    applySimilar: "Aplicar a movimientos parecidos",
    cancel: "Cancelar",
    saving: "Guardando…",
    save: "Guardar",
    errDate: "Ingresa una fecha.",
    errDesc: "Ingresa una descripción.",
    errAmount: "Ingresa un monto (negativo = gasto).",
  },
  en: {
    addTitle: "Add transaction",
    editTitle: "Edit transaction",
    date: "Date",
    description: "Description",
    descPlaceholder: "E.g. Groceries at the market",
    amount: "Amount (negative = expense)",
    currency: "Currency",
    category: "Category",
    noCategory: "Unspecified",
    applySimilar: "Apply to similar transactions",
    cancel: "Cancel",
    saving: "Saving…",
    save: "Save",
    errDate: "Enter a date.",
    errDesc: "Enter a description.",
    errAmount: "Enter an amount (negative = expense).",
  },
} as const;

type TxnCurrency = "PEN" | "USD";

interface TransactionInitial {
  id?: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  currency: TxnCurrency;
}

interface TransactionEditorProps {
  mode: "add" | "edit";
  initial?: TransactionInitial;
  onSaved: () => void;
  onClose: () => void;
}

// The backend category keys (English in the DB), shown via categoryLabel.
const CATEGORY_KEYS = [
  "Groceries",
  "Dining",
  "Transport",
  "Utilities",
  "Housing",
  "Shopping",
  "Entertainment",
  "Health",
  "Travel",
  "Subscriptions",
  "Income",
  "Transfers",
  "Other",
];

// Today as "YYYY-MM-DD" for the default date when adding.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputStyle: React.CSSProperties = {
  padding: 8,
  fontSize: 14,
  borderRadius: tokens.radii.input,
  border: `1px solid ${tokens.colors.border}`,
  background: "white",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: tokens.colors.textMuted,
  display: "block",
  marginBottom: 4,
};

export function TransactionEditor({
  mode,
  initial,
  onSaved,
  onClose,
}: TransactionEditorProps) {
  const lang = useLang();
  const t = T[lang];
  const [date, setDate] = useState(initial?.date ?? today());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(
    initial ? String(initial.amount) : "",
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [currency, setCurrency] = useState<TxnCurrency>(
    initial?.currency ?? "PEN",
  );
  // "Aplicar a movimientos parecidos": when editing and the user picks a
  // category, this creates a rule so future similar movements auto-categorize.
  const [applySimilar, setApplySimilar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const numericAmount = Number(amount);
    if (!date) {
      setError(t.errDate);
      return;
    }
    if (!description.trim()) {
      setError(t.errDesc);
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
      setError(t.errAmount);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        date,
        description: description.trim(),
        amount: numericAmount,
        category: category || null,
        currency,
      };
      if (mode === "add") {
        await apiPost<typeof body, { transaction: unknown }>(
          "/transactions",
          body,
        );
      } else if (initial?.id) {
        await apiPatch<typeof body, { transaction: unknown }>(
          `/transactions/${initial.id}`,
          body,
        );
        // "Aplicar a movimientos parecidos": also create a rule so future
        // similar movements auto-categorize. Only meaningful with a category.
        if (applySimilar && body.category) {
          await apiPost<{ category: string }, unknown>(
            `/transactions/${initial.id}/categorize-similar`,
            { category: body.category },
          );
        }
      }
      onSaved();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      // Backdrop — clicking outside the card closes the editor.
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: tokens.spacing.md,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: tokens.colors.cardBg,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.radii.card,
          padding: tokens.spacing.lg,
        }}
      >
        <h3
          style={{
            marginTop: 0,
            fontSize: 16,
            fontWeight: 500,
            color: tokens.colors.text,
          }}
        >
          {mode === "add" ? t.addTitle : t.editTitle}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacing.md }}>
          <div>
            <label style={labelStyle} htmlFor="txn-date">
              {t.date}
            </label>
            <input
              id="txn-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="txn-desc">
              {t.description}
            </label>
            <input
              id="txn-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.descPlaceholder}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: tokens.spacing.md }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle} htmlFor="txn-amount">
                {t.amount}
              </label>
              <input
                id="txn-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="-50.00"
                style={inputStyle}
              />
            </div>
            <div style={{ width: 120 }}>
              <label style={labelStyle} htmlFor="txn-currency">
                {t.currency}
              </label>
              <select
                id="txn-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as TxnCurrency)}
                style={inputStyle}
              >
                <option value="PEN">PEN (S/)</option>
                <option value="USD">USD (US$)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle} htmlFor="txn-category">
              {t.category}
            </label>
            <select
              id="txn-category"
              value={category ?? ""}
              onChange={(e) => setCategory(e.target.value)}
              style={inputStyle}
            >
              <option value="">{t.noCategory}</option>
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {categoryLabel(key, lang)}
                </option>
              ))}
            </select>
            {mode === "edit" && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: tokens.spacing.sm,
                  fontSize: 13,
                  color: tokens.colors.textMuted,
                  cursor: category ? "pointer" : "not-allowed",
                  opacity: category ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={applySimilar}
                  disabled={!category}
                  onChange={(e) => setApplySimilar(e.target.checked)}
                />
                {t.applySimilar}
              </label>
            )}
          </div>
        </div>

        {error && (
          <p style={{ color: "crimson", fontSize: 13, marginTop: tokens.spacing.md }}>
            Error: {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: tokens.spacing.sm,
            marginTop: tokens.spacing.lg,
          }}
        >
          <button onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button onClick={handleSubmit} disabled={busy}>
            {busy ? t.saving : t.save}
          </button>
        </div>
      </div>
    </div>
  );
}
