// src/components/WalletSplit.tsx
// ---------------------------------------------------------------------------
// A per-currency wallets card showing the Soles (S/), Dollars (US$) and Euros
// (€) totals side by side. Each wallet is shown in its OWN native currency so
// the split is unambiguous — totals are never summed across currencies. A
// wallet with a zero total is hidden to avoid clutter (e.g. a Peru-only user
// won't see empty € / US$ cards). Presentational only.
// ---------------------------------------------------------------------------
import { formatCurrency, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";
import { useLang } from "../lib/i18n";

const T = {
  es: { wallets: "Tus billeteras", soles: "Soles", dollars: "Dólares", euros: "Euros" },
  en: { wallets: "Your wallets", soles: "Soles", dollars: "Dollars", euros: "Euros" },
} as const;

interface WalletSplitProps {
  pen: number;
  usd: number;
  eur: number;
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

export function WalletSplit({ pen, usd, eur }: WalletSplitProps) {
  const t = T[useLang()];
  // One wallet per currency, in its own denomination. Hide a wallet whose total
  // is exactly 0 so single-currency users don't see empty cards — but always
  // keep at least Soles so the card never renders empty.
  const wallets: { label: string; amount: number; cur: Currency }[] = [
    { label: t.soles, amount: pen, cur: "PEN" },
    { label: t.dollars, amount: usd, cur: "USD" },
    { label: t.euros, amount: eur, cur: "EUR" },
  ];
  const shown = wallets.filter((w) => w.amount !== 0);
  const visible = shown.length > 0 ? shown : [wallets[0]];
  return (
    <section style={cardStyle}>
      <h3 style={{ marginTop: 0, fontSize: 15, fontWeight: 500, color: tokens.colors.text }}>
        {t.wallets}
      </h3>
      <div style={{ display: "flex", gap: tokens.spacing.md }}>
        {visible.map((w) => (
          <Wallet
            key={w.cur}
            label={w.label}
            amount={w.amount}
            walletCurrency={w.cur}
          />
        ))}
      </div>
    </section>
  );
}
