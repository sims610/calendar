import { useEffect, useRef } from "react";
import { colorForTitle } from "../eventColors";
import { formatHour, formatTimeRange } from "../dateUtils";
import { layoutEvents } from "../layoutEvents";
import type { CalendarEvent } from "../types";
import { CurrentTimeLine } from "./CurrentTimeLine";
import { RepeatIcon } from "./Icons";

/** Height of one hour in pixels. */
const HOUR_HEIGHT = 88;
const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;
/** The hour the view scrolls to when a day opens. */
const FIRST_VISIBLE_HOUR = 7;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface DayViewProps {
  date: string;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

/** The scrolling timeline of hours with the day's events laid on top. */
export function DayView({ date, events, onEventClick }: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Start each day scrolled to the morning instead of midnight.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = FIRST_VISIBLE_HOUR * HOUR_HEIGHT - HOUR_HEIGHT / 2;
    }
  }, [date]);

  return (
    <div className="day-view" ref={scrollRef}>
      <div className="day-view-grid" style={{ height: 24 * HOUR_HEIGHT }}>
        {HOURS.map((hour) => (
          <div key={hour} className="hour-row" style={{ top: hour * HOUR_HEIGHT }}>
            <span className="hour-label">{hour === 0 ? "" : formatHour(hour)}</span>
            <span className="hour-line" />
          </div>
        ))}

        <CurrentTimeLine date={date} pixelsPerMinute={PIXELS_PER_MINUTE} />

        <div className="events-area">
          {layoutEvents(events).map(({ event, startMinutes, endMinutes, column, columnCount }) => {
            const color = colorForTitle(event.title);
            const widthPercent = 100 / columnCount;

            return (
              <button
                key={event.id}
                className="event-block"
                onClick={() => onEventClick(event)}
                style={{
                  top: startMinutes * PIXELS_PER_MINUTE,
                  height: (endMinutes - startMinutes) * PIXELS_PER_MINUTE,
                  left: `${column * widthPercent}%`,
                  width: `${widthPercent}%`,
                  background: color.background,
                  borderLeftColor: color.border,
                }}
              >
                <span className="event-title">{event.title}</span>
                <span className="event-time">{formatTimeRange(event.startTime, event.endTime)}</span>
                {event.repeat !== "none" && (
                  <span className="event-repeat" title={`Repeats ${event.repeat}`}>
                    <RepeatIcon />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
