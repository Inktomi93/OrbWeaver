// The ONE `RegexPlacement` display-label map (side-eye F-23, 2026-08-02). A regex script's placement had
// TWO vocabularies for one pipeline stage: the editor dialog offered the raw enum member (`USER_INPUT`,
// `AI_OUTPUT` — a wire identifier the user is asked to choose between), while the Transforms readout
// printed prose for the same stage ("Regex · your message"). One pipeline, two names, and neither surface
// could be read against the other.
//
// The labels name WHAT THE STAGE OPERATES ON, in the reading order the pipeline runs them, because that is
// the question both surfaces answer: the editor's "where does this script bite?" and the readout's "which
// stage do I edit?". `lib/` is the shared home — the editor dialog is client-shared and the readout is a
// feature, and features cannot import each other (the `MESSAGE_ROLE_LABELS` precedent).

import type { RegexPlacement } from "@orb/kit/regex";
import { REGEX_PLACEMENTS } from "@orb/kit/regex";

/** Computed-key form (the `DEFAULT_MARKER_TEMPLATES` precedent): the KEYS are the wire's own
 *  SCREAMING_SNAKE placement tuple, not identifiers this file gets to rename. */
export const REGEX_PLACEMENT_LABELS: Record<RegexPlacement, string> = {
  ["USER_INPUT"]: "Your message",
  ["WORLD_INFO"]: "World info",
  ["REASONING"]: "Reasoning channel",
  ["AI_OUTPUT"]: "Model output",
  ["DISPLAY"]: "Display only",
};

/** The stage's name as the PIPELINE prints it — the readout's step rows and the editor's chips read the
 *  same string, prefixed so a stage reads as a regex stage wherever it appears. */
export function regexPlacementStep(placement: RegexPlacement): string {
  return `Regex · ${REGEX_PLACEMENT_LABELS[placement].toLowerCase()}`;
}

/** The flat `{value,label}` options the placement multi-toggle renders (never a grouped `SelectItems` —
 *  `MultiToggleField` takes options only). */
export const REGEX_PLACEMENT_ITEMS: readonly { readonly value: string; readonly label: string }[] = REGEX_PLACEMENTS.map((value) => ({
  value,
  label: REGEX_PLACEMENT_LABELS[value],
}));
