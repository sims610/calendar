import { useEffect, useRef } from "react";
import { addDays, formatWeekday, fromDateKey, todayKey } from "../dateUtils";

/** How many days to show on each side of the selected day. */
const DAYS_EACH_SIDE = 14;

interface DateStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

/** A horizontally scrolling row of days, like "Fri 11 | Sat 12 | Sun 13". */
export function DateStrip({ selectedDate, onSelectDate }: DateStripProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  const today = todayKey();

  const days: string[] = [];
  for (let offset = -DAYS_EACH_SIDE; offset <= DAYS_EACH_SIDE; offset++) {
    days.push(addDays(selectedDate, offset));
  }

  // Keep the selected day near the left edge, as in the design.
  useEffect(() => {
    const button = selectedRef.current;
    if (button?.parentElement) {
      button.parentElement.scrollLeft = button.offsetLeft - button.offsetWidth / 2;
    }
  }, [selectedDate]);

  return (
    <nav className="date-strip" aria-label="Choose a day">
      {days.map((day) => {
        const isSelected = day === selectedDate;
        const classNames = ["date-strip-day"];
        if (isSelected) classNames.push("selected");
        if (day === today) classNames.push("today");

        return (
          <button
            key={day}
            ref={isSelected ? selectedRef : undefined}
            className={classNames.join(" ")}
            onClick={() => onSelectDate(day)}
            aria-pressed={isSelected}
          >
            <span className="date-strip-weekday">{formatWeekday(day)}</span>
            <span className="date-strip-number">{fromDateKey(day).getDate()}</span>
          </button>
        );
      })}
    </nav>
  );
}
