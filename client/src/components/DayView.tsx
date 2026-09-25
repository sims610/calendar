import { useEffect, useRef, useState } from "react";
import { colorForTitle } from "../eventColors";
import { formatHour, formatTimeRange, minutesToTime } from "../dateUtils";
import { layoutEvents } from "../layoutEvents";
import type { CalendarEvent } from "../types";
import { useEventDrag } from "../useEventDrag";
import { loadHourHeight, usePinchZoom } from "../usePinchZoom";
import { useSwipe } from "../useSwipe";
import { CurrentTimeLine } from "./CurrentTimeLine";
import { RepeatIcon } from "./Icons";

/** The hour the view scrolls to when a day opens. */
const FIRST_VISIBLE_HOUR = 7;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface DayViewProps {
  date: string;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  /** Called when an event is pressed, held and dragged to a new start time. */
  onEventMove: (event: CalendarEvent, startMinutes: number) => void;
  /** Swiping left shows the next day, swiping right the previous day. */
  onNextDay: () => void;
  onPreviousDay: () => void;
}

/** The scrolling timeline of hours with the day's events laid on top. */
export function DayView({
  date,
  events,
  onEventClick,
  onEventMove,
  onNextDay,
  onPreviousDay,
}: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** Height of one hour in pixels. Pinching changes it. */
  const [hourHeight, setHourHeight] = useState(loadHourHeight);
  const pixelsPerMinute = hourHeight / 60;

  const drag = useEventDrag({
    scrollRef,
    gridRef,
    pixelsPerMinute,
    onMove: onEventMove,
  });
  const isPinching = usePinchZoom({
    scrollRef,
    hourHeight,
    onHourHeightChange: setHourHeight,
    isDisabled: drag.preview !== null,
    // A second finger means a pinch, not a press and hold on an event.
    onPinchStart: drag.cancel,
  });
  const swipe = useSwipe({
    onSwipeLeft: onNextDay,
    onSwipeRight: onPreviousDay,
    // Moving an event sideways or pinching shouldn't change the day.
    isDisabled: drag.preview !== null || isPinching,
  });

  // When the day changes, slide the new one in from the side it comes from:
  // later days from the right, earlier days from the left.
  const [shownDate, setShownDate] = useState(date);
  const [slideInFrom, setSlideInFrom] = useState<"left" | "right" | null>(null);
  if (date !== shownDate) {
    setShownDate(date);
    setSlideInFrom(date > shownDate ? "right" : "left");
  }

  const gridClassName = [
    "day-view-grid",
    slideInFrom && `slide-in-from-${slideInFrom}`,
    swipe.isSwiping && "swiping",
  ]
    .filter(Boolean)
    .join(" ");

  // Start each day scrolled to the morning instead of midnight.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = FIRST_VISIBLE_HOUR * hourHeight - hourHeight / 2;
    }
    // Only when the day changes; pinching keeps its own scroll position.
  }, [date]);

  return (
    <div className="day-view" ref={scrollRef} {...swipe.handlers}>
      {/* The key gives each day a fresh element, so its slide-in animation plays. */}
      <div
        key={date}
        className={gridClassName}
        ref={gridRef}
        style={{ height: 24 * hourHeight, transform: `translateX(${swipe.offsetX}px)` }}
      >
        {HOURS.map((hour) => (
          <div key={hour} className="hour-row" style={{ top: hour * hourHeight }}>
            <span className="hour-label">{hour === 0 ? "" : formatHour(hour)}</span>
            <span className="hour-line" />
          </div>
        ))}

        <CurrentTimeLine date={date} pixelsPerMinute={pixelsPerMinute} />

        <div className="events-area">
          {layoutEvents(events).map((positioned) => {
            const { event, column, columnCount } = positioned;
            const color = colorForTitle(event.title);
            const widthPercent = 100 / columnCount;

            // While an event is being dragged, draw it where it would land.
            const isDragging = drag.preview?.eventId === event.id;
            const durationMinutes = positioned.endMinutes - positioned.startMinutes;
            const startMinutes =
              isDragging && drag.preview ? drag.preview.startMinutes : positioned.startMinutes;
            const endMinutes = startMinutes + durationMinutes;

            return (
              <button
                key={event.id}
                className={isDragging ? "event-block dragging" : "event-block"}
                {...drag.handlersFor(event)}
                onClick={() => {
                  if (!drag.shouldIgnoreClick()) {
                    onEventClick(event);
                  }
                }}
                style={{
                  top: startMinutes * pixelsPerMinute,
                  height: durationMinutes * pixelsPerMinute,
                  left: `${column * widthPercent}%`,
                  width: `${widthPercent}%`,
                  background: color.background,
                  borderLeftColor: color.border,
                }}
              >
                <span className="event-title">{event.title}</span>
                <span className="event-time">
                  {formatTimeRange(minutesToTime(startMinutes), minutesToTime(endMinutes))}
                </span>
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
