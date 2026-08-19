// The ONE `RegexPlacement` display-label map (side-eye F-23, 2026-08-02). A regex script's placement had
// TWO vocabularies for one pipeline stage: the editor dialog offered the raw enum member (`USER_INPUT`,
// `AI_OUTPUT` — a wire identifier the user is asked to choose between), while the Transforms readout
// printed prose for the same stage ("Regex · your message"). One pipeline, two names, and neither surface
// could be read against the other.
//
// IT IS THE PLACEMENT AXIS' ONE HOME, in every presentation the app needs: the LABELS below, the GLYPHS
// beside them (2026-08-19 — the roster row's column cannot afford the words), the pipeline STEP name, the
// editor's option items, and the two scent projections. All six key off the same `RegexPlacement` union, so
// a new member fails `tsc` in every presentation at once and no parallel table can drift from another.
//
// The labels name WHAT THE STAGE OPERATES ON, in the reading order the pipeline runs them, because that is
// the question both surfaces answer: the editor's "where does this script bite?" and the readout's "which
// stage do I edit?". `lib/` is the shared home — the editor dialog is client-shared and the readout is a
// feature, and features cannot import each other (the `MESSAGE_ROLE_LABELS` precedent).

import type { RegexPlacement } from "@orb/kit/regex";
import { REGEX_PLACEMENTS } from "@orb/kit/regex";
import type { LucideIcon } from "@orb/ui/icons";
import { BookOpen, BrainCircuit, Eye, History, Send, Sparkles } from "@orb/ui/icons";

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
  // The EPHEMERAL leg, named for the copy it rewrites. "Chat history" alone would have read as the
  // transcript — the thing this leg is defined by NOT touching — so the label carries the destination:
  // it rewrites the history ON ITS WAY to the model and the stored messages keep their own words.
  ["PROMPT_HISTORY"]: "History sent to the model",
  ["REASONING"]: "Reasoning channel",
  ["AI_OUTPUT"]: "Model output",
  ["DISPLAY"]: "Rendered transcript",
};

/**
 * The same axis as a GLYPH (side-eye 2026-08-19 P1, ruled fork 2). A roster row's whole scent had to fit a
 * measured 133px column while the stage NAMES alone wanted 396-572px of it — "history sent to the model ·
 * rendered transcript · model output" is three quarters of a sentence for a datum the reader scans, not
 * reads. The glyphs say the same six things in ~16px each, and they carry the label above as their
 * accessible name (`<Icon label>`), so nothing is dropped for a screen reader — the words simply stop
 * spending the line. Same computed-key form and same one-home rule as the labels: a new `RegexPlacement`
 * fails `tsc` here until it is drawn.
 *
 * Every glyph is already in the curated `@orb/ui/icons` seal — this pass mints none (§13.7).
 */
export const REGEX_PLACEMENT_GLYPHS: Record<RegexPlacement, LucideIcon> = {
  ["USER_INPUT"]: Send,
  ["WORLD_INFO"]: BookOpen,
  ["PROMPT_HISTORY"]: History,
  ["REASONING"]: BrainCircuit,
  ["AI_OUTPUT"]: Sparkles,
  ["DISPLAY"]: Eye,
};

/** The stage's name as the PIPELINE prints it — the readout's step rows and the editor's chips read the
 *  same string, prefixed so a stage reads as a regex stage wherever it appears. */
export function regexPlacementStep(placement: RegexPlacement): string {
  return `Regex · ${REGEX_PLACEMENT_LABELS[placement].toLowerCase()}`;
}

/** How much of a find pattern a row's scent shows before it stops being scannable. */
const SCENT_PATTERN_CHARS = 32;

/** What the scent says when `placement` is EMPTY — the F3 defect stated in words (side-eye 2026-08-03 P2:
 *  "a script with `placement: []` is saveable, runs nowhere, and nothing says so"). The parse stays lenient
 *  by law (the header's accept-and-drop heal: an ST card whose only placement was `SLASH_COMMAND` filters to
 *  `[]` and must still import), so the empty set is REACHABLE and therefore has to be legible. The editor
 *  says it too, on the `Runs on` field itself. */
const SCENT_NO_PLACEMENT = "runs nowhere";

/** The stages a script bites on, in PIPELINE order — the one place that ordering is decided, for the
 *  phrase below and for the row's glyph strip alike. A stage a script does not carry is simply absent. */
export function regexPlacementStages(placement: readonly RegexPlacement[]): readonly RegexPlacement[] {
  return REGEX_PLACEMENTS.filter((stage) => placement.includes(stage));
}

/** The stages a script bites on, in pipeline order, as ONE lowercase phrase ("your message · model output"). */
function placementPhrase(placement: readonly RegexPlacement[]): string {
  const ordered = regexPlacementStages(placement);
  return ordered.length === 0 ? SCENT_NO_PLACEMENT : ordered.map((stage) => REGEX_PLACEMENT_LABELS[stage].toLowerCase()).join(" · ");
}

