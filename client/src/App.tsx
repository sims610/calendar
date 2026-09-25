import { useCallback, useEffect, useState } from "react";
import * as storage from "./storage";
import { BottomNav } from "./components/BottomNav";
import { DateStrip } from "./components/DateStrip";
import { DayView } from "./components/DayView";
import { EventForm } from "./components/EventForm";
import { Header } from "./components/Header";
import { PlusIcon } from "./components/Icons";
import { RepeatChoiceSheet } from "./components/RepeatChoiceSheet";
import { addDays, minutesToTime, timeToMinutes, todayKey } from "./dateUtils";
import type { CalendarEvent, EventInput, RepeatScope } from "./types";

/**
 * What the event form is doing: closed, creating a new event, or editing one.
 * A new event made by tapping an empty hour starts at that hour.
 */
type FormState =
  | { mode: "closed" }
  | { mode: "create"; startHour?: number }
  | { mode: "edit"; event: CalendarEvent };

/** A repeating event that was dragged to a new time, waiting for the user to pick which days move. */
interface PendingMove {
  event: CalendarEvent;
  /** The event's details with the new times. */
  input: EventInput;
}

/** The last minute of the day, as late as an event can end. */
const END_OF_DAY_MINUTES = 23 * 60 + 59;

/**
 * Starting values for a new event, one hour long. It starts at `startHour` when given,
 * otherwise at the next full hour on the selected day.
 */
function newEventDefaults(date: string, startHour?: number): EventInput {
  // Keep the default event inside the day.
  const nextHour = Math.min(date === todayKey() ? new Date().getHours() + 1 : 9, 22);
  const startMinutes = (startHour ?? nextHour) * 60;

  return {
    title: "",
    date,
    startTime: minutesToTime(startMinutes),
    // An event at 11 PM ends at 11:59 PM, since the day has no 24:00.
    endTime: minutesToTime(Math.min(startMinutes + 60, END_OF_DAY_MINUTES)),
    repeat: "none",
  };
}

/** The form's starting values for an event opened from `date`. */
function editValues(event: CalendarEvent, date: string): EventInput {
  return {
    title: event.title,
    // A repeating event is edited from the day it was opened on, not the day it started.
    date,
    startTime: event.startTime,
    endTime: event.endTime,
    repeat: event.repeat,
  };
}

export function App() {
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await storage.getEventsForDay(selectedDate));
      setLoadError("");
    } catch {
      setLoadError("Couldn't load your events.");
    }
  }, [selectedDate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const closeForm = () => setFormState({ mode: "closed" });

  const saveEvent = async (input: EventInput, scope: RepeatScope) => {
    if (formState.mode === "edit") {
      await storage.updateEvent(formState.event, selectedDate, input, scope);
    } else {
      await storage.createEvent(input);
    }
    closeForm();
    await loadEvents();
  };

  const deleteEvent = async (scope: RepeatScope) => {
    if (formState.mode === "edit") {
      await storage.deleteEvent(formState.event, selectedDate, scope);
    }
    closeForm();
    await loadEvents();
  };

  const saveMove = async ({ event, input }: PendingMove, scope: RepeatScope) => {
    try {
      await storage.updateEvent(event, selectedDate, input, scope);
      // Moving part of a series creates new events, so reload to show them.
      await loadEvents();
    } catch {
      // Put the event back where it was saved, then explain why.
      await loadEvents();
      setLoadError("Couldn't move the event.");
    }
  };

  /** Called when an event is dragged to a new start time. It keeps its length. */
  const moveEvent = (event: CalendarEvent, startMinutes: number) => {
    const duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    const startTime = minutesToTime(startMinutes);
    const endTime = minutesToTime(startMinutes + duration);
    const move: PendingMove = {
      event,
      input: { ...editValues(event, selectedDate), startTime, endTime },
    };

    // Show the new time straight away so the event doesn't jump back while saving or asking.
    setEvents((current) =>
      current.map((item) => (item.id === event.id ? { ...item, startTime, endTime } : item)),
    );

    if (event.repeat === "none") {
      // A one-off event only has one day, so "this and future" is the whole event.
      saveMove(move, "this-and-future");
    } else {
      setPendingMove(move);
    }
  };

  const chooseMoveScope = (scope: RepeatScope) => {
    if (pendingMove) {
      saveMove(pendingMove, scope);
    }
    setPendingMove(null);
  };

  const cancelMove = () => {
    setPendingMove(null);
    // Put the event back at its saved time.
    loadEvents();
  };

  return (
    <div className="app">
      <Header selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {loadError && <div className="error-banner">{loadError}</div>}

      <main className="main">
        <DayView
          date={selectedDate}
          events={events}
          onEventClick={(event) => setFormState({ mode: "edit", event })}
          onEventMove={moveEvent}
          onEmptySlotClick={(hour) => setFormState({ mode: "create", startHour: hour })}
          onNextDay={() => setSelectedDate(addDays(selectedDate, 1))}
          onPreviousDay={() => setSelectedDate(addDays(selectedDate, -1))}
        />
        <button
          className="fab"
          onClick={() => setFormState({ mode: "create" })}
          aria-label="Add event"
        >
          <PlusIcon size={32} />
        </button>
      </main>

      <BottomNav />

      {formState.mode !== "closed" && (
        <EventForm
          event={formState.mode === "edit" ? formState.event : null}
          initialValues={
            formState.mode === "edit"
              ? editValues(formState.event, selectedDate)
              : newEventDefaults(selectedDate, formState.startHour)
          }
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={closeForm}
        />
      )}

      {pendingMove && (
        <RepeatChoiceSheet
          title="Move repeating event"
          onChoose={chooseMoveScope}
          onCancel={cancelMove}
        />
      )}
    </div>
  );
}
