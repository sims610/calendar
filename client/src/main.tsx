import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { applyTheme, getSavedTheme } from "./theme";
import "./styles.css";

// Use the color picked in Settings before anything is drawn.
applyTheme(getSavedTheme());

// Events only live on this device, so ask the browser not to clear them when space runs low.
navigator.storage?.persist?.();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
);
