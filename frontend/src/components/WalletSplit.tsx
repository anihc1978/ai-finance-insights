// src/components/WalletSplit.tsx
// ---------------------------------------------------------------------------
// A two-wallets card showing the Soles (S/) total and the Dollars (US$) total
// side by side. Each wallet is shown in its own native currency so the dual-
// currency split is unambiguous. Presentational only.
// ---------------------------------------------------------------------------
import { formatCurrency, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";
import { useLang } from "../lib/i18n";

const T = {
  es: { wallets: "Tus billeteras", soles: "Soles", dollars: "Dólares" },
  en: { wallets: "Your wallets", soles: "Soles", dollars: "Dollars" },
} as const;

interface WalletSplitProps {
  pen: number;
  usd: number;
  // Display base currency (kept for contract consistency); each wallet is shown
  // in its own native currency regardless.
  currency: Currency;
}

const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
};

interface WalletProps {
  label: string;
  amount: number;
  walletCurrency: Currency;
}

function Wallet({ label, amount, walletCurrency }: WalletProps) {
  return (
    <div
      style={{
        flex: 1,
        background: tokens.colors.surface,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.card,
        padding: tokens.spacing.md,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacing.xs,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 400, color: tokens.colors.textMuted }}>
        {label}
      </span>
      <span style={{ fontSize: 24, fontWeight: 500, color: tokens.colors.text }}>
        {formatCurrency(amount, walletCurrency)}
      </span>
    </div>
  );
}

export function WalletSplit({ pen, usd }: WalletSplitProps) {
  const t = T[useLang()];
  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 500, color: tokens.colors.text }}>
        {t.wallets}
      </h3>
      <div style={{ display: "flex", gap: tokens.spacing.md }}>
        <Wallet label={t.soles} amount={pen} walletCurrency="PEN" />
        <Wallet label={t.dollars} amount={usd} walletCurrency="USD" />
      </div>
    </section>
  );
}
