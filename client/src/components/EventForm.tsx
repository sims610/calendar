import { useState, type FormEvent } from "react";
import { fromDateKey } from "../dateUtils";
import type { CalendarEvent, EventInput, RepeatRule, RepeatScope } from "../types";
import { RepeatChoiceSheet } from "./RepeatChoiceSheet";

interface EventFormProps {
  /** The event being edited, or null when creating a new one. */
  event: CalendarEvent | null;
  /** What the fields start with. When editing, the date is the day the event was opened from. */
  initialValues: EventInput;
  /** `scope` says which days of a repeating event the changes apply to. */
  onSave: (input: EventInput, scope: RepeatScope) => Promise<void>;
  onDelete: (scope: RepeatScope) => Promise<void>;
  onClose: () => void;
}

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "custom", label: "Custom…" },
];

/** Buttons for a custom repeat's weekdays, Sunday first like Date.getDay(). */
const WEEKDAYS = [
  { letter: "S", name: "Sunday" },
  { letter: "M", name: "Monday" },
  { letter: "T", name: "Tuesday" },
  { letter: "W", name: "Wednesday" },
  { letter: "T", name: "Thursday" },
  { letter: "F", name: "Friday" },
  { letter: "S", name: "Saturday" },
];

const MAX_REPEAT_INTERVAL = 52;

/** Whether two custom repeats happen on the same days and weeks. */
function sameRepeatPattern(a: EventInput, b: EventInput): boolean {
  return (
    a.repeat !== "custom" ||
    (a.repeatInterval === b.repeatInterval && a.repeatDays?.join() === b.repeatDays?.join())
  );
}

/** A bottom sheet for creating, editing and deleting an event. */
export function EventForm({ event, initialValues, onSave, onDelete, onClose }: EventFormProps) {
  const [form, setForm] = useState<EventInput>(initialValues);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  /** Set while asking whether a save or delete is for one day or the rest of the series. */
  const [pendingChoice, setPendingChoice] = useState<"save" | "delete" | null>(null);

  const isEditing = event !== null;
  const isEditingRepeatingEvent = isEditing && event.repeat !== "none";
  const trimmedForm = { ...form, title: form.title.trim() };

  const updateField = <Key extends keyof EventInput>(key: Key, value: EventInput[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const changeRepeat = (repeat: RepeatRule) => {
    setForm((current) => {
      if (repeat !== "custom" || current.repeatDays) {
        return { ...current, repeat };
      }
      // Start a new custom repeat on the date's weekday, every week.
      return { ...current, repeat, repeatDays: [fromDateKey(current.date).getDay()], repeatInterval: 1 };
    });
  };

  const toggleRepeatDay = (day: number) => {
    setForm((current) => {
      const days = current.repeatDays ?? [];
      const repeatDays = days.includes(day)
        ? days.filter((chosen) => chosen !== day)
        : [...days, day].sort((a, b) => a - b);
      return { ...current, repeatDays };
    });
  };

  /** Runs a save or delete, showing any error inside the form. */
  const run = async (action: () => Promise<void>) => {
    setIsSaving(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      setIsSaving(false);
    }
  };

  const handleSubmit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!trimmedForm.title) {
      setError("Title is required.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setError("End time must be after start time.");
      return;
    }
    if (form.repeat === "custom") {
      if (!form.repeatDays?.length) {
        setError("Choose at least one day to repeat on.");
        return;
      }
      const interval = form.repeatInterval ?? NaN;
      if (!Number.isInteger(interval) || interval < 1 || interval > MAX_REPEAT_INTERVAL) {
        setError(`Repeat every 1 to ${MAX_REPEAT_INTERVAL} weeks.`);
        return;
      }
    }

    if (isEditingRepeatingEvent) {
      setPendingChoice("save");
    } else {
      // A one-off event only has one day, so "this and future" is the whole event.
      run(() => onSave(trimmedForm, "this-and-future"));
    }
  };

  const handleDelete = () => {
    if (isEditingRepeatingEvent) {
      setPendingChoice("delete");
    } else if (window.confirm("Delete this event?")) {
      run(() => onDelete("this-and-future"));
    }
  };

  const handleChoice = (scope: RepeatScope) => {
    const choice = pendingChoice;
    setPendingChoice(null);
    if (choice === "save") {
      run(() => onSave(trimmedForm, scope));
    } else {
      run(() => onDelete(scope));
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}>
        <form
          className="sheet"
          onSubmit={handleSubmit}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <h2>{isEditing ? "Edit event" : "New event"}</h2>

          <label>
            Title
            <input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </label>

          <label>
            {form.repeat === "none" || isEditing ? "Date" : "Starts on"}
            <input
              type="date"
              value={form.date}
              onChange={(e) => updateField("date", e.target.value)}
              required
            />
          </label>

          <div className="form-row">
            <label>
              Start
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => updateField("startTime", e.target.value)}
                required
              />
            </label>
            <label>
              End
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => updateField("endTime", e.target.value)}
                required
              />
            </label>
          </div>

          <label>
            Repeat
            <select value={form.repeat} onChange={(e) => changeRepeat(e.target.value as RepeatRule)}>
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {form.repeat === "custom" && (
            <>
              <div className="repeat-interval">
                Every
                <input
                  type="number"
                  min={1}
                  max={MAX_REPEAT_INTERVAL}
                  // Empty while the user clears the box to type a new number.
                  value={Number.isNaN(form.repeatInterval) ? "" : form.repeatInterval}
                  onChange={(e) => updateField("repeatInterval", e.target.valueAsNumber)}
                  aria-label="Number of weeks"
                />
                {form.repeatInterval === 1 ? "week" : "weeks"}
              </div>
              <div className="repeat-days" role="group" aria-label="Repeat on">
                {WEEKDAYS.map((weekday, day) => (
                  <button
                    key={weekday.name}
                    type="button"
                    className="repeat-day"
                    aria-label={weekday.name}
                    aria-pressed={form.repeatDays?.includes(day) ?? false}
                    onClick={() => toggleRepeatDay(day)}
                  >
                    {weekday.letter}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="form-buttons">
            {isEditing && (
              <button
                type="button"
                className="button-danger"
                onClick={handleDelete}
                disabled={isSaving}
              >
                Delete
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="button-plain" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={isSaving}>
              Save
            </button>
          </div>
        </form>
      </div>

      {pendingChoice && (
        <RepeatChoiceSheet
          title={pendingChoice === "save" ? "Save repeating event" : "Delete repeating event"}
          // Changing how often it repeats can't apply to a single day.
          allowOnlyThis={
            pendingChoice === "delete" ||
            (event !== null && form.repeat === event.repeat && sameRepeatPattern(form, event))
          }
          onChoose={handleChoice}
          onCancel={() => setPendingChoice(null)}
        />
      )}
    </>
  );
}
