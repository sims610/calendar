import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { timeToMinutes } from "./dateUtils";
import type { CalendarEvent } from "./types";

/** How long a finger must stay on an event before it can be moved. */
const LONG_PRESS_MS = 500;
/** Moving further than this before the long press finishes means the user is scrolling. */
const MOVE_TOLERANCE_PX = 8;
/** Moved events snap to quarter hours. */
const SNAP_MINUTES = 15;
/** 23:59 — events can't end later than this. */
const LAST_MINUTE_OF_DAY = 24 * 60 - 1;
/** Holding an event this close to the top or bottom edge scrolls the day. */
const EDGE_SCROLL_ZONE_PX = 48;
const EDGE_SCROLL_STEP_PX = 8;

/** Where the event being moved would land if it were dropped now. */
export interface DragPreview {
  eventId: number;
  startMinutes: number;
}

/** A finger (or mouse button) that is down on an event. */
interface Press {
  event: CalendarEvent;
  pointerId: number;
  target: HTMLElement;
  startX: number;
  startY: number;
  lastY: number;
  /** Minutes between the event's start and the point that was grabbed. */
  grabOffsetMinutes: number;
  durationMinutes: number;
  /** False while waiting for the long press, true once the event is being moved. */
  isDragging: boolean;
  longPressTimer: number;
  scrollFrame: number;
}

interface UseEventDragOptions {
  /** The element that scrolls the day. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The element whose top is midnight. */
  gridRef: RefObject<HTMLDivElement | null>;
  pixelsPerMinute: number;
  onMove: (event: CalendarEvent, startMinutes: number) => void;
}

/** Lets the user press and hold an event, then drag it to an earlier or later time. */
export function useEventDrag({ scrollRef, gridRef, pixelsPerMinute, onMove }: UseEventDragOptions) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const pressRef = useRef<Press | null>(null);
  const previewRef = useRef<DragPreview | null>(null);
  // The browser sends a click after a drag ends; this stops it opening the event form.
  const ignoreNextClickRef = useRef(false);

  const showPreview = (next: DragPreview | null) => {
    previewRef.current = next;
    setPreview(next);
  };

  /** Converts a pointer's screen position to minutes since midnight. */
  const minutesAt = (clientY: number) => {
    const gridTop = gridRef.current?.getBoundingClientRect().top ?? 0;
    return (clientY - gridTop) / pixelsPerMinute;
  };

  const updatePreview = () => {
    const press = pressRef.current;
    if (!press?.isDragging) {
      return;
    }

    const rawStart = minutesAt(press.lastY) - press.grabOffsetMinutes;
    const snappedStart = Math.round(rawStart / SNAP_MINUTES) * SNAP_MINUTES;
    const latestStart = LAST_MINUTE_OF_DAY - press.durationMinutes;
    const startMinutes = Math.min(Math.max(snappedStart, 0), latestStart);

    if (previewRef.current?.startMinutes !== startMinutes) {
      showPreview({ eventId: press.event.id, startMinutes });
    }
  };

  // Runs every frame while dragging, scrolling the day when the finger is near an edge.
  const scrollNearEdges = () => {
    const press = pressRef.current;
    const scroller = scrollRef.current;
    if (!press?.isDragging || !scroller) {
      return;
    }

    const bounds = scroller.getBoundingClientRect();
    if (press.lastY < bounds.top + EDGE_SCROLL_ZONE_PX) {
      scroller.scrollTop -= EDGE_SCROLL_STEP_PX;
    } else if (press.lastY > bounds.bottom - EDGE_SCROLL_ZONE_PX) {
      scroller.scrollTop += EDGE_SCROLL_STEP_PX;
    }

    updatePreview();
    press.scrollFrame = requestAnimationFrame(scrollNearEdges);
  };

  const startDragging = () => {
    const press = pressRef.current;
    if (!press) {
      return;
    }

    press.isDragging = true;
    press.target.setPointerCapture(press.pointerId);
    navigator.vibrate?.(30);
    showPreview({ eventId: press.event.id, startMinutes: timeToMinutes(press.event.startTime) });
    press.scrollFrame = requestAnimationFrame(scrollNearEdges);
  };

  const endPress = () => {
    const press = pressRef.current;
    if (press) {
      window.clearTimeout(press.longPressTimer);
      cancelAnimationFrame(press.scrollFrame);
    }
    pressRef.current = null;
    showPreview(null);
  };

  // Touch scrolling can only be blocked from a non-passive listener, which React can't add.
  useEffect(() => {
    const blockScrollWhileDragging = (touchEvent: TouchEvent) => {
      if (pressRef.current?.isDragging) {
        touchEvent.preventDefault();
      }
    };
    document.addEventListener("touchmove", blockScrollWhileDragging, { passive: false });

    return () => {
      document.removeEventListener("touchmove", blockScrollWhileDragging);
      endPress();
    };
  }, []);

  /** Pointer handlers to spread onto an event's element. */
  const handlersFor = (event: CalendarEvent) => ({
    onPointerDown: (pointerEvent: PointerEvent<HTMLElement>) => {
      // Only the main mouse button; touches and pens always count.
      if (pointerEvent.button !== 0) {
        return;
      }
      // A touch drag doesn't always end in a click, so don't let an old flag eat this tap.
      ignoreNextClickRef.current = false;
      // A second finger landing on another event replaces the first press.
      endPress();

      const startMinutes = timeToMinutes(event.startTime);
      pressRef.current = {
        event,
        pointerId: pointerEvent.pointerId,
        target: pointerEvent.currentTarget,
        startX: pointerEvent.clientX,
        startY: pointerEvent.clientY,
        lastY: pointerEvent.clientY,
        grabOffsetMinutes: minutesAt(pointerEvent.clientY) - startMinutes,
        durationMinutes: timeToMinutes(event.endTime) - startMinutes,
        isDragging: false,
        longPressTimer: window.setTimeout(startDragging, LONG_PRESS_MS),
        scrollFrame: 0,
      };
    },

    onPointerMove: (pointerEvent: PointerEvent<HTMLElement>) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== pointerEvent.pointerId) {
        return;
      }

      if (press.isDragging) {
        press.lastY = pointerEvent.clientY;
        updatePreview();
        return;
      }

      // Moving before the long press finishes is a scroll, not a drag.
      const distance = Math.hypot(
        pointerEvent.clientX - press.startX,
        pointerEvent.clientY - press.startY,
      );
      if (distance > MOVE_TOLERANCE_PX) {
        endPress();
      }
    },

    onPointerUp: () => {
      const press = pressRef.current;
      const dropped = previewRef.current;

      if (press?.isDragging) {
        ignoreNextClickRef.current = true;
        if (dropped && dropped.startMinutes !== timeToMinutes(press.event.startTime)) {
          onMove(press.event, dropped.startMinutes);
        }
      }
      endPress();
    },

    // The browser took over the touch (for example, to scroll), so drop the drag.
    onPointerCancel: endPress,

    // Stops the long press menu (copy, share, ...) on phones.
    onContextMenu: (menuEvent: MouseEvent) => menuEvent.preventDefault(),
  });

  /** Returns true if this click came from finishing a drag and should be ignored. */
  const shouldIgnoreClick = () => {
    const ignore = ignoreNextClickRef.current;
    ignoreNextClickRef.current = false;
    return ignore;
  };

  return { preview, handlersFor, shouldIgnoreClick, cancel: endPress };
}
