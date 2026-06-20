// src/lib/supabase.ts
// ---------------------------------------------------------------------------
// One shared, typed Supabase client for the whole frontend.
// import.meta.env.* are Vite's env vars — must be prefixed VITE_ to be exposed
// to the browser. The `as string` is a TypeScript assertion: we promise these
// are defined (Vite injects them at build time).
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
