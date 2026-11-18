import { useState } from "react";
import type { NamedSharedEvent } from "../api";
import { formatWeekday, fromDateKey, monthGridDays, startOfMonth, todayKey } from "../dateUtils";
import { colorForEvent, colorForPerson, eventColorStyle } from "../eventColors";
import type { CalendarEvent } from "../types";
import { useSwipe } from "../useSwipe";

/** How many lines of events a day has room for; with more events, the last line is "+N more". */
const MAX_CHIPS = 3;

interface MonthViewProps {
  date: string;
  /** The user's own events on each day of the grid. */
  eventsByDay: Map<string, CalendarEvent[]>;
  /** Other people's events on each day of the grid. */
  sharedEventsByDay: Map<string, NamedSharedEvent[]>;
  /** Called when a day is tapped. */
  onSelectDay: (date: string) => void;
  /** Swiping left shows the next month, swiping right the previous month. */
  onNextMonth: () => void;
  onPreviousMonth: () => void;
}

/** A 6-week grid of the month `date` is in, with each day's events as small colored chips. */
export function MonthView({
  date,
  eventsByDay,
  sharedEventsByDay,
  onSelectDay,
  onNextMonth,
  onPreviousMonth,
}: MonthViewProps) {
  const today = todayKey();
  const month = startOfMonth(date);
  const days = monthGridDays(date);
  // The first row is always Sunday to Saturday.
  const weekdays = days.slice(0, 7).map(formatWeekday);

  const swipe = useSwipe({
    onSwipeLeft: onNextMonth,
    onSwipeRight: onPreviousMonth,
    isDisabled: false,
  });

  // When the month changes, slide the new one in from the side it comes from.
  const [shownMonth, setShownMonth] = useState(month);
  const [slideInFrom, setSlideInFrom] = useState<"left" | "right" | null>(null);
  if (month !== shownMonth) {
    setShownMonth(month);
    setSlideInFrom(month > shownMonth ? "right" : "left");
  }

  const gridClassName = [
    "month-grid",
    slideInFrom && `slide-in-from-${slideInFrom}`,
    swipe.isSwiping && "swiping",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="month-view" {...swipe.handlers}>
      <div className="month-weekdays" aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>

      {/* The key gives each month a fresh element, so its slide-in animation plays. */}
      <div
        key={month}
        className={gridClassName}
        style={{ transform: `translateX(${swipe.offsetX}px)` }}
      >
        {days.map((day) => {
          const chips = [
            ...(eventsByDay.get(day) ?? []).map((event) => ({
              key: `own-${event.id}`,
              title: event.title,
              startTime: event.startTime,
              color: colorForEvent(event),
            })),
            ...(sharedEventsByDay.get(day) ?? []).map((event) => ({
              key: `shared-${event.clientId}`,
              title: event.title,
              startTime: event.startTime,
              color: colorForPerson(event.ownerUserId),
            })),
          ].sort((a, b) => a.startTime.localeCompare(b.startTime));
          const hiddenCount = chips.length - MAX_CHIPS;

          const classNames = ["month-day"];
          if (startOfMonth(day) !== month) classNames.push("outside");
          if (day === today) classNames.push("today");
          if (day === date) classNames.push("selected");

          return (
            <button
              key={day}
              className={classNames.join(" ")}
              onClick={() => onSelectDay(day)}
              aria-label={`${formatWeekday(day)} ${fromDateKey(day).getDate()}, ${
                chips.length === 1 ? "1 event" : `${chips.length} events`
              }`}
            >
              <span className="month-day-number">{fromDateKey(day).getDate()}</span>
              {/* Show one fewer chip when that makes room for "+N more". */}
              {chips.slice(0, hiddenCount > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((chip) => (
                <span
                  key={chip.key}
                  className="month-chip"
                  style={eventColorStyle(chip.color)}
                >
                  {chip.title || "(No title)"}
                </span>
              ))}
              {hiddenCount > 0 && <span className="month-more">+{hiddenCount + 1} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
