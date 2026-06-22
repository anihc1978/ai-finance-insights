// src/components/AfpPanel.tsx
// ---------------------------------------------------------------------------
// AFP (Peru private pension) tracker. There's no AFP API, so the user either
// scans a paper "estado de cuenta" (POST /afp/scan → Claude vision extracts the
// statement → review → save) or types the numbers in by hand. Saved records
// (GET /afp) are listed and drawn as a balance-over-time line chart so the user
// can watch their fund grow. Records are added (POST /afp) and removed
// (DELETE /afp/{id}). Self-contained: it does its own fetching and owns its
// local state. Spanish labels — the app goes Spanish next.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPost, apiDelete, apiUpload } from "../lib/api";
import { formatCurrency, type Currency } from "../lib/format";
import { tokens } from "../lib/theme";

interface AfpPanelProps {
  currency: Currency;
}

// One row from GET /afp.
interface AfpRecord {
  id: string;
  as_of: string; // "YYYY-MM-DD"
  balance: number;
  fund_type: string | null;
  contributed: number | null;
  afp_name: string | null;
  source: string;
}

// What POST /afp/scan returns from the vision model (no id — not saved yet).
interface ScannedAfp {
  as_of: string | null;
  balance: number | null;
  fund_type: string | null;
  contributed: number | null;
  afp_name: string | null;
}

// The editable form used both for manual entry and for reviewing a scan.
interface AfpForm {
  as_of: string;
  balance: string;
  fund_type: string;
  contributed: string;
  afp_name: string;
}

const EMPTY_FORM: AfpForm = {
  as_of: "",
  balance: "",
  fund_type: "",
  contributed: "",
  afp_name: "",
};

// Example "AFP Integra" data shown ONLY when the user has no real records yet,
// so the panel isn't empty before they scan/enter their first statement. These
// are sample numbers — never saved to the backend. The moment a real record
// exists, this is dropped and the panel behaves exactly as before.
const EXAMPLE_RECORDS: AfpRecord[] = [
  { id: "ex-1", as_of: "2026-01-31", balance: 12540, fund_type: null, contributed: 430, afp_name: "Integra", source: "example" },
  { id: "ex-2", as_of: "2026-02-28", balance: 13180, fund_type: null, contributed: 430, afp_name: "Integra", source: "example" },
  { id: "ex-3", as_of: "2026-03-31", balance: 13690, fund_type: null, contributed: 430, afp_name: "Integra", source: "example" },
  { id: "ex-4", as_of: "2026-04-30", balance: 14420, fund_type: null, contributed: 430, afp_name: "Integra", source: "example" },
  { id: "ex-5", as_of: "2026-05-31", balance: 15010, fund_type: null, contributed: 430, afp_name: "Integra", source: "example" },
  { id: "ex-6", as_of: "2026-06-30", balance: 15640, fund_type: null, contributed: 430, afp_name: "Integra", source: "example" },
];

