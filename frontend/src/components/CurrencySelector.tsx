// src/components/CurrencySelector.tsx
// ---------------------------------------------------------------------------
// A small USD/AUD/PEN dropdown. Controlled component: the parent owns the
// value and persists changes (the Dashboard PUTs /profile on change).
// ---------------------------------------------------------------------------
import type { ChangeEvent } from "react";
import type { Currency } from "../lib/format";

interface CurrencySelectorProps {
  value: Currency;
  onChange: (c: Currency) => void;
}

const CURRENCIES: Currency[] = ["USD", "AUD", "PEN"];

export function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    onChange(e.target.value as Currency);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      aria-label="Display currency"
      style={{
        padding: "6px 8px",
        fontSize: 14,
        borderRadius: 6,
        border: "1px solid #ccc",
        background: "white",
      }}
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
