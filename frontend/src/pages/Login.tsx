// src/pages/Login.tsx
// ---------------------------------------------------------------------------
// Email/password login + signup using Supabase Auth.
// Note the typed event handlers (React.FormEvent) — TS infers the rest.
// ---------------------------------------------------------------------------
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useLang } from "../lib/i18n";

const T = {
  es: {
    subtitleLogin: "Inicia sesión para continuar",
    subtitleSignup: "Crea una cuenta",
    password: "Contraseña",
    submitLogin: "Iniciar sesión",
    submitSignup: "Registrarse",
    toSignup: "¿No tienes cuenta? Regístrate",
    toLogin: "¿Ya tienes cuenta? Inicia sesión",
    betaPre: "Versión beta. Al continuar aceptas nuestro ",
    betaLink: "aviso de privacidad",
  },
  en: {
    subtitleLogin: "Sign in to continue",
    subtitleSignup: "Create an account",
    password: "Password",
    submitLogin: "Sign in",
    submitSignup: "Sign up",
    toSignup: "Don't have an account? Sign up",
    toLogin: "Already have an account? Sign in",
    betaPre: "Beta version. By continuing you accept our ",
    betaLink: "privacy notice",
  },
} as const;

export function Login() {
  const lang = useLang();
  const t = T[lang];
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
        {mode === "login" ? t.subtitleLogin : t.subtitleSignup}
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
          placeholder={t.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "…" : mode === "login" ? t.submitLogin : t.submitSignup}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        style={{ background: "none", border: "none", color: "#2e5c8a", cursor: "pointer" }}
      >
        {mode === "login" ? t.toSignup : t.toLogin}
      </button>

      <p style={{ color: "#888", fontSize: 13, marginTop: 24 }}>
        {t.betaPre}
        <a href="/privacidad.html" target="_blank" rel="noopener noreferrer" style={{ color: "#2e5c8a" }}>
          {t.betaLink}
        </a>
        .
      </p>
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
