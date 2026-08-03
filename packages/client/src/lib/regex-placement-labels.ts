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
 *  SCREAMING_SNAKE placement tuple, not identifiers this file gets to rename.
 *
 *  `DISPLAY` READS "RENDERED TRANSCRIPT", NOT "DISPLAY ONLY" (side-eye X-1, 2026-08-03). One string, two
 *  defects. (a) DUPLICATE ACCESSIBLE NAME: the editor dialog carried "Display only" twice, 320px apart —
 *  this placement chip and the `markdownOnly` switch — so a user toggling "Display only" could not know
 *  which control they had touched. (b) CATEGORY ERROR inside its own group: the field asks "which text
 *  streams this script applies to" and then listed four streams and one render TIER. The rendered
 *  transcript IS a text stream — the last one, the one the reader's eye receives — so naming it that way
 *  makes the group honest, and the flag it collided with is now DERIVED from this very set (see
 *  `features/regex/lib/derive-tier-flags.ts`) rather than authored beside it. */
export const REGEX_PLACEMENT_LABELS: Record<RegexPlacement, string> = {
  ["USER_INPUT"]: "Your message",
  ["WORLD_INFO"]: "World info",
  ["REASONING"]: "Reasoning channel",
  ["AI_OUTPUT"]: "Model output",
  ["DISPLAY"]: "Rendered transcript",
};

/** The stage's name as the PIPELINE prints it — the readout's step rows and the editor's chips read the
 *  same string, prefixed so a stage reads as a regex stage wherever it appears. */
export function regexPlacementStep(placement: RegexPlacement): string {
  return `Regex · ${REGEX_PLACEMENT_LABELS[placement].toLowerCase()}`;
}

/** How much of a find pattern a row's scent shows before it stops being scannable. */
const SCENT_PATTERN_CHARS = 32;

/** What a row's subtitle says about a script, in ONE vocabulary across both list surfaces (side-eye X-15 /
 *  X-16). Both lists used to print only facts every default script SHARES — the settings pane printed
 *  `on · attached only` and the picker printed the five stage names — so a library of freshly-added rows
 *  was six identical lines under six identical names ("New script"). The FIND PATTERN is the one authored
 *  field that actually tells two scripts apart, so it is what the scent leads with; the enable state rides
 *  in front of it because an `off` row's presence in a list is otherwise unexplained. Scope is deliberately
 *  ABSENT: it is the row's own switch now (X-6), and a state printed beside the control that edits it is
 *  the doubling this pass exists to remove. */
export function regexScriptScent(script: { readonly enabled: boolean; readonly findRegex: string }): string {
  const pattern = script.findRegex.trim();
  const shown = pattern === "" ? "no pattern yet" : pattern.slice(0, SCENT_PATTERN_CHARS) + (pattern.length > SCENT_PATTERN_CHARS ? "…" : "");
  return script.enabled ? shown : `off · ${shown}`;
}

/** A script's NAME, with the empty-name arm spelled ONCE. Shared home for the same reason the scent is:
 *  the row lists, the editor heading, the delete confirm, the shared PICKER and the run-order editor all
 *  announce a nameless script, and `components/` cannot import a feature's `lib/`. It moved here from
 *  `features/regex/lib/regex-model.ts` when the order editor became the fourth caller — the picker had
 *  already re-spelled the fallback inline, which is one name for a nameless script per surface. */
export function regexScriptTitle(script: { readonly name: string }): string {
  return script.name === "" ? "Unnamed script" : script.name;
}

/** The flat `{value,label}` options the placement multi-toggle renders (never a grouped `SelectItems` —
 *  `MultiToggleField` takes options only). */
export const REGEX_PLACEMENT_ITEMS: readonly { readonly value: string; readonly label: string }[] = REGEX_PLACEMENTS.map((value) => ({
  value,
  label: REGEX_PLACEMENT_LABELS[value],
}));
