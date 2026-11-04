import type { NamedSharedEvent } from "../api";
import { describeRepeat, formatMonthDay, formatTimeRange, formatWeekday } from "../dateUtils";

interface SharedEventSheetProps {
  event: NamedSharedEvent;
  /** The day it was opened from. A repeating event's own date is only its first day. */
  date: string;
  onClose: () => void;
}

/** The details of someone else's event. It's theirs to change, so there's nothing to edit. */
export function SharedEventSheet({ event, date, onClose }: SharedEventSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <h2>{event.title}</h2>
        <p className="form-note">{event.ownerName}'s event</p>
        <p className="shared-event-detail">
          {formatWeekday(date)}, {formatMonthDay(date)} · {formatTimeRange(event.startTime, event.endTime)}
        </p>
        <p className="shared-event-detail">{describeRepeat(event)}</p>

        <div className="choice-buttons">
          <button type="button" className="button-plain" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