/** The script's authored SHORTHAND — the find pattern, clipped to a scannable head. */
function patternHead(findRegex: string): string {
  const pattern = findRegex.trim();
  if (pattern === "") {
    return "no pattern yet";
  }
  return pattern.slice(0, SCENT_PATTERN_CHARS) + (pattern.length > SCENT_PATTERN_CHARS ? "…" : "");
}

/**
 * What a ROSTER ROW's subtitle says — the same vocabulary as {@link regexScriptScent} with the stage NAMES
 * lifted out, because that row renders in a 271-307px pane and the picker below does not.
 *
 * THE PATTERN LEADS (side-eye 2026-08-19 P1, ruled fork 2). The stages-first line was correct in the
 * picker's width and fatal in the roster's: measured on the owner's corpus, the stage phrase alone wanted
 * 396-572px of a 133px column, so the pattern and the edit stamp — the two data that actually tell two
 * rows apart — were past the ellipsis at EVERY pane width, and three scripts called "Format …" were
 * indistinguishable. The stages are not dropped; they ride the subtitle's LEAD slot as
 * {@link REGEX_PLACEMENT_GLYPHS}, which is ~16px each and keeps its label in the accessible tree.
 *
 * `runs nowhere` SURVIVES AS WORDS, deliberately: the empty set draws no glyphs, so a glyph strip cannot
 * say it, and it is the one placement state that is a defect (F3 — a script that saves and runs nowhere).
 *
 * The enable state still rides in front, for the reason it always has: an `off` row's presence in a list
 * is otherwise unexplained.
 */
export function regexRowScent(
  script: { readonly enabled: boolean; readonly findRegex: string; readonly placement: readonly RegexPlacement[]; readonly updatedAt: number },
  formatRelative: (epochMs: number) => string,
): string {
  const nowhere = script.placement.length === 0 ? `${SCENT_NO_PLACEMENT} · ` : "";
  const scent = `${nowhere}${patternHead(script.findRegex)} · edited ${formatRelative(script.updatedAt)}`;
  return script.enabled ? scent : `off · ${scent}`;
}

/** What the shared PICKER's rows say about a script — the wide-surface projection of one vocabulary.
 *
 *  IT WAS BOTH LIST SURFACES UNTIL 2026-08-19, when the config roster's own row split off into
 *  {@link regexRowScent}: the picker renders inside a dialog with room for the stage names, the roster row
 *  renders in a 271px docked pane and does not. Same nouns, same order, same `patternHead`, same stamp —
 *  the roster's projection simply moves the stage names into glyphs. Two projections of one vocabulary,
 *  not two vocabularies.
 *
 *  THE STAGE LEADS, THE PATTERN FOLLOWS (side-eye 2026-08-03 P2, amending X-15/X-16). The scent used to be
 *  the raw find pattern alone, so a 128px title column produced `off · /\s*(?:ooc|OO…` — the least human
 *  datum available, and it never said WHERE the script bites. X-15/X-16's finding stands and is why the
 *  pattern is still HERE: freshly-created rows share a name ("New script"), and the pattern is the one
 *  authored field that tells two of them apart. So the line carries both, stage first — the mock's
 *  `AI output · …` reading order.
 *
 *  AND THE EDIT STAMP CLOSES IT (X-16, built 2026-08-09 once `RegexScriptRow` grew an `updatedAt` — the
 *  contracts+db half the finding was parked on). The pattern discriminates two rows that were AUTHORED
 *  differently; it does nothing for the actual reported case, `Add script` pressed four times, where every
 *  row is "New script" with an empty pattern and the four subtitles are byte-identical. "edited 4m ago" is
 *  what tells those apart, and it is the `presetRowSubtitle` shape verbatim (kind/scent first, stamp last),
 *  so the two libraries read the same. `formatRelative` is INJECTED for the same reason the preset row
 *  injects it: this stays pure and deterministically testable, and probe mode can freeze the clock.
 *
 *  SCOPE (global/attached) stays ABSENT, refusing the mock's second half: X-6 moved scope onto the row's own
 *  switch, and a state printed beside the control that edits it is the doubling that pass removed.
 *  `placement` is not scope — it is which text STREAM the script rewrites, which nothing else says.
 *  (THE PREMISE OF THAT CLAUSE — "the switch sits 40px to the right of this very line" — DIED on
 *  2026-08-19: the ruled fork moved the global switch off the roster row entirely, into the CONTEXT panel.
 *  The CONCLUSION stands anyway on this surface: the picker attaches per preset/character/room, so global
 *  scope is not what its rows are choosing between. The roster row's own case is argued in
 *  `regex-collection-rows.tsx`'s header, where the switch used to be.)
 *
 *  The enable state rides in front because an `off` row's presence in a list is otherwise unexplained. */
export function regexScriptScent(
  script: { readonly enabled: boolean; readonly findRegex: string; readonly placement: readonly RegexPlacement[]; readonly updatedAt: number },
  formatRelative: (epochMs: number) => string,
): string {
  const scent = `${placementPhrase(script.placement)} · ${patternHead(script.findRegex)} · edited ${formatRelative(script.updatedAt)}`;
  return script.enabled ? scent : `off · ${scent}`;
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
