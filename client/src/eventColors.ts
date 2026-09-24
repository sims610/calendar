export interface EventColor {
  background: string;
  border: string;
}

// Pastel backgrounds with a darker left border, matching the design.
const PALETTE: EventColor[] = [
  { background: "#efe3fb", border: "#6a1fb5" }, // purple
  { background: "#fde2e4", border: "#c62d3a" }, // red
  { background: "#e8f8e0", border: "#5bb531" }, // green
  { background: "#e1f0fd", border: "#1a2a55" }, // navy
  { background: "#fde3fb", border: "#c257d6" }, // pink
  { background: "#fdf2cf", border: "#f2b705" }, // yellow
  { background: "#fdf3e1", border: "#d98a10" }, // orange
];

/**
 * Picks a color for an event based on its title, so events with the same
 * title always get the same color.
 */
export function colorForTitle(title: string): EventColor {
  let hash = 0;
  for (const character of title.toUpperCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
