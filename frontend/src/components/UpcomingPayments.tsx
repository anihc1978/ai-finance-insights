// src/components/UpcomingPayments.tsx
// ---------------------------------------------------------------------------
// "Próximos pagos" — un panel de recordatorios de pagos que une DOS fuentes en
// una sola lista ordenada por fecha de vencimiento:
//   (1) recordatorios MANUALES que el usuario agrega (localStorage
//       "fin_recordatorios"): luz, internet, alquiler, tarjeta…
//   (2) cargos recurrentes AUTOMÁTICOS detectados por GET /subscriptions.
// Muestra badges de urgencia, una franja de alerta arriba cuando algo vence en
// ≤3 días, y un aviso opcional del navegador (Notification) que degrada con
// elegancia si no está disponible o el permiso fue denegado.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api";
import { formatCurrency } from "../lib/format";
import { tokens } from "../lib/theme";
import { useLang, type Lang } from "../lib/i18n";

const T = {
  es: {
    vencido: "Vencido",
    venceHoy: "Vence hoy",
    enDia: (d: number) => `En ${d} ${d === 1 ? "día" : "días"}`,
    pagoProximo: "pago próximo",
    pagosProximos: "pagos próximos",
    tienes: "Tienes",
    vencidoLower: "vencido",
    hoy: "hoy",
    enDiasLower: (d: number) => `en ${d} ${d === 1 ? "día" : "días"}`,
    nombrePh: "Nombre (Luz, Internet, Alquiler…)",
    montoPh: "Monto (opcional)",
    diaPh: "Día",
    diaAria: "Día de pago (1-31)",
    repiteCadaMes: "Se repite cada mes",
    agregar: "Agregar",
    sinPagos:
      "Aún no tienes pagos próximos. Agrega un recordatorio (luz, internet, alquiler…).",
    auto: "auto",
    manual: "manual",
    eliminar: (n: string) => `Eliminar ${n}`,
    eliminarTitle: "Eliminar",
    avisarme: "Avisarme en el navegador",
    noDisponible: " (no disponible en este navegador)",
    // notificación del navegador
    notifTitle: "Próximos pagos",
    notifManana: "mañana",
    notifBody: (resumen: string) => `Tienes pagos por vencer: ${resumen}`,
  },
  en: {
    vencido: "Overdue",
    venceHoy: "Due today",
    enDia: (d: number) => `In ${d} ${d === 1 ? "day" : "days"}`,
    pagoProximo: "upcoming payment",
    pagosProximos: "upcoming payments",
    tienes: "You have",
    vencidoLower: "overdue",
    hoy: "today",
    enDiasLower: (d: number) => `in ${d} ${d === 1 ? "day" : "days"}`,
    nombrePh: "Name (Power, Internet, Rent…)",
    montoPh: "Amount (optional)",
    diaPh: "Day",
    diaAria: "Payment day (1-31)",
    repiteCadaMes: "Repeats monthly",
    agregar: "Add",
    sinPagos:
      "No upcoming payments yet. Add a reminder (power, internet, rent…).",
    auto: "auto",
    manual: "manual",
    eliminar: (n: string) => `Delete ${n}`,
    eliminarTitle: "Delete",
    avisarme: "Notify me in the browser",
    noDisponible: " (not available in this browser)",
    notifTitle: "Upcoming payments",
    notifManana: "tomorrow",
    notifBody: (resumen: string) => `You have payments due soon: ${resumen}`,
  },
} as const;

// --- Tono ámbar para "vence pronto" (no existe en tokens; constante local). ---
const WARNING = "#EF9F27";

// --- Recordatorio manual persistido en localStorage. -----------------------
interface Recordatorio {
  id: string;
  nombre: string;
  monto: number | null;
  dia: number; // día del mes (1-31)
  recurrenteMensual: boolean;
}

