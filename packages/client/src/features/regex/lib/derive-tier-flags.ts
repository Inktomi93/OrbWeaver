// THE CLIENT SAVE BOUNDARY — the CONTRACT-shaped assembly of the placement-derived fields (side-eye
// X-1 + X-2, 2026-08-03; owner-ratified). The pure derivations themselves live in `@orb/kit/regex`
// (`deriveRegexTierFlags` / `deriveRegexHistoryDepth` / `WHOLE_HISTORY_DEPTH`) beside the executor masks they
// mirror, so the server's bulk-placement verb derives IDENTICALLY. This file owns only the part that names a
// contract type: folding those derivations onto a whole `CreateRegexScriptInput` at the one save boundary.
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
// house's preferred shape over a validated one. The `historyDepth` scope is the same shape of fact — it has
// no meaning without the `PROMPT_HISTORY` leg — so it is folded here too, on the same condition the editor
// renders its depth controls, so the screen and the stored row agree by construction rather than validation.
//
// THE IMPORT PATH IS DELIBERATELY UNTOUCHED. An ST card carrying contradictory flags is stored exactly as
// imported: the executor's masks make that script inert rather than wrong, and the editor HEALS the row the
// first time it is saved. Do not "fix" the import lift to normalize these flags — the card's bytes are
// provenance, and a lift that rewrites them loses the ability to re-emit the card it read.

import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { deriveRegexHistoryDepth, deriveRegexTierFlags } from "@orb/kit/regex";

/** The authored values a save actually writes — the form's own fields with everything `placement` IMPLIES
 *  re-derived from the placement chips: the display/prompt tier flags and the history-depth scope (both from
 *  `@orb/kit/regex`, the SAME derivations the server's bulk verb runs). The ONE client write boundary for
 *  both, so no surface can persist a contradiction between a chip and a field that only exists because of it. */
export function withDerivedTierFlags(values: CreateRegexScriptInput): CreateRegexScriptInput {
  const { historyDepth: _authored, ...rest } = values;
  const historyDepth = deriveRegexHistoryDepth(values.placement, values.historyDepth);
  return { ...rest, ...deriveRegexTierFlags(values.placement), ...(historyDepth === undefined ? {} : { historyDepth }) };
}
