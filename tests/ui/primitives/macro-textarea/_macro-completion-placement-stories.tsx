import { CtIsolation } from "@orb/testkit/browser";
import { Stack } from "@orb/ui/layout";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import type { ReactElement } from "react";
import { useState } from "react";

const CATEGORIES = ["identity", "card", "state"] as const;
// Interleaved on purpose: a bare `{{` lists the head of this array in order, so each category recurs.
const SUGGESTIONS: readonly MacroSuggestion[] = Array.from({ length: 12 }, (_unused, index) => ({
  name: `macro_${index}`,
  category: CATEGORIES[index % CATEGORIES.length] ?? "state",
  description: `Macro number ${index}.`,
}));

const JUSTIFY = { start: "start", middle: "center", end: "end" } as const;

export interface MacroCompletionPlacementProps {
  /** Where the field sits in a viewport-tall column. */
  readonly sits: keyof typeof JUSTIFY;
}

/** A completion field at a chosen height of a viewport-tall column, over a catalog that recurs across categories. */
export function MacroCompletionPlacementStory({ sits }: MacroCompletionPlacementProps): ReactElement {
  const [value, setValue] = useState("");
  return (
    <CtIsolation subject="MacroTextarea" isolates="Where the completion list seats against the viewport, without the editor around it">
      <Stack height="viewport" justify={JUSTIFY[sits]}>
        <MacroTextarea aria-label="Prompt" onChange={setValue} rows={4} suggestions={SUGGESTIONS} value={value} />
      </Stack>
    </CtIsolation>
  );
}
