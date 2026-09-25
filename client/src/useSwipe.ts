import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** How far the finger must travel sideways to count as a swipe. */
const MIN_SWIPE_PX = 60;
/** Sideways movement smaller than this is ignored, so a shaky tap doesn't wiggle the day. */
const START_FOLLOWING_PX = 10;
/** The swipe must be at least this many times wider than it is tall, so scrolling isn't mistaken for it. */
const HORIZONTAL_RATIO = 2;

interface UseSwipeOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  /** While true, gestures are ignored (for example, while an event is being dragged). */
  isDisabled: boolean;
}

/** A finger (or mouse button) that is down and might become a swipe. */
interface SwipeStart {
  pointerId: number;
  x: number;
  y: number;
}

function isMostlySideways(distanceX: number, distanceY: number): boolean {
  return Math.abs(distanceX) >= Math.abs(distanceY) * HORIZONTAL_RATIO;
}

/**
 * Detects left and right swipes, and reports how far the finger has moved sideways
 * so the page can follow it. The element using it needs `touch-action: pan-y`
 * so the browser keeps sending sideways movement instead of treating it as its own gesture.
 */
export function useSwipe({ onSwipeLeft, onSwipeRight, isDisabled }: UseSwipeOptions) {
  const startRef = useRef<SwipeStart | null>(null);
  // Letting go of a mouse swipe also sends a click; this stops it opening an event.
  const justSwipedRef = useRef(false);
  /** How far the finger has moved sideways, in pixels. 0 when not swiping. */
  const [offsetX, setOffsetX] = useState(0);
  /** True while the page is following the finger. */
  const [isSwiping, setIsSwiping] = useState(false);

  const reset = () => {
    startRef.current = null;
    setOffsetX(0);
    setIsSwiping(false);
  };

  const handlers = {
    onPointerDown: (pointerEvent: PointerEvent<HTMLElement>) => {
      justSwipedRef.current = false;
      startRef.current = {
        pointerId: pointerEvent.pointerId,
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      };
    },

    onPointerMove: (pointerEvent: PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      if (!start || start.pointerId !== pointerEvent.pointerId) {
        return;
      }
      // Once another gesture (like a pinch) takes over, this touch can't become a swipe.
      if (isDisabled) {
        reset();
        return;
      }

      const distanceX = pointerEvent.clientX - start.x;
      const distanceY = pointerEvent.clientY - start.y;

      if (!isSwiping) {
        if (Math.abs(distanceX) < START_FOLLOWING_PX || !isMostlySideways(distanceX, distanceY)) {
          return;
        }
        // Keep getting moves even if a mouse leaves the calendar mid-swipe.
        pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
        setIsSwiping(true);
      }
      setOffsetX(distanceX);
    },

    onPointerUp: (pointerEvent: PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      // Letting go snaps the page back into place unless it turns out to be a swipe.
      reset();
      if (!start || start.pointerId !== pointerEvent.pointerId || isDisabled) {
        return;
      }

      const distanceX = pointerEvent.clientX - start.x;
      const distanceY = pointerEvent.clientY - start.y;
      if (Math.abs(distanceX) < MIN_SWIPE_PX || !isMostlySideways(distanceX, distanceY)) {
        return;
      }

      justSwipedRef.current = true;
      if (distanceX < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    },

    // Runs before the click reaches anything inside, such as an event.
    onClickCapture: (clickEvent: MouseEvent) => {
      if (justSwipedRef.current) {
        clickEvent.stopPropagation();
        justSwipedRef.current = false;
      }
    },

    // The browser took over the touch (for example, to scroll up or down).
    onPointerCancel: reset,
  };

  return { handlers, offsetX, isSwiping };
}
