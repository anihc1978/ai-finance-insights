// src/components/ReceiptScanner.tsx
// ---------------------------------------------------------------------------
// Yape/Plin receipt scanner. Peruvians save screenshots of their Yape/Plin
// transfer receipts (constancias); this control lets the user select one or
// more of those images and POSTs them to /scan-receipts, where Claude vision
// extracts the transaction and the backend stores them as transactions
// (deduped by operation_id). A short result line reports the outcome.
//
// IMPORTANT: the shared apiUpload() helper sends exactly ONE file under the
// field name "file". The /scan-receipts endpoint instead expects MANY files
// under the field name "files" (FastAPI `files: list[UploadFile]`). So we do
// the multipart POST inline here, reusing the same JWT/fetch pattern as
// ../lib/api.ts (Bearer token from the Supabase session, no manual
// Content-Type so the browser sets the multipart boundary).
// ---------------------------------------------------------------------------
import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { tokens } from "../lib/theme";

const API_BASE = import.meta.env.VITE_API_BASE as string;

// --- API contract (mirror backend /scan-receipts response) -----------------
interface ScannedItem {
  date: string;
  description: string;
  amount: number;
  currency: string;
}
interface ScanReceiptsResponse {
  imported: number;
  skipped_duplicates: number;
  items: ScannedItem[];
}

interface ReceiptScannerProps {
  onImported?: () => void;
}

// --- Small style helpers using the shared design tokens --------------------
const card: React.CSSProperties = {
  background: tokens.colors.surface,
  border: `1px solid ${tokens.colors.border}`,
  borderRadius: tokens.radii.card,
  padding: tokens.spacing.lg,
};

const muted: React.CSSProperties = { color: tokens.colors.textMuted };

const button: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  borderRadius: tokens.radii.pill,
  border: `1px solid ${tokens.colors.accent}`,
  background: tokens.colors.accent,
  color: "#ffffff",
};

/**
 * Grab the current access token (JWT) from the Supabase session — same pattern
 * as ../lib/api.ts getToken(). Returns null if the user isn't logged in.
 */
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * POST every selected image to /scan-receipts under the field name "files".
 * Mirrors apiUpload(): Bearer token header, no manual Content-Type (the browser
 * sets multipart/form-data + boundary for a FormData body automatically).
 */
async function uploadReceipts(files: File[]): Promise<ScanReceiptsResponse> {
  const token = await getToken();
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const res = await fetch(`${API_BASE}/scan-receipts`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as ScanReceiptsResponse;
}

export function ReceiptScanner({ onImported }: ReceiptScannerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<ScanReceiptsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadReceipts(files);
      setResult(res);
      onImported?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      // Reset the input so re-selecting the same file fires onChange again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section style={card}>
      <h3 style={{ margin: `0 0 ${tokens.spacing.sm}px`, fontWeight: 500 }}>
        Escanear recibos Yape / Plin
      </h3>
      <p style={{ ...muted, fontSize: 13, margin: `0 0 ${tokens.spacing.md}px` }}>
        Sube las capturas de tus constancias de Yape o Plin. Las leemos y las
        agregamos como transacciones automáticamente.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        disabled={busy}
        style={{ display: "none" }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{ ...button, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
      >
        {busy ? "Leyendo…" : "Subir recibos"}
      </button>

      {result && (
        <p style={{ fontSize: 14, marginTop: tokens.spacing.md }}>
          {result.imported} importados, {result.skipped_duplicates} duplicados
        </p>
      )}

      {error && (
        <p style={{ ...muted, fontSize: 14, marginTop: tokens.spacing.md }}>
          No se pudieron leer los recibos.
        </p>
      )}
    </section>
  );
}
