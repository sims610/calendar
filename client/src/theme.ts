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
