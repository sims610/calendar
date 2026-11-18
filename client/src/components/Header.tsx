import { useRef } from "react";
import { formatMonthDay, formatMonthYear, todayKey } from "../dateUtils";
import { CaretDownIcon, TodayIcon } from "./Icons";

/** How the calendar page shows events: one day's timeline, or a month grid. */
export type CalendarView = "day" | "month";

/** Where the chosen view is remembered on this device. */
const VIEW_STORAGE_KEY = "calendar.view";

/** The view the user last chose, or the day view. */
export function loadCalendarView(): CalendarView {
  try {
    if (localStorage.getItem(VIEW_STORAGE_KEY) === "month") {
      return "month";
    }
  } catch {
    // Storage can be blocked, for example in a private window. The day view is fine then.
  }
  return "day";
}

export function saveCalendarView(view: CalendarView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Not remembering the view is harmless.
  }
}

interface HeaderProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
}

export function Header({ selectedDate, onSelectDate, view, onViewChange }: HeaderProps) {
  // A hidden native date input gives us a date picker for free.
  const datePickerRef = useRef<HTMLInputElement>(null);

  const openDatePicker = () => {
    datePickerRef.current?.showPicker();
  };

  return (
    <header className="header">
      <button className="header-date" onClick={openDatePicker}>
        {view === "month" ? formatMonthYear(selectedDate) : formatMonthDay(selectedDate)}
        <CaretDownIcon />
      </button>
      <input
        ref={datePickerRef}
        className="hidden-date-input"
        type="date"
        value={selectedDate}
        onChange={(event) => event.target.value && onSelectDate(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />

      <label className="header-view">
        <select
          className="header-view-select"
          value={view}
          onChange={(event) => onViewChange(event.target.value as CalendarView)}
          aria-label="Calendar view"
        >
          <option value="day">Day</option>
          <option value="month">Month</option>
        </select>
        <CaretDownIcon />
      </label>

      <button
        className="header-icon-button"
        onClick={() => onSelectDate(todayKey())}
        aria-label="Go to today"
        title="Today"
      >
        <TodayIcon size={28} />
      </button>
    </header>
  );
}
