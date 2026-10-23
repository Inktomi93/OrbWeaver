// RPG definition glosses share one editor; commits truncate to the wire cap.

import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { TrackerValue } from "./tracker-value.tsx";

/** Show the counter from 80% of the cap ("a quiet counter from 80% full"). */
const COUNTER_AT = 0.8;

interface HintEditorProps {
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
