import type { ProcessMacroOptions } from "#macro";
import { processMacros } from "#macro";

// Guided Generations — the pure resolver for an owner-editable guided-action prompt template.
//
// A guided action carries a template string with {{input}}/{{char}}/{{user}}/{{persona}} macros,
// resolved by the same macro engine the rest of the prompt uses (@orb/kit/macro). `{{input}}` is
// overridden to the user's one-line steering text (NOT the conversation's current message — that
// would be confusing for guided turns); the rest of the macro context flows through unchanged.
// The result is the one-turn ephemeral string the {{guided_instruction}} marker renders.
//
// The config shapes (the action map, its zod schema, the default templates) live in @orb/contracts;
// this leaf owns only the side-effect-free transformation: template + person + untrusted input +
// macro context → resolved string.

// Neutralize `{{`/`}}` in untrusted text so it can't be mistaken for a macro by ANY downstream pass.
// The current engine doesn't re-parse handler return values, but `evaluateString` IS called on
// macro args containing `{{`, so a template like `{{x::{{input}}}}` would re-evaluate substituted
// user text. Defense-in-depth floor that's cheaper than reasoning about every future template shape.
//
// IMPORTANT: U+200B goes BETWEEN the two braces, not before/after the pair. The macro parser scans
// with `text.indexOf("{{", pos)` — placing the zero-width-space outside the pair leaves the `{{`
// token intact and indexOf still finds it, so the defense would be a no-op. Inserting U+200B
// between the braces gives `{<ZWSP>{`, which the indexOf scan can no longer match. Output looks
// identical to a human (U+200B is invisible) and round-trips through every storage layer that
// preserves Unicode.
// Exported because the ZWSP macro-re-injection defense is reusable: any other untrusted-text→macro
// splice needs exactly this transform. The U+200B codepoint is load-bearing — keep it exact.
export const ZWSP = "​";
export function neutralizeMacros(s: string): string {
  return s.replace(/\{\{/g, `{${ZWSP}{`).replace(/\}\}/g, `}${ZWSP}}`);
}

// `{{person}}` is the guided-impersonate perspective token (1st/2nd/3rd-person word). Unset ⇒
// "first" (plain impersonate / any non-impersonate template that happens to contain the token).
const DEFAULT_PERSON = "first";

/**
 * Resolve a Guided Generations action template against the user-supplied steering text + the
 * standard macro context. `{{input}}` is overridden to `userInput` (neutralized); the rest of the
 * macro context (`{{char}}`, `{{user}}`, `{{persona}}`, …) flows through `baseMacroOptions` unchanged.
 *
 * If the (trimmed) template is empty, the neutralized user input is returned as-is — a defensive
 * floor so a broken/blank template still produces SOMETHING from the user's intent.
 *
 * The untrusted `userInput` is run through `neutralizeMacros` BEFORE it is spliced in, so a user
 * cannot re-trigger macro evaluation by typing `{{…}}` into the steering box.
 *
 * `{{base}}` (the greeting studio's rewrite base text — the existing greeting, audit §3) is an OPTIONAL
 * guided-only pre-substitution mirroring `{{person}}`: it is spliced into the template BEFORE macro
 * processing so the editable template controls placement. The base is OTHER-AUTHOR content (the card
 * creator's greeting), so it is `neutralizeMacros`'d exactly like `userInput` — a `{{…}}` in the stored
 * greeting cannot re-trigger macro evaluation once spliced. Unset ⇒ the token is left intact (a template
 * without a rewrite base — e.g. `greeting_new` — simply never contains it).
 */
/** A trailing `.` (plus any following whitespace) on a composed piece — stripped so the join doesn't
 *  double the terminator. Hoisted (top-level-regex lint) — `composeRewriteSteer` runs per keystroke-ish. */
const TRAILING_PERIOD = /\.\s*$/u;

// Compose the Rewrite modal's selected toggle fragments + the free-text instruction into ONE steer
// string — the value that becomes `{{input}}` inside the preset's `rewrite` template downstream.
//
// Composition order (mirrors the source's editIntros layering — the transform options are joined FIRST,
// then the user's own instruction): the selected `fragments` (already in catalog order — the caller maps
// `REWRITE_TOGGLES` in declared order) join with `. `, then the trimmed free-text instruction is appended
// as the final clause. Each piece is a sentence; `. ` between them + a single terminating `.` gives clean
// prose the correction template wraps. Empty pieces are dropped, so any subset (toggles only, free text
// only, both, neither) composes correctly; the all-empty case returns `""` (the wand omits the whole
// steer, matching `steerFor`'s empty-omission rule). This is a PURE string transform — no macros, no
// neutralization (the composed string is neutralized once, downstream, when it lands as `{{input}}`).
export function composeRewriteSteer(fragments: readonly string[], freeText: string): string {
  const pieces = [...fragments.map((f) => f.trim()), freeText.trim()].filter((p) => p.length > 0);
  if (pieces.length === 0) {
    return "";
  }
  // Strip any trailing `.` each piece may already carry so the join doesn't double it, then terminate once.
  return `${pieces.map((p) => p.replace(TRAILING_PERIOD, "")).join(". ")}.`;
}

export function resolveGuidedInstruction(
  promptTemplate: string,
  userInput: string,
  baseMacroOptions: ProcessMacroOptions,
  opts?: { person?: string; base?: string },
): string {
  const safeInput = neutralizeMacros(userInput);
  // Substitute `{{person}}` and `{{base}}` in the template BEFORE macro processing so the editable template
  // controls placement while the caller controls the value. Done as string replaces, not macros, so they
  // stay guided-only concerns and never touch the general macro engine/registry. `{{base}}` is
  // NEUTRALIZED first (other-author greeting text — the same injection defense as `{{input}}`) so a
  // `{{…}}` in the stored greeting cannot re-trigger macro evaluation once it lands in the template.
  const withPerson = promptTemplate.trim().replace(/\{\{\s*person\s*\}\}/gi, opts?.person ?? DEFAULT_PERSON);
  const template = opts?.base === undefined ? withPerson : withPerson.replace(/\{\{\s*base\s*\}\}/gi, neutralizeMacros(opts.base));
  if (template.length === 0) {
    return safeInput;
  }
  return processMacros(template, { ...baseMacroOptions, input: safeInput });
}
