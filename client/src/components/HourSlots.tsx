import { formatHour } from "../dateUtils";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface HourSlotsProps {
  hourHeight: number;
  /** Called with the hour (0–23) of the empty slot that was tapped. */
  onSlotClick: (hour: number) => void;
}

/**
 * Invisible tap targets, one per hour, behind the day's events.
 * Events are drawn after these, so tapping an event still opens the event.
 */
export function HourSlots({ hourHeight, onSlotClick }: HourSlotsProps) {
  return (
    <>
      {HOURS.map((hour) => (
        <button
          key={hour}
          className="hour-slot"
          style={{ top: hour * hourHeight, height: hourHeight }}
          onClick={() => onSlotClick(hour)}
          aria-label={`Add event at ${formatHour(hour)}`}
        />
      ))}
    </>
  );
}
