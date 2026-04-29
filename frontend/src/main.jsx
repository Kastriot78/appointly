import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './theme/ThemeContext'
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/global.css';
import './styles/app-tooltip.css';
import './styles/theme.css';
import { flushOfflineQueue } from "./api/http";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </HelmetProvider>
  </StrictMode>,
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }
    // In dev, stale SW caches can serve old chunks and break HMR/hook runtime.
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  });
}

if (typeof window !== "undefined" && navigator.onLine) {
  flushOfflineQueue().catch(() => {});
}