// --- /subscriptions: cargos recurrentes detectados. ------------------------
interface Subscription {
  name: string;
  amount: number;
  occurrences: number;
  last_date: string;
  next_estimated: string;
  category: string | null;
}
interface SubsResponse {
  subscriptions: Subscription[];
  monthly_total: number;
}

// --- Fila unificada que renderizamos en la lista. --------------------------
interface UpcomingItem {
  key: string;
  nombre: string;
  monto: number | null;
  due: Date; // fecha de vencimiento (medianoche local)
  diasRestantes: number; // negativo = vencido, 0 = hoy
  origen: "manual" | "auto";
  recordatorioId?: string; // sólo para los manuales (borrables)
}

const STORAGE_KEY = "fin_recordatorios";
const NOTIF_KEY = "fin_notif_on";

// --- Fecha de hoy a medianoche local (para comparar sólo por día). ---------
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// --- Días de calendario entre hoy y una fecha (negativo = ya pasó). --------
function daysUntil(due: Date): number {
  const ms = due.getTime() - startOfToday().getTime();
  return Math.round(ms / 86_400_000);
}

// --- Último día de un mes dado (para no pedir 31 en febrero). --------------
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// --- Próxima fecha de vencimiento de un recordatorio manual. ---------------
// El `dia` de este mes si es hoy o más adelante; si no, el `dia` del próximo
// mes. El día se acota a la longitud del mes correspondiente.
function nextDueForReminder(dia: number): Date {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = today.getMonth();

  const diaEsteMes = Math.min(dia, lastDayOfMonth(y, m));
  const esteMes = new Date(y, m, diaEsteMes);
  if (esteMes.getTime() >= today.getTime()) return esteMes;

  const nm = m + 1; // Date normaliza diciembre→enero del próximo año
  const diaProxMes = Math.min(dia, lastDayOfMonth(y, nm));
  return new Date(y, nm, diaProxMes);
}

// --- Parseo seguro de "YYYY-MM-DD" a fecha local a medianoche. -------------
function parseISODate(iso: string): Date | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// --- localStorage: leer recordatorios (tolerante a datos corruptos). -------
function loadReminders(): Recordatorio[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is Recordatorio =>
        r &&
        typeof r.id === "string" &&
        typeof r.nombre === "string" &&
        typeof r.dia === "number",
    );
  } catch {
    return [];
  }
}

function saveReminders(list: Recordatorio[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage puede no estar disponible (modo privado); no es fatal.
  }
}

// --- Texto/colores del badge de urgencia. ----------------------------------
function urgency(
  item: UpcomingItem,
  t: (typeof T)[Lang],
  lang: Lang,
): { label: string; color: string } {
  const d = item.diasRestantes;
  if (d < 0) return { label: t.vencido, color: tokens.colors.down };
  if (d === 0) return { label: t.venceHoy, color: tokens.colors.down };
  if (d <= 5) return { label: t.enDia(d), color: WARNING };
  // Más adelante: fecha formateada según el idioma, tono neutro.
  return {
    label: item.due.toLocaleDateString(lang === "en" ? "en-US" : "es-PE", {
      day: "numeric",
      month: "short",
    }),
    color: tokens.colors.textMuted,
  };
}

