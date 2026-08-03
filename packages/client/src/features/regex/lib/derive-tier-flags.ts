// THE DISPLAY/PROMPT TIER IS DERIVED FROM `placement`, NEVER AUTHORED BESIDE IT (side-eye X-1 + X-2,
// 2026-08-03; owner-ratified).
//
// THE DEFECT. The editor dialog offered `markdownOnly` ("Only affects what's shown, never the prompt.") and
// `promptOnly` ("Only affects the prompt, never the display.") as two independent switches. Both could be ON
// at once — verified live, `aria-checked=true` on both, no warning and no resolution shown — so the surface
// told the user the script both does and does not touch the prompt. And "Display only" was ALSO the label of
// a `Runs on` chip 320px up the same dialog, so the pair of contradicting switches was not even reliably
// identifiable.
//
// WHY DERIVING, AND NOT A THREE-ARM CHOICE. Read the executor (`@orb/kit/regex`, `executeRegexScripts`):
// `markdownOnly` skips the script on every placement EXCEPT `DISPLAY`; `promptOnly` skips it ON `DISPLAY`.
// Both flags are pure MASKS over the `placement` set the `Runs on` chips already author — they add no
// expressive power, they only subtract from it. So a Both/Display-only/Prompt-only radio would still let a
// user select `Runs on: Your message` + `Prompt only`… + `Display only`, i.e. a script that can never fire;
// the contradiction would relocate, not die. Deriving makes the dead state UNREPRESENTABLE, which is this
// house's preferred shape over a validated one.
//
// THE SAME SHAPE NOW CARRIES A SECOND DERIVATION: `historyDepth`, the depth scope of the ephemeral
// `PROMPT_HISTORY` leg. It is not a mask — it is a field that has no meaning without its placement, which
// the contract enforces in both directions — so the pairing is derived HERE, at the one save boundary,
// exactly like the tier flags. The editor renders the depth controls only while that chip is on, so the
// screen and the stored row agree by construction rather than by validation.
//
// THE IMPORT PATH IS DELIBERATELY UNTOUCHED. An ST card carrying contradictory flags is stored exactly as
// imported: the executor's masks make that script inert rather than wrong, and the editor HEALS the row the
// first time it is saved. Do not "fix" the import lift to normalize these flags — the card's bytes are
// provenance, and a lift that rewrites them loses the ability to re-emit the card it read.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexHistoryDepth, RegexPlacement } from "@orb/kit/regex";
import { HISTORY_DEPTH_PLACEMENT } from "@orb/kit/regex";

const DISPLAY: RegexPlacement = "DISPLAY";

/** The depth scope a freshly-scoped history script gets: the WHOLE history. It is written out rather than
 *  left absent because the contract pairs `historyDepth` with the `PROMPT_HISTORY` leg in BOTH directions —
 *  the leg without a scope is as unrepresentable as a scope without the leg, so "everything" has exactly
 *  one spelling instead of being inferred from a missing key. */
export const WHOLE_HISTORY_DEPTH: RegexHistoryDepth = { min: 0, max: null };

/** The tier flags implied by a placement set. THREE ARMS, exhaustive over the set:
 *  · `DISPLAY` alone            ⇒ `markdownOnly` — the script is render-tier only.
 *  · no `DISPLAY` at all        ⇒ `promptOnly`   — the script never touches what is rendered.
 *  · `DISPLAY` + a prompt-side  ⇒ neither        — it runs on both sides, which is what the chips say.
 *  An EMPTY set lands on the middle arm (`promptOnly`) and is inert either way: the executor already skips
 *  a script whose placement list does not contain the running leg. */
export function deriveRegexTierFlags(placement: readonly RegexPlacement[]): Pick<CreateRegexScriptInput, "markdownOnly" | "promptOnly"> {
  const hasDisplay = placement.includes(DISPLAY);
  const hasPromptSide = placement.some((member) => member !== DISPLAY);
  return { markdownOnly: hasDisplay && !hasPromptSide, promptOnly: !hasDisplay };
}

/** The DEPTH SCOPE implied by a placement set — the second thing `placement` decides. `historyDepth` exists
 *  IFF the set carries `PROMPT_HISTORY` (the contract refuses either half alone), so a set that gained the
 *  leg takes the whole-history scope and a set that lost it drops the scope entirely. Keeping an authored
 *  scope across a toggle-off-and-back-on is deliberately NOT attempted: the form is autosaving, so a
 *  "remembered" bound would be invisible state the user cannot see or clear. */
function deriveHistoryDepth(values: CreateRegexScriptInput): Pick<CreateRegexScriptInput, "historyDepth"> {
  if (!values.placement.includes(HISTORY_DEPTH_PLACEMENT)) {
    return {};
  }
  return { historyDepth: values.historyDepth ?? WHOLE_HISTORY_DEPTH };
}

/** The authored values a save actually writes — the form's own fields with everything `placement` IMPLIES
 *  re-derived from the placement chips: the display/prompt tier flags (above) and the history depth scope.
 *  The ONE write boundary for both, so no surface can persist a contradiction between a chip and a field
 *  that only exists because of it. */
export function withDerivedTierFlags(values: CreateRegexScriptInput): CreateRegexScriptInput {
  const { historyDepth: _authored, ...rest } = values;
  return { ...rest, ...deriveRegexTierFlags(values.placement), ...deriveHistoryDepth(values) };
}
