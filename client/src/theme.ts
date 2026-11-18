// The app's main color, chosen from a fixed set in Settings.
// Saved in localStorage so the choice is ready before the app first draws.

export interface Theme {
  id: string;
  name: string;
  /** Dark enough for white text on top of it. */
  color: string;
}

export const THEMES: Theme[] = [
  { id: "crimson", name: "Crimson", color: "#9c1552" },
  { id: "red", name: "Red", color: "#c62828" },
  { id: "orange", name: "Orange", color: "#c2410c" },
  { id: "green", name: "Green", color: "#2e7d32" },
  { id: "teal", name: "Teal", color: "#00796b" },
  { id: "blue", name: "Blue", color: "#1565c0" },
  { id: "navy", name: "Navy", color: "#1a2a55" },
  { id: "purple", name: "Purple", color: "#6a1b9a" },
  { id: "pink", name: "Pink", color: "#ad1457" },
  { id: "slate", name: "Slate", color: "#37474f" },
];

const DEFAULT_THEME = THEMES[0];
const STORAGE_KEY = "theme";

/** The saved theme, or the default if none is saved (or storage can't be read). */
export function getSavedTheme(): Theme {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Colors the app with the theme. */
export function applyTheme(theme: Theme) {
  document.documentElement.style.setProperty("--theme", theme.color);
  // Also colors the phone's status bar.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.color);
}

/** Colors the app with the theme and remembers it for next time. */
export function saveTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // The color still changes for now; it just won't be remembered.
  }
}

// ---------- Light / dark appearance ----------

/** "system" follows the device's dark mode setting. */
export type Appearance = "system" | "light" | "dark";

export const APPEARANCES: { id: Appearance; name: string }[] = [
  { id: "system", name: "System" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

const APPEARANCE_STORAGE_KEY = "appearance";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let currentAppearance: Appearance = "system";

/** The saved appearance, or "system" if none is saved (or storage can't be read). */
export function getSavedAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return APPEARANCES.some((appearance) => appearance.id === saved) ? (saved as Appearance) : "system";
  } catch {
    return "system";
  }
}

/** Sets `data-appearance` on the page to "light" or "dark", which styles.css colors from. */
function updateAppearance() {
  const isDark = currentAppearance === "dark" || (currentAppearance === "system" && darkQuery.matches);
  document.documentElement.dataset.appearance = isDark ? "dark" : "light";
}

// When following the device, switch as soon as the device does.
darkQuery.addEventListener("change", updateAppearance);

/** Draws the app light or dark. */
export function applyAppearance(appearance: Appearance) {
  currentAppearance = appearance;
  updateAppearance();
}

/** Draws the app light or dark and remembers the choice for next time. */
export function saveAppearance(appearance: Appearance) {
  applyAppearance(appearance);
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // It still changes for now; it just won't be remembered.
  }
}
