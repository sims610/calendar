interface MigratePromptProps {
  /** How many events were made on this device while signed out. */
  count: number;
  onAdd: () => void;
  onNotNow: () => void;
}

/** Offers to move the events made while signed out into the account that just signed in. */
export function MigratePrompt({ count, onAdd, onNotNow }: MigratePromptProps) {
  return (
    <div className="sheet-backdrop" onClick={onNotNow}>
      <div className="sheet" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <h2>
          Found {count} {count === 1 ? "event" : "events"} on this device
        </h2>
        <p className="form-note">
          Add them to your account to see them on all your devices. If you don't, they stay on
          this device and show again when you sign out.
        </p>

        <div className="choice-buttons">
          <button type="button" className="button-primary" onClick={onAdd}>
            Add to my account
          </button>
          <button type="button" className="button-plain" onClick={onNotNow}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