// "2026-01-31" → "Ene 2026" (Spanish short month, capitalised).
function monthLabel(asOf: string): string {
  const [year, m] = asOf.split("-").map(Number);
  if (!year || !m) return asOf;
  const label = new Date(year, m - 1, 1).toLocaleDateString("es-PE", {
    month: "short",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const cardStyle: React.CSSProperties = {
  background: tokens.colors.cardBg,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.md,
  marginTop: tokens.spacing.lg,
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 15,
  fontWeight: 500,
  color: tokens.colors.text,
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.input,
};

export function AfpPanel({ currency }: AfpPanelProps) {
  const [records, setRecords] = useState<AfpRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  // The form is shared by manual entry and scan-review. `fromScan` flips the
  // heading/button copy so the user knows they're confirming a scan vs. typing.
  const [form, setForm] = useState<AfpForm>(EMPTY_FORM);
  const [fromScan, setFromScan] = useState(false);

  async function loadRecords() {
    try {
      const data = await apiGet<{ records: AfpRecord[] }>("/afp");
      setRecords(data.records);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    loadRecords().catch((e: unknown) => setError(String(e)));
  }, []);

  function setField(key: keyof AfpForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Scan one statement image → prefill the review form with what Claude read.
  async function handleScan(file: File) {
    setScanning(true);
    setError(null);
    try {
      const scanned = await apiUpload<ScannedAfp>("/afp/scan", file);
      setForm({
        as_of: scanned.as_of ?? "",
        balance: scanned.balance != null ? String(scanned.balance) : "",
        fund_type: scanned.fund_type ?? "",
        contributed: scanned.contributed != null ? String(scanned.contributed) : "",
        afp_name: scanned.afp_name ?? "",
      });
      setFromScan(true);
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }

  // Save the current form (whether typed or scanned-then-reviewed).
  async function handleSave() {
    const balance = Number(form.balance);
    if (!form.as_of || !Number.isFinite(balance) || balance <= 0) {
      setError("Ingresa la fecha y un saldo positivo.");
      return;
    }
    const contributed = form.contributed.trim() === "" ? null : Number(form.contributed);
    if (contributed !== null && !Number.isFinite(contributed)) {
      setError("El aporte debe ser un número.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost<
        {
          as_of: string;
          balance: number;
          fund_type: string | null;
          contributed: number | null;
          afp_name: string | null;
          source: string;
        },
        { record: AfpRecord }
      >("/afp", {
        as_of: form.as_of,
        balance,
        fund_type: form.fund_type.trim() || null,
        contributed,
        afp_name: form.afp_name.trim() || null,
        source: fromScan ? "scan" : "manual",
      });
      setForm(EMPTY_FORM);
      setFromScan(false);
      await loadRecords();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleCancelScan() {
    setForm(EMPTY_FORM);
    setFromScan(false);
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiDelete<{ deleted: boolean }>(`/afp/${id}`);
      await loadRecords();
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // No real records yet (after the fetch settled) → fall back to a clearly
  // labelled "AFP Integra" example so the panel isn't empty. The moment a real
  // record exists this is dropped and everything behaves exactly as before.
  const showExample = loaded && records.length === 0;

  // Rows that drive the latest-balance card and the chart: real records, or the
  // example set when there are none.
  const displayRecords = showExample ? EXAMPLE_RECORDS : records;

  // Ordered by as_of asc, so the last row is the latest.
  const latest =
    displayRecords.length > 0 ? displayRecords[displayRecords.length - 1] : null;
  const chartData = displayRecords.map((r) => ({ as_of: r.as_of, balance: r.balance }));

  return (
    <div>
      {/* Latest balance, shown prominently. */}
      {latest && (
        <section style={cardStyle}>
          <p style={{ margin: 0, color: tokens.colors.textMuted, fontSize: 13 }}>
            Saldo actual {latest.afp_name ? `· ${latest.afp_name}` : ""}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 32,
              fontWeight: 600,
              color: tokens.colors.text,
            }}
          >
            {formatCurrency(latest.balance, currency)}
          </p>
          <p style={{ margin: "4px 0 0", color: tokens.colors.textMuted, fontSize: 13 }}>
            {latest.fund_type ? `Fondo: ${latest.fund_type} · ` : ""}al {latest.as_of}
          </p>
        </section>
      )}

      {/* Example "AFP Integra" table — only when there are no real records yet.
          Clearly labelled as sample data; replaced the moment a real record
          exists. The scan/manual CTAs below still let the user enter real data. */}
      {showExample && (
        <section style={cardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: tokens.spacing.sm,
              flexWrap: "wrap",
            }}
          >
            <h3 style={sectionTitle}>AFP Integra</h3>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: tokens.colors.accent,
                background: tokens.colors.surface,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: tokens.radii.chip,
                padding: "2px 8px",
              }}
            >
              Ejemplo — datos de muestra
            </span>
          </div>
          <p style={{ color: tokens.colors.textMuted, fontSize: 13, marginTop: 4 }}>
            Así se verá tu AFP. Escanea o ingresa tu estado de cuenta abajo para
            reemplazarlo con tus números reales.
          </p>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Mes", "Aporte", "Saldo", "Variación"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? "left" : "right",
                        padding: "6px 8px",
                        color: tokens.colors.textMuted,
                        fontWeight: 500,
                        borderBottom: `1px solid ${tokens.colors.border}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EXAMPLE_RECORDS.map((r, i) => {
                  const prev = i > 0 ? EXAMPLE_RECORDS[i - 1].balance : null;
                  const variation = prev != null ? r.balance - prev : null;
                  return (
                    <tr key={r.id}>
                      <td
                        style={{
                          textAlign: "left",
                          padding: "6px 8px",
                          color: tokens.colors.text,
                          borderBottom: `1px solid ${tokens.colors.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {monthLabel(r.as_of)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 8px",
                          color: tokens.colors.textMuted,
                          borderBottom: `1px solid ${tokens.colors.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.contributed != null
                          ? formatCurrency(r.contributed, currency)
                          : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 8px",
                          color: tokens.colors.text,
                          fontWeight: 500,
                          borderBottom: `1px solid ${tokens.colors.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCurrency(r.balance, currency)}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          padding: "6px 8px",
                          color:
                            variation == null
                              ? tokens.colors.textMuted
                              : variation >= 0
                              ? tokens.colors.up
                              : tokens.colors.down,
                          borderBottom: `1px solid ${tokens.colors.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {variation == null
                          ? "—"
                          : `${variation >= 0 ? "+" : "−"}${formatCurrency(
                              Math.abs(variation),
                              currency,
                            )}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Balance over time. */}
      <section style={cardStyle}>
        <h3 style={sectionTitle}>Saldo en el tiempo</h3>
        {chartData.length > 1 ? (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={tokens.colors.border} />
                <XAxis dataKey="as_of" tick={{ fontSize: 12, fill: tokens.colors.textMuted }} />
                <YAxis
                  tick={{ fontSize: 12, fill: tokens.colors.textMuted }}
                  width={80}
                  tickFormatter={(v: number) => formatCurrency(v, currency)}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke={tokens.colors.accent}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ color: tokens.colors.textMuted }}>
            Agrega al menos dos registros para ver la evolución.
          </p>
        )}
      </section>

      {/* Scan a statement. */}
      <section style={cardStyle}>
        <h3 style={sectionTitle}>Escanear estado de cuenta</h3>
        <p style={{ color: tokens.colors.textMuted, fontSize: 13, marginTop: 4 }}>
          Sube una foto de tu estado de cuenta AFP (Integra, Prima, Profuturo o
          Habitat) y la leeremos por ti.
        </p>
        <label
          style={{
            display: "inline-block",
            padding: "8px 14px",
            border: `1px solid ${tokens.colors.accent}`,
            borderRadius: tokens.radii.input,
            color: tokens.colors.accent,
            cursor: scanning ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {scanning ? "Leyendo…" : "Elegir imagen"}
          <input
            type="file"
            accept="image/*"
            disabled={scanning}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleScan(file);
              e.target.value = ""; // allow re-selecting the same file
            }}
          />
        </label>
      </section>

      {/* Review (after scan) or manual entry. Same form. */}
      <section style={cardStyle}>
        <h3 style={sectionTitle}>
          {fromScan ? "Revisar y guardar" : "Ingresar manualmente"}
        </h3>
        {fromScan && (
          <p style={{ color: tokens.colors.textMuted, fontSize: 13, marginTop: 4 }}>
            Revisa lo que leímos del estado de cuenta antes de guardar.
          </p>
        )}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: tokens.colors.textMuted }}>
            Fecha del estado
            <input
              value={form.as_of}
              onChange={(e) => setField("as_of", e.target.value)}
              type="date"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: tokens.colors.textMuted }}>
            Saldo (S/)
            <input
              value={form.balance}
              onChange={(e) => setField("balance", e.target.value)}
              placeholder="Saldo total"
              type="number"
              min="0"
              style={{ ...inputStyle, width: 140 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: tokens.colors.textMuted }}>
            Tipo de fondo
            <input
              value={form.fund_type}
              onChange={(e) => setField("fund_type", e.target.value)}
              placeholder="Fondo 0/1/2/3"
              style={{ ...inputStyle, width: 130 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: tokens.colors.textMuted }}>
            Aporte del periodo
            <input
              value={form.contributed}
              onChange={(e) => setField("contributed", e.target.value)}
              placeholder="Aporte"
              type="number"
              min="0"
              style={{ ...inputStyle, width: 130 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", fontSize: 12, color: tokens.colors.textMuted }}>
            AFP
            <input
              value={form.afp_name}
              onChange={(e) => setField("afp_name", e.target.value)}
              placeholder="Integra, Prima…"
              style={{ ...inputStyle, width: 150 }}
            />
          </label>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
          <button onClick={handleSave} disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {fromScan && (
            <button onClick={handleCancelScan} disabled={busy} style={{ color: tokens.colors.textMuted }}>
              Cancelar
            </button>
          )}
        </div>
      </section>

      {error && <p style={{ color: tokens.colors.down, marginTop: 12 }}>Error: {error}</p>}

      {/* Saved records. */}
      <section style={cardStyle}>
        <h3 style={sectionTitle}>Registros guardados</h3>
        {records.length === 0 ? (
          <p style={{ color: tokens.colors.textMuted, marginTop: 8 }}>
            Aún no hay registros — escanea o ingresa uno arriba.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {[...records].reverse().map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: 8,
                  borderBottom: `1px solid ${tokens.colors.border}`,
                }}
              >
                <div>
                  <strong style={{ color: tokens.colors.text }}>
                    {formatCurrency(r.balance, currency)}
                  </strong>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: tokens.colors.textMuted }}>
                    {r.as_of}
                    {r.fund_type ? ` · ${r.fund_type}` : ""}
                    {r.afp_name ? ` · ${r.afp_name}` : ""}
                    {r.contributed != null ? ` · aporte ${formatCurrency(r.contributed, currency)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={busy}
                  style={{ fontSize: 12, padding: "2px 8px", color: tokens.colors.down }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
