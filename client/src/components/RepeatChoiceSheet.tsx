import type { RepeatScope } from "../types";

interface RepeatChoiceSheetProps {
  /** For example "Delete repeating event". */
  title: string;
  /** False when the change only makes sense for the whole series (like changing how it repeats). */
  allowOnlyThis?: boolean;
  onChoose: (scope: RepeatScope) => void;
  onCancel: () => void;
}

/** Asks whether a change to a repeating event is for just this day, or this day and later ones. */
export function RepeatChoiceSheet({
  title,
  allowOnlyThis = true,
  onChoose,
  onCancel,
}: RepeatChoiceSheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(clickEvent) => clickEvent.stopPropagation()}>
        <h2>{title}</h2>
        <p className="form-note">Earlier days of this event won't change.</p>

        <div className="choice-buttons">
          {allowOnlyThis && (
            <button type="button" className="button-choice" onClick={() => onChoose("only-this")}>
              Only this event
            </button>
          )}
          <button
            type="button"
            className="button-choice"
            onClick={() => onChoose("this-and-future")}
          >
            This and all future events
          </button>
          <button type="button" className="button-plain" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
