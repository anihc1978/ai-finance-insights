// src/pages/Login.tsx
// ---------------------------------------------------------------------------
// Email/password login + signup using Supabase Auth.
// Note the typed event handlers (React.FormEvent) — TS infers the rest.
// ---------------------------------------------------------------------------
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    // Call the method DIRECTLY on supabase.auth so it keeps its `this` binding.
    // Assigning it to a variable first (const fn = supabase.auth.signUp) detaches
    // `this` — it becomes undefined and supabase-js crashes on `this.storage`.
    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    setBusy(false);
    // On success, AuthContext's onAuthStateChange updates the session and the
    // app re-renders into the protected dashboard automatically.
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>AI Finance Insights</h1>
      <p style={{ color: "#666" }}>
        {mode === "login" ? "Sign in to continue" : "Create an account"}
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Sign up"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        style={{ background: "none", border: "none", color: "#2e5c8a", cursor: "pointer" }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  marginBottom: 10,
  borderRadius: 6,
  border: "1px solid #ccc",
};
const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 6,
  border: "none",
  background: "#1a1a1a",
  color: "white",
  cursor: "pointer",
};
