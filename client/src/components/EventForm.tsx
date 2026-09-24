import { useState, type FormEvent } from "react";
import type { CalendarEvent, EventInput, RepeatRule } from "../types";

interface EventFormProps {
  /** The event being edited, or null when creating a new one. */
  event: CalendarEvent | null;
  /** Starting values for a new event. */
  defaults: EventInput;
  onSave: (input: EventInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

/** A bottom sheet for creating, editing and deleting an event. */
export function EventForm({ event, defaults, onSave, onDelete, onClose }: EventFormProps) {
  const [form, setForm] = useState<EventInput>(event ?? defaults);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = event !== null;

  const updateField = <Key extends keyof EventInput>(key: Key, value: EventInput[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
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
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setError("End time must be after start time.");
      return;
    }
    run(() => onSave({ ...form, title: form.title.trim() }));
  };

  const handleDelete = () => {
    const message =
      form.repeat === "none"
        ? "Delete this event?"
        : "Delete this event? All of its repeats will be deleted too.";
    if (window.confirm(message)) {
      run(onDelete);
    }
  };

  return (
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
          {form.repeat === "none" ? "Date" : "Starts on"}
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
          <select
            value={form.repeat}
            onChange={(e) => updateField("repeat", e.target.value as RepeatRule)}
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {isEditing && form.repeat !== "none" && (
          <p className="form-note">Changes apply to every repeat of this event.</p>
        )}
        {error && <p className="form-error">{error}</p>}

        <div className="form-buttons">
          {isEditing && (
            <button type="button" className="button-danger" onClick={handleDelete} disabled={isSaving}>
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
  );
}
