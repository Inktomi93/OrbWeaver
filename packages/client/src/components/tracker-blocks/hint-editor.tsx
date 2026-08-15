// The HINT-EDITOR primitive (RV-8's third block, beside `AddRow` + `TrackerValue`). A hint is not decoration:
// it is the GLOSS the prompt carries ("Grit (\"resolve you spend to push through\")"), the proven steering
// lever (R4b — measured Δ −0.12 bare vs −1.00 glossed), which is exactly why the tracked-field unification
// calls a hint editor NON-NEGOTIABLE on every def surface. Before this, hints were authorable on some planes
// and unauthorable on others; one block ⇒ every def plane (trackers · attributes · relationship labels)
// authors its gloss with the same gesture, the same cap, and the same counter.
//
// Anatomy: the muted "hint" tag (so an empty hint still reads as an offered field, not a gap) + the inline
// display-at-rest value + the quiet counter from 80% of the cap. A commit is TRUNCATED to
// `max` (the wire cap is the same number — the field can't author a rejectable value).

import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { TrackerValue } from "./tracker-value.tsx";

/** Show the counter from 80% of the cap ("a quiet counter from 80% full"). */
const COUNTER_AT = 0.8;

export interface HintEditorProps {
  /** The value's accessible name ("Grit hint"). */
  readonly ariaLabel: string;
  readonly hint: string;
  /** The wire cap (`RPG_HINT_MAX`) — commits truncate to it. */
  readonly max: number;
  /** Commit the (already truncated) hint. Absent ⇒ the read-only arm. */
  readonly onEdit?: (next: string) => void;
  /** @defaultValue "what this means — the story reads this…" */
  readonly placeholder?: string;
}

/** The gloss field: `hint · <the sentence the model reads>` + the near-cap counter. */
export function HintEditor({ ariaLabel, hint, max, onEdit, placeholder = "what this means — the story reads this…" }: HintEditorProps): ReactElement | null {
  // Read-only + empty = nothing to say (never an empty labelled row on a viewer's surface).
  if (onEdit === undefined && hint === "") {
    return null;
  }
  return (
    <Row gap="field" align="center" data-slot="hint-editor">
      <Text as="span" size="micro" tone="muted" className="shrink-0">
        hint
      </Text>
      <TrackerValue
        ariaLabel={ariaLabel}
        display={hint}
        placeholder={placeholder}
        tone="muted"
        {...(onEdit === undefined ? {} : { onEdit: (next: string): void => onEdit(next.slice(0, max)) })}
        className="min-w-0 flex-1"
      />
      {hint.length < max * COUNTER_AT ? null : (
        <Text as="span" size="micro" tone="muted" className="shrink-0 tabular-nums">
          {hint.length}/{max}
        </Text>
      )}
    </Row>
  );
}
