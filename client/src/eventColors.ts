export type EventColorId = "purple" | "red" | "green" | "navy" | "pink" | "yellow" | "orange";

export interface EventColor {
  id: EventColorId;
  name: string;
  background: string;
  border: string;
}

// Pastel backgrounds with a darker left border, matching the design.
// Automatic colors are picked by position, so reordering this changes existing events' colors.
export const EVENT_COLORS: EventColor[] = [
  { id: "purple", name: "Purple", background: "#efe3fb", border: "#6a1fb5" },
  { id: "red", name: "Red", background: "#fde2e4", border: "#c62d3a" },
  { id: "green", name: "Green", background: "#e8f8e0", border: "#5bb531" },
  { id: "navy", name: "Navy", background: "#e1f0fd", border: "#1a2a55" },
  { id: "pink", name: "Pink", background: "#fde3fb", border: "#c257d6" },
  { id: "yellow", name: "Yellow", background: "#fdf2cf", border: "#f2b705" },
  { id: "orange", name: "Orange", background: "#fdf3e1", border: "#d98a10" },
];

/** The same text always gets the same color. */
function colorForText(text: string): EventColor {
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

/**
 * Picks a color for an event based on its title, so events with the same
 * title always get the same color.
 */
export function colorForTitle(title: string): EventColor {
  return colorForText(title.toUpperCase());
}

/** The color the user chose for the event, or one picked from its title if they didn't choose. */
export function colorForEvent(event: { title: string; color?: EventColorId }): EventColor {
  return EVENT_COLORS.find((color) => color.id === event.color) ?? colorForTitle(event.title);
}

/** Picks a color for someone else's events, so all of one person's events match. */
export function colorForPerson(userId: string): EventColor {
  return colorForText(userId);
}
