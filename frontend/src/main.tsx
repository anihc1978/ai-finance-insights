// src/main.tsx — Vite/React entry point.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { App } from "./App";
import { applyTheme, getInitialTheme } from "./lib/theme";
import "./index.css";

// Apply the saved/system theme before first paint to avoid a flash.
applyTheme(getInitialTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