export function UpcomingPayments() {
  const lang = useLang();
  const t = T[lang];
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>(() =>
    loadReminders(),
  );
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [notifOn, setNotifOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NOTIF_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Campos del formulario de "agregar recordatorio".
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [dia, setDia] = useState("");
  const [recurrente, setRecurrente] = useState(true);

  // Cargar cargos recurrentes (degrada a lista vacía si falla).
  useEffect(() => {
    apiGet<SubsResponse>("/subscriptions")
      .then((d) => setSubs(d.subscriptions ?? []))
      .catch(() => setSubs([]));
  }, []);

  // Construir y ordenar la lista unificada.
  const items = useMemo<UpcomingItem[]>(() => {
    const manual: UpcomingItem[] = recordatorios.map((r) => {
      const due = nextDueForReminder(r.dia);
      return {
        key: `manual-${r.id}`,
        nombre: r.nombre,
        monto: r.monto,
        due,
        diasRestantes: daysUntil(due),
        origen: "manual",
        recordatorioId: r.id,
      };
    });

    const auto: UpcomingItem[] = [];
    for (const s of subs) {
      const due = parseISODate(s.next_estimated);
      if (!due) continue;
      const dleft = daysUntil(due);
      if (dleft < 0) continue; // sólo cargos de hoy en adelante
      auto.push({
        key: `auto-${s.name}-${s.next_estimated}`,
        nombre: s.name,
        monto: s.amount,
        due,
        diasRestantes: dleft,
        origen: "auto",
      });
    }

    return [...manual, ...auto].sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [recordatorios, subs]);

  // Ítems que vencen dentro de 3 días (incl. hoy/vencidos) → franja de alerta.
  const proximos = useMemo(
    () => items.filter((i) => i.diasRestantes <= 3),
    [items],
  );

  // Aviso del navegador (best-effort): al activar/montar, si el permiso está
  // concedido, avisa de lo que vence hoy o mañana. Nunca lanza excepción.
  useEffect(() => {
    if (!notifOn) return;
    if (typeof Notification === "undefined") return;
    try {
      if (Notification.permission !== "granted") return;
      const inminentes = items.filter((i) => i.diasRestantes <= 1);
      if (inminentes.length === 0) return;
      const resumen = inminentes
        .map((i) => `${i.nombre} (${i.diasRestantes <= 0 ? t.hoy : t.notifManana})`)
        .join(", ");
      new Notification(t.notifTitle, {
        body: t.notifBody(resumen),
      });
    } catch {
      // Notification puede fallar en algunos navegadores; lo ignoramos.
    }
    // Sólo al montar / al activar el toggle (no en cada cambio de lista).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOn]);

  function persist(next: Recordatorio[]): void {
    setRecordatorios(next);
    saveReminders(next);
  }

  function handleAdd(e: React.FormEvent): void {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    const diaNum = Math.round(Number(dia));
    if (!nombreLimpio || !diaNum || diaNum < 1 || diaNum > 31) return;
    const montoNum = monto.trim() === "" ? null : Number(monto);
    const nuevo: Recordatorio = {
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nombre: nombreLimpio,
      monto: montoNum !== null && Number.isFinite(montoNum) ? montoNum : null,
      dia: diaNum,
      recurrenteMensual: recurrente,
    };
    persist([...recordatorios, nuevo]);
    setNombre("");
    setMonto("");
    setDia("");
    setRecurrente(true);
  }

  function handleDelete(id: string): void {
    persist(recordatorios.filter((r) => r.id !== id));
  }

  function toggleNotif(): void {
    const next = !notifOn;
    // Al activar, pedimos permiso (si el API existe). El estado se activa igual;
    // el efecto sólo dispara la notificación cuando el permiso queda concedido.
    if (next && typeof Notification !== "undefined") {
      try {
        if (Notification.permission === "default") {
          void Notification.requestPermission().catch(() => {});
        }
      } catch {
        // ignorar: navegadores sin soporte de Notification
      }
    }
    setNotifOn(next);
    try {
      localStorage.setItem(NOTIF_KEY, next ? "1" : "0");
    } catch {
      // localStorage opcional
    }
  }

  const notifSupported = typeof Notification !== "undefined";

  return (
    <div>
      {/* Franja de alerta: algo vence dentro de 3 días. */}
      {proximos.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: WARNING,
            color: "#1a1205",
            borderRadius: tokens.radii.card,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          <span aria-hidden>⚠️</span>
          <span>
            {t.tienes} {proximos.length}{" "}
            {proximos.length === 1 ? t.pagoProximo : t.pagosProximos}:{" "}
            {proximos
              .map((i) => {
                const cuando =
                  i.diasRestantes < 0
                    ? t.vencidoLower
                    : i.diasRestantes === 0
                      ? t.hoy
                      : t.enDiasLower(i.diasRestantes);
                const monto =
                  i.monto != null ? ` (${formatCurrency(i.monto, "PEN")}, ${cuando})` : ` (${cuando})`;
                return `${i.nombre}${monto}`;
              })
              .join(", ")}
          </span>
        </div>
      )}

      {/* Formulario para agregar un recordatorio manual. */}
      <form
        onSubmit={handleAdd}
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          background: tokens.colors.surface,
          borderRadius: tokens.radii.card,
          padding: "12px 14px",
          marginBottom: 16,
        }}
      >
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t.nombrePh}
          style={{
            flex: "2 1 160px",
            padding: "8px 10px",
            borderRadius: tokens.radii.input,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.cardBg,
            color: tokens.colors.text,
            fontSize: 14,
          }}
        />
        <input
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder={t.montoPh}
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          style={{
            flex: "1 1 110px",
            padding: "8px 10px",
            borderRadius: tokens.radii.input,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.cardBg,
            color: tokens.colors.text,
            fontSize: 14,
          }}
        />
        <input
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          placeholder={t.diaPh}
          type="number"
          min="1"
          max="31"
          aria-label={t.diaAria}
          style={{
            flex: "0 1 80px",
            padding: "8px 10px",
            borderRadius: tokens.radii.input,
            border: `1px solid ${tokens.colors.border}`,
            background: tokens.colors.cardBg,
            color: tokens.colors.text,
            fontSize: 14,
          }}
        />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: tokens.colors.textMuted,
            cursor: "pointer",
            flex: "0 0 auto",
          }}
        >
          <input
            type="checkbox"
            checked={recurrente}
            onChange={(e) => setRecurrente(e.target.checked)}
          />
          {t.repiteCadaMes}
        </label>
        <button
          type="submit"
          style={{
            flex: "0 0 auto",
            padding: "8px 16px",
            borderRadius: tokens.radii.input,
            border: "none",
            background: tokens.colors.accent,
            color: "#fff",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {t.agregar}
        </button>
      </form>

      {/* Lista unificada ordenada por vencimiento. */}
      {items.length === 0 ? (
        <p style={{ color: tokens.colors.textMuted, margin: "8px 0" }}>
          {t.sinPagos}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => {
            const u = urgency(item, t, lang);
            return (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: tokens.colors.cardBg,
                  border: `1px solid ${tokens.colors.border}`,
                  borderRadius: tokens.radii.card,
                  padding: "10px 14px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {item.nombre}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: tokens.colors.textMuted,
                        border: `1px solid ${tokens.colors.border}`,
                        borderRadius: tokens.radii.chip,
                        padding: "1px 8px",
                      }}
                    >
                      {item.origen === "auto" ? t.auto : t.manual}
                    </span>
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12,
                      color: tokens.colors.textMuted,
                    }}
                  >
                    {item.monto != null ? formatCurrency(item.monto, "PEN") : "—"}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flex: "0 0 auto",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: u.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {u.label}
                  </span>
                  {item.origen === "manual" && item.recordatorioId && (
                    <button
                      onClick={() => handleDelete(item.recordatorioId!)}
                      aria-label={t.eliminar(item.nombre)}
                      title={t.eliminarTitle}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 15,
                        lineHeight: 1,
                        padding: 2,
                        color: tokens.colors.textMuted,
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Aviso del navegador (opcional, secundario). */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 16,
          fontSize: 13,
          color: tokens.colors.textMuted,
          cursor: notifSupported ? "pointer" : "not-allowed",
        }}
      >
        <input
          type="checkbox"
          checked={notifOn}
          disabled={!notifSupported}
          onChange={toggleNotif}
        />
        🔔 {t.avisarme}
        {!notifSupported && t.noDisponible}
      </label>
    </div>
  );
}
