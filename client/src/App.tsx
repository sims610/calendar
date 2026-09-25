import { useCallback, useEffect, useState } from "react";
import * as storage from "./storage";
import { BottomNav } from "./components/BottomNav";
import { DateStrip } from "./components/DateStrip";
import { DayView } from "./components/DayView";
import { EventForm } from "./components/EventForm";
import { Header } from "./components/Header";
import { PlusIcon } from "./components/Icons";
import { minutesToTime, timeToMinutes, todayKey } from "./dateUtils";
import type { CalendarEvent, EventInput } from "./types";

/** What the event form is doing: closed, creating a new event, or editing one. */
type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; event: CalendarEvent };

/** Starting values for a new event: the next full hour on the selected day, one hour long. */
function newEventDefaults(date: string): EventInput {
  const nextHour = date === todayKey() ? new Date().getHours() + 1 : 9;
  // Keep the event inside the day.
  const startHour = Math.min(nextHour, 22);

  return {
    title: "",
    date,
    startTime: minutesToTime(startHour * 60),
    endTime: minutesToTime((startHour + 1) * 60),
    repeat: "none",
  };
}

export function App() {
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });

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

  const saveEvent = async (input: EventInput) => {
    if (formState.mode === "edit") {
      await storage.updateEvent(formState.event.id, input);
    } else {
      await storage.createEvent(input);
    }
    closeForm();
    await loadEvents();
  };

  const deleteEvent = async () => {
    if (formState.mode === "edit") {
      await storage.deleteEvent(formState.event.id);
    }
    closeForm();
    await loadEvents();
  };

  /** Moves an event to a new start time, keeping its length. Repeating events move as a series. */
  const moveEvent = async (event: CalendarEvent, startMinutes: number) => {
    const duration = timeToMinutes(event.endTime) - timeToMinutes(event.startTime);
    const moved: CalendarEvent = {
      ...event,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(startMinutes + duration),
    };

    // Show the new time straight away so the event doesn't jump back while saving.
    setEvents((current) => current.map((item) => (item.id === moved.id ? moved : item)));
    try {
      await storage.updateEvent(moved.id, moved);
    } catch {
      // Put the event back where it was saved, then explain why.
      await loadEvents();
      setLoadError("Couldn't move the event.");
    }
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
          defaults={newEventDefaults(selectedDate)}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
