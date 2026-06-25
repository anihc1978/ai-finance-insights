// src/components/SpendCalendar.tsx
// ---------------------------------------------------------------------------
// Origin-style spend heatmap with month navigation. Each day cell shows the day
// number plus that day's total SPEND in soles (sum of -amount for PEN rows on
// that date), shaded as a teal heatmap — more spend = stronger fill. Empty days
// stay faint. Weekday-aligned (Lun..Dom), with the Spanish month name + total.
// The viewed month is navigable with ‹ / › chevrons; it seeds from the latest
// month that actually has spend (else the current month). Presentational only —
// caller passes the raw transactions and the calendar groups them client-side.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { tokens } from "../lib/theme";
import { formatCurrency } from "../lib/format";
import { useLang } from "../lib/i18n";

const T = {
  es: {
    weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"],
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
    calendar: "Calendario",
    prevMonth: "Mes anterior",
    nextMonth: "Mes siguiente",
    hideCalendar: "Ocultar calendario",
    noSpending: "sin gasto",
  },
  en: {
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    months: [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ],
    calendar: "Calendar",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    hideCalendar: "Hide calendar",
    noSpending: "no spending",
  },
} as const;

// True on phone-width screens. Day cells are only ~40px wide on a phone, far too
// narrow for a "S/ 1,200.00" label, so on mobile we drop the per-cell amount and
// rely on the heat colour + the tap tooltip instead.
function useIsMobile(): boolean {
  const [m, setM] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const on = () => setM(mql.matches);
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return m;
}

interface SpendCalendarProps {
  transactions: { date: string; amount: number; currency: string }[];
}

// JS getDay(): 0=Sun..6=Sat. We want Monday-first (0=Mon..6=Sun) so the grid
// lines up under the Lun..Dom headers.
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// "YYYY-MM" for a 0-based month.
function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

// Latest "YYYY-MM" among PEN spend rows, else the current month.
function initialViewMonth(
  transactions: SpendCalendarProps["transactions"]
): string {
  let latest = "";
  for (const t of transactions) {
    if (t.currency !== "PEN") continue;
    if (Number(t.amount) >= 0) continue; // income/transfers in — not spend
    const ym = t.date.slice(0, 7); // "YYYY-MM"
    if (ym.length === 7 && ym > latest) latest = ym;
  }
  if (latest) return latest;
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth());
}

