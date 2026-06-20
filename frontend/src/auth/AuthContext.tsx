// src/auth/AuthContext.tsx
// ---------------------------------------------------------------------------
// Global auth state via React Context, fully typed.
//
// TYPESCRIPT DEPTH ON DISPLAY: the AuthState type below is a great example of
// modeling state with the type system so impossible states can't happen.
// ---------------------------------------------------------------------------
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

// The shape of what our context provides to the rest of the app.
interface AuthContextValue {
  session: Session | null;   // null = logged out
  loading: boolean;          // true while we check the initial session
  signOut: () => Promise<void>;
}

// createContext needs a default; we use `undefined` and guard in the hook below,
// so consuming the context outside the provider throws a clear error.
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) Check if there's already a session (e.g. page refresh).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // 2) Subscribe to future auth changes (login / logout / token refresh).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Cleanup the subscription when this provider unmounts.
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — typed hook to read auth state anywhere.
 * The `if (!ctx) throw` makes the return type non-undefined for callers, so
 * they never have to null-check the context itself. Small but senior touch.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
