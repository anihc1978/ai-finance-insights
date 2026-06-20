// src/App.tsx
// ---------------------------------------------------------------------------
// Root component. Decides what to show based on auth state:
//   - still loading  → spinner
//   - no session     → Login
//   - has session    → Dashboard
// This is a simple "auth gate" — no router needed yet (add react-router or
// TanStack Router in a later milestone when there are multiple pages).
// ---------------------------------------------------------------------------
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";

export function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return <p style={{ textAlign: "center", marginTop: 80 }}>Loading…</p>;
  }

  return session ? <Dashboard /> : <Login />;
}