export function SpendCalendar({ transactions }: SpendCalendarProps) {
  const t = T[useLang()];
  const [viewMonth, setViewMonth] = useState<string>(() =>
    initialViewMonth(transactions)
  );
  const isMobile = useIsMobile();
  // On phones the calendar grid is tall, so it starts collapsed — tap to expand.
  const [open, setOpen] = useState(false);
  // The day the user tapped, so we can show its amount (mobile cells hide it).
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const [yStr, mStr] = viewMonth.split("-");
  const year = Number(yStr);
  const month = Number(mStr) - 1; // 0-based

  // Step the viewed month back/forward, normalising year rollover.
  function shiftMonth(delta: number): void {
    const next = new Date(year, month + delta, 1);
    setViewMonth(monthKey(next.getFullYear(), next.getMonth()));
    setSelectedDay(null);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // How many blank cells before day 1 so the 1st sits under its weekday.
  const leadingBlanks = mondayIndex(new Date(year, month, 1).getDay());

  // Sum spend (positive number of soles) per day-of-month for PEN rows in the
  // viewed month. amount is negative for spend, so we negate and keep only the
  // outflows.
  const spendByDay: Record<number, number> = {};
  for (const t of transactions) {
    if (t.currency !== "PEN") continue;
    const amount = Number(t.amount);
    if (amount >= 0) continue; // income/transfers in — not spend
    // Parse "YYYY-MM-DD" without timezone drift.
    const [ty, tm, td] = t.date.split("-").map(Number);
    if (ty !== year || tm !== month + 1 || !td) continue;
    spendByDay[td] = (spendByDay[td] ?? 0) + -amount;
  }

  const monthTotal = Object.values(spendByDay).reduce((s, v) => s + v, 0);
  const maxDay = Math.max(0, ...Object.values(spendByDay));

  // Heatmap fill: a vivid spend-heat ramp derived from the theme accent so it
  // re-themes in light/dark. We mix the accent INTO the surface, starting at a
  // clearly-tinted 40% floor (so even the smallest spend reads as "spent") and
  // ramping to a solid, saturated 100% accent on the busiest day. Mixing in
  // srgb against the surface (not a low alpha over white) keeps the strong end
  // bold instead of washed out.
  function cellBg(spend: number): string {
    // No-spend days sit on the white card background (cardBg = #FFFFFF in light,
    // dark card colour in dark) so spent days pop against a clean white grid.
    if (spend <= 0) return tokens.colors.cardBg;
    const ratio = maxDay > 0 ? spend / maxDay : 0;
    // 40%..100% accent — a strong floor so busy days clearly stand out.
    const pct = Math.round(40 + ratio * 60);
    return `color-mix(in srgb, ${tokens.colors.accent} ${pct}%, ${tokens.colors.surface})`;
  }

  // Switch to white text once the accent fill gets saturated enough to keep the
  // day number legible (the ramp goes dark/vivid quickly, so flip early).
  function cellText(spend: number): string {
    if (spend <= 0) return tokens.colors.text;
    const ratio = maxDay > 0 ? spend / maxDay : 0;
    return ratio > 0.35 ? "#FFFFFF" : tokens.colors.text;
  }

  // Build the cell list: leading blanks then each day.
  const cells: ({ day: number; spend: number } | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, spend: spendByDay[d] ?? 0 });
  }

  // Shared chevron button style — square, hairline, themes via tokens.
  const chevronStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
    color: tokens.colors.textMuted,
    background: tokens.colors.surface,
    border: `1px solid ${tokens.colors.border}`,
    borderRadius: tokens.radii.input,
    padding: 0,
  };

  return (
    <section
      style={{
        marginTop: tokens.spacing.lg,
        padding: tokens.spacing.md,
        background: tokens.colors.cardBg,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: tokens.radii.card,
      }}
    >
      {isMobile && !open ? (
        // Collapsed on mobile: a compact tappable bar so the tall grid doesn't
        // eat the screen. Tap to expand.
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: tokens.spacing.sm,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: tokens.colors.text,
            font: "inherit",
          }}
        >
          <span style={{ fontWeight: 500, textTransform: "capitalize" }}>
            {t.calendar} · {t.months[month]} {year}
          </span>
          <span
            style={{
              fontWeight: 500,
              color: tokens.colors.accent,
              whiteSpace: "nowrap",
            }}
          >
            {formatCurrency(monthTotal, "PEN")} ›
          </span>
        </button>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: tokens.spacing.md,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm }}>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                title={t.prevMonth}
                aria-label={t.prevMonth}
                style={chevronStyle}
              >
                ‹
              </button>
              <h3
                style={{
                  margin: 0,
                  minWidth: 130,
                  textAlign: "center",
                  fontSize: 15,
                  fontWeight: 500,
                  color: tokens.colors.text,
                  textTransform: "capitalize",
                }}
              >
                {t.months[month]} {year}
              </h3>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                title={t.nextMonth}
                aria-label={t.nextMonth}
                style={chevronStyle}
              >
                ›
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: tokens.spacing.sm }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: tokens.colors.accent }}>
                {formatCurrency(monthTotal, "PEN")}
              </span>
              {isMobile && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  title={t.hideCalendar}
                  aria-label={t.hideCalendar}
                  style={chevronStyle}
                >
                  ▾
                </button>
              )}
            </div>
          </div>

          {/* Weekday headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 6,
              marginBottom: 6,
            }}
          >
            {t.weekdays.map((w) => (
              <div
                key={w}
                style={{
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 500,
                  color: tokens.colors.textMuted,
                }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 6,
            }}
          >
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={`blank-${i}`} />;
              }
              const hasSpend = cell.spend > 0;
              const isSelected = selectedDay === cell.day;
              return (
                <div
                  key={cell.day}
                  onClick={() => setSelectedDay(cell.day)}
                  title={
                    hasSpend
                      ? `${cell.day}: ${formatCurrency(cell.spend, "PEN")}`
                      : `${cell.day}: ${t.noSpending}`
                  }
                  style={{
                    minHeight: 56,
                    padding: 6,
                    borderRadius: tokens.radii.input,
                    background: cellBg(cell.spend),
                    border: isSelected
                      ? `2px solid ${tokens.colors.accent}`
                      : `1px solid ${tokens.colors.border}`,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    color: cellText(cell.spend),
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{cell.day}</span>
                  {hasSpend && !isMobile && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatCurrency(cell.spend, "PEN")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tap-a-day readout — mobile cells don't show the amount inline. */}
          {isMobile && selectedDay != null && (
            <div style={{ marginTop: 10, fontSize: 13, color: tokens.colors.textMuted }}>
              <strong
                style={{ color: tokens.colors.text, textTransform: "capitalize" }}
              >
                {selectedDay} {t.months[month]}
              </strong>
              {": "}
              {spendByDay[selectedDay]
                ? formatCurrency(spendByDay[selectedDay], "PEN")
                : t.noSpending}
            </div>
          )}
        </>
      )}
    </section>
  );
}
