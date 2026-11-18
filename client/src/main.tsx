import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { startReminders } from "./notifications";
import { applyAppearance, applyTheme, getSavedAppearance, getSavedTheme } from "./theme";
import "./styles.css";

// Use the color and light/dark choice from Settings before anything is drawn.
applyTheme(getSavedTheme());
applyAppearance(getSavedAppearance());

// Events only live on this device, so ask the browser not to clear them when space runs low.
navigator.storage?.persist?.();

startReminders();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <UpdatePrompt />
  </StrictMode>,
);
