// src/lib/api.ts
// ---------------------------------------------------------------------------
// A typed wrapper around fetch() that automatically attaches the user's JWT.
//
// THIS FILE IS A MINI TYPESCRIPT LESSON — it uses a GENERIC, which is exactly
// the "depth" the senior role asks about. Read the apiGet signature carefully.
// ---------------------------------------------------------------------------
import { supabase } from "./supabase";
import { getLang } from "./i18n";

// In production set VITE_API_BASE to the deployed backend URL. For local dev we
// fall back to the localhost backend so `npm run dev` works without a .env file.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

/**
 * Grab the current access token (JWT) from the Supabase session.
 * Returns null if the user isn't logged in.
 */
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * apiGet<T> — a GENERIC function.
 *
 * The <T> is a *type parameter*: the caller tells us what shape they expect
 * back, and TypeScript types the return value accordingly. Example:
 *
 *    const me = await apiGet<{ user_id: string; email: string }>("/me");
 *    me.user_id   // ✅ typed as string
 *    me.banana    // ❌ compile error — property doesn't exist
 *
 * Generics are how you write ONE reusable function that stays fully type-safe
 * for ANY response shape. This is the single most important TS concept to
 * internalise for the roles you're targeting.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "X-Lang": getLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Same idea for POST, with a typed body. */
export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lang": getLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TResponse;
}

/** Same idea for PUT, with a typed body (used for upserts: profile, budgets). */
export async function apiPut<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Lang": getLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TResponse;
}

/** Same idea for PATCH, with a typed (usually partial) body. */
export async function apiPatch<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Lang": getLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TResponse;
}

/** DELETE a resource; returns the typed JSON body the API sends back. */
export async function apiDelete<TResponse>(path: string): Promise<TResponse> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      "X-Lang": getLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as TResponse;
}

/**
 * apiUpload<T> — POST a file as multipart/form-data (used for CSV import).
 * IMPORTANT: we do NOT set Content-Type — when the body is a FormData, the
 * browser sets it automatically *with the multipart boundary*. Setting it by
 * hand would break the upload.
 */
export async function apiUpload<T>(
  path: string,
  file: File,
  fields?: Record<string, string>,
): Promise<T> {
  const token = await getToken();
  const form = new FormData();
  form.append("file", file);
  // Optional extra form fields (e.g. the import currency PEN|USD). Sent as
  // multipart parts alongside the file so the backend reads them via Form(...).
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, value);
    }
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Lang": getLang(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}
