import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./app/App";
import { AuthProvider } from "./shared/auth";
import "./shared/i18n/i18n";
import "./shared/styles/globals.css";
import { ThemeProvider } from "./shared/theme";

// A deploy replaces hashed page chunks; reload once so an open tab picks up the new build instead of failing.
window.addEventListener("vite:preloadError", (event) => {
  const reloadKey = "pagerwho.chunkReloadAt";
  try {
    const lastReload = Number(sessionStorage.getItem(reloadKey) ?? 0);
    if (Date.now() - lastReload < 60_000) return;
    sessionStorage.setItem(reloadKey, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway, the browser cache is already stale.
  }
  event.preventDefault();
  window.location.reload();
});

const queryClient = new QueryClient();
const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
