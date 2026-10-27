import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAccount,
  clearSyncCursor,
  getSavedAccount,
  saveAccount,
  type Account,
} from "./account";
import * as api from "./api";
import * as storage from "./storage";
import { sync } from "./sync";
import { BottomNav, type Page } from "./components/BottomNav";
import { DateStrip } from "./components/DateStrip";
import { DayView } from "./components/DayView";
import { EventForm } from "./components/EventForm";
import { Header } from "./components/Header";
import { HomePage } from "./components/HomePage";
import { MigratePrompt } from "./components/MigratePrompt";
import { PlusIcon } from "./components/Icons";
import { RepeatChoiceSheet } from "./components/RepeatChoiceSheet";
import { SettingsPage } from "./components/SettingsPage";
import { addDays, minutesToTime, timeToMinutes, todayKey } from "./dateUtils";
import { registerPush, unregisterPush } from "./notifications";
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
  const [page, setPage] = useState<Page>("calendar");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [account, setAccount] = useState(getSavedAccount);
  /** Events made while signed out, offered to the account that just signed in. 0 hides the offer. */
  const [anonymousCount, setAnonymousCount] = useState(0);

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await storage.getEventsForDay(selectedDate));
      setLoadError("");
    } catch {
      setLoadError("Couldn't load your events.");
    }
    // Storage shows the signed-in user's events, so load again when that changes.
  }, [selectedDate, account]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Syncs finish in the background, so they reload with whatever day is showing by then.
  const loadEventsRef = useRef(loadEvents);
  loadEventsRef.current = loadEvents;

  /** Syncs in the background and shows anything that came from other devices. */
  const syncInBackground = useCallback(async () => {
    if (await sync()) {
      await loadEventsRef.current();
    }
  }, []);

  // Sync on start, when the connection comes back, and when the app is brought back to the
  // front, which is when changes from other devices are most likely waiting.
  useEffect(() => {
    syncInBackground();
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") {
        syncInBackground();
      }
    };
    window.addEventListener("online", syncInBackground);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.removeEventListener("online", syncInBackground);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [syncInBackground]);

  const signedIn = async (newAccount: Account) => {
    saveAccount(newAccount);
    setAccount(newAccount);
    // Sends this device's reminder choice, kept from before, to the account just signed in.
    registerPush();
    setPage("calendar");
    syncInBackground();
    setAnonymousCount(await storage.countAnonymousEvents());
  };

  const addAnonymousEvents = async () => {
    setAnonymousCount(0);
    if (account) {
      await storage.claimAnonymousEvents(account.user.id);
      await loadEvents();
      syncInBackground();
    }
  };

  const signOut = async () => {
    if (!account) {
      return;
    }
    // Upload anything not yet saved, so signing out doesn't lose it.
    await sync();
    if ((await storage.getDirtyEvents(account.user.id)).length > 0) {
      setLoadError("Couldn't save your latest changes. Connect to the internet and try again.");
      return;
    }
    // While the token still works, so the server stops sending this device the account's reminders.
    await unregisterPush();
    // The session is forgotten here either way; the server dropping it too is just tidier.
    api.signOut(account.token).catch(() => {});
    clearAccount();
    clearSyncCursor(account.user.id);
    await storage.clearUserEvents(account.user.id);
    setAccount(null);
  };

  const closeForm = () => setFormState({ mode: "closed" });

  const saveEvent = async (input: EventInput, scope: RepeatScope) => {
    if (formState.mode === "edit") {
      await storage.updateEvent(formState.event, selectedDate, input, scope);
    } else {
      await storage.createEvent(input);
    }
    closeForm();
    await loadEvents();
    syncInBackground();
  };

  const deleteEvent = async (scope: RepeatScope) => {
    if (formState.mode === "edit") {
      await storage.deleteEvent(formState.event, selectedDate, scope);
    }
    closeForm();
    await loadEvents();
    syncInBackground();
  };

  const saveMove = async ({ event, input }: PendingMove, scope: RepeatScope) => {
    try {
      await storage.updateEvent(event, selectedDate, input, scope);
      // Moving part of a series creates new events, so reload to show them.
      await loadEvents();
      syncInBackground();
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

  const migratePrompt = anonymousCount > 0 && (
    <MigratePrompt
      count={anonymousCount}
      onAdd={addAnonymousEvents}
      onNotNow={() => setAnonymousCount(0)}
    />
  );

  if (page === "home") {
    return (
      <div className="app">
        <HomePage account={account} onSignedIn={signedIn} />
        <BottomNav currentPage={page} onSelectPage={setPage} />
        {migratePrompt}
      </div>
    );
  }

  if (page === "settings") {
    return (
      <div className="app">
        {loadError && <div className="error-banner">{loadError}</div>}
        <SettingsPage account={account} onGoToSignIn={() => setPage("home")} onSignOut={signOut} />
        <BottomNav currentPage={page} onSelectPage={setPage} />
      </div>
    );
  }

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

      <BottomNav currentPage={page} onSelectPage={setPage} />

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

      {migratePrompt}
    </div>
  );
}
