import { useRef } from "react";
import { formatMonthDay, todayKey } from "../dateUtils";
import { CaretDownIcon, TodayIcon } from "./Icons";

interface HeaderProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function Header({ selectedDate, onSelectDate }: HeaderProps) {
  // A hidden native date input gives us a date picker for free.
  const datePickerRef = useRef<HTMLInputElement>(null);

  const openDatePicker = () => {
    datePickerRef.current?.showPicker();
  };

  return (
    <header className="header">
      <button className="header-date" onClick={openDatePicker}>
        {formatMonthDay(selectedDate)}
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
