import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Smallest and largest height of one hour in pixels. Below the minimum, hour labels overlap. */
const MIN_HOUR_HEIGHT = 32;
const MAX_HOUR_HEIGHT = 240;
const DEFAULT_HOUR_HEIGHT = 88;
/** Where the chosen hour height is remembered on this device. */
const STORAGE_KEY = "calendar.hourHeight";

/** The hour height the user last chose, or the default. */
export function loadHourHeight(): number {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= MIN_HOUR_HEIGHT && saved <= MAX_HOUR_HEIGHT) {
      return saved;
    }
  } catch {
    // Storage can be blocked, for example in a private window. The default is fine then.
  }
  return DEFAULT_HOUR_HEIGHT;
}

function saveHourHeight(hourHeight: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(hourHeight)));
  } catch {
    // Not remembering the size is harmless.
  }
}

/** Two fingers that are down on the day. */
interface Pinch {
  startDistance: number;
  startHourHeight: number;
}

/** A time of day that should stay under the fingers after the hours change size. */
interface Anchor {
  minutes: number;
  /** How far below the top of the visible day that time was, in pixels. */
  offsetY: number;
}

interface UsePinchZoomOptions {
  /** The element that scrolls the day. */
  scrollRef: RefObject<HTMLDivElement | null>;
  hourHeight: number;
  onHourHeightChange: (hourHeight: number) => void;
  /** While true, pinches are ignored (for example, while an event is being dragged). */
  isDisabled: boolean;
  /** Called when two fingers come down, so other gestures can stop. */
  onPinchStart: () => void;
}

function distanceBetween(touches: TouchList): number {
  const [first, second] = [touches[0], touches[1]];
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function middleY(touches: TouchList): number {
  return (touches[0].clientY + touches[1].clientY) / 2;
}

/**
 * Pinching two fingers together makes hours shorter so more of the day fits;
 * spreading them makes hours taller. Returns true while a pinch is happening.
 */
export function usePinchZoom({
  scrollRef,
  hourHeight,
  onHourHeightChange,
  isDisabled,
  onPinchStart,
}: UsePinchZoomOptions): boolean {
  const [isPinching, setIsPinching] = useState(false);
  const pinchRef = useRef<Pinch | null>(null);
  const anchorRef = useRef<Anchor | null>(null);

  // The touch listeners are added once, so they read the latest values from here.
  const latest = useRef({ hourHeight, onHourHeightChange, isDisabled, onPinchStart });
  latest.current = { hourHeight, onHourHeightChange, isDisabled, onPinchStart };

  // After the hours change size, scroll so the time between the fingers hasn't moved.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const anchor = anchorRef.current;
    if (scroller && anchor) {
      scroller.scrollTop = anchor.minutes * (hourHeight / 60) - anchor.offsetY;
      anchorRef.current = null;
    }
  }, [hourHeight, scrollRef]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) {
      return;
    }

    const handleTouchStart = (touchEvent: TouchEvent) => {
      if (touchEvent.touches.length !== 2 || latest.current.isDisabled) {
        return;
      }
      pinchRef.current = {
        startDistance: distanceBetween(touchEvent.touches),
        startHourHeight: latest.current.hourHeight,
      };
      setIsPinching(true);
      latest.current.onPinchStart();
    };

    const handleTouchMove = (touchEvent: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || touchEvent.touches.length !== 2) {
        return;
      }
      // Stop the browser scrolling or zooming the whole page.
      touchEvent.preventDefault();

      const scale = distanceBetween(touchEvent.touches) / pinch.startDistance;
      const nextHourHeight = Math.min(
        Math.max(pinch.startHourHeight * scale, MIN_HOUR_HEIGHT),
        MAX_HOUR_HEIGHT,
      );

      // Remember which time is between the fingers right now.
      const offsetY = middleY(touchEvent.touches) - scroller.getBoundingClientRect().top;
      const pixelsPerMinute = latest.current.hourHeight / 60;
      anchorRef.current = { minutes: (scroller.scrollTop + offsetY) / pixelsPerMinute, offsetY };

      latest.current.onHourHeightChange(nextHourHeight);
    };

    const handleTouchEnd = (touchEvent: TouchEvent) => {
      if (pinchRef.current && touchEvent.touches.length < 2) {
        pinchRef.current = null;
        setIsPinching(false);
        saveHourHeight(latest.current.hourHeight);
      }
    };

    // Safari on iPhone zooms the page with its own gesture events, which touch-action doesn't stop.
    const preventPageZoom = (gestureEvent: Event) => gestureEvent.preventDefault();

    scroller.addEventListener("touchstart", handleTouchStart);
    scroller.addEventListener("touchmove", handleTouchMove, { passive: false });
    scroller.addEventListener("touchend", handleTouchEnd);
    scroller.addEventListener("touchcancel", handleTouchEnd);
    scroller.addEventListener("gesturestart", preventPageZoom);

    return () => {
      scroller.removeEventListener("touchstart", handleTouchStart);
      scroller.removeEventListener("touchmove", handleTouchMove);
      scroller.removeEventListener("touchend", handleTouchEnd);
      scroller.removeEventListener("touchcancel", handleTouchEnd);
      scroller.removeEventListener("gesturestart", preventPageZoom);
    };
  }, [scrollRef]);

  return isPinching;
}
