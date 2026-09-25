import { useEffect, useState } from "react";
import { formatClock, todayKey } from "../dateUtils";

interface CurrentTimeLineProps {
  date: string;
  pixelsPerMinute: number;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** A red line in the hour column that marks the current time on today's view. */
export function CurrentTimeLine({ date, pixelsPerMinute }: CurrentTimeLineProps) {
  const [now, setNow] = useState(() => new Date());

  // Update right as each new minute starts, so the label matches the phone's clock.
  useEffect(() => {
    let timer: number;

    function scheduleNextTick() {
      const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleNextTick();
      }, msUntilNextMinute);
    }

    scheduleNextTick();
    return () => window.clearTimeout(timer);
  }, []);

  // `now` changing re-renders this component, so this also catches midnight.
  if (date !== todayKey()) {
    return null;
  }

  const minutes = minutesSinceMidnight(now);

  return (
    <div className="current-time" style={{ top: minutes * pixelsPerMinute }}>
      <span className="current-time-label">{formatClock(minutes)}</span>
    </div>
  );
}
