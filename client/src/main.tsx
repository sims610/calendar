import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles.css";

// Register the service worker so the app can be installed and opens offline.
registerSW({ immediate: true });

// Events only live on this device, so ask the browser not to clear them when space runs low.
navigator.storage?.persist?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
