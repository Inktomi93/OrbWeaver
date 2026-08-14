import type { DIRECTIVE_FENCE_NAMES } from "#content";
import type { MacroRegistry, ProcessMacroOptions } from "#macro";
import { neutralizeMacros, processMacros } from "#macro";

// The `:::choices` fence name the offer-choices template instructs the model to emit — TIED to `#content`'s
// `DIRECTIVE_FENCE_NAMES` (its one home) via `satisfies`: if that fence is ever renamed or dropped from the
// registry, this line fails `tsc` instead of leaving the template's prose silently stale.
const CHOICES_FENCE_NAME = "choices" satisfies (typeof DIRECTIVE_FENCE_NAMES)[number];

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

// The ZWSP macro-re-injection defense — RE-HOMED to `#macro` (content.ts) so the M5 user-macro
// handler can use it without a kit-internal cycle (guided already imports #macro; macro cannot import
// guided). Re-exported here so every existing `@orb/kit/guided` consumer keeps its import unchanged.
// The current engine doesn't re-parse handler return values, but `evaluateString` IS called on
// macro args containing `{{`, so a template like `{{x::{{input}}}}` would re-evaluate substituted
// user text. Defense-in-depth floor that's cheaper than reasoning about every future template shape.
export { neutralizeMacros, ZWSP } from "#macro";

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

// ── Game one-shot steers (parity-plus P5 — the wand's Plot submenu + the "Offer choices" one-shot) ──
//
// SYSTEM-authored steering templates the composer wand fires by KIND (never by text): the client sends
// `guided.gameSteer = <kind>` (enum-validated at the wire, `guidedSteerSchema`), and the chat assembly
// resolves the TEMPLATE below through the normal macro engine — so the rpg data macros ({{rpgSceneState}}
// / {{rpgQuests}} / {{random}}) resolve against the game turn's gather feed. This is the owner-ruled
// wand-homing shape: the steers live HERE (guided-actions land), read live rpg state through the P6
// macro/CEL projection, and carry ZERO rpg-contract coupling (macro NAMES only). The templates ride the
// TRUSTED template side (never the neutralized `{{input}}` splice — a user cannot smuggle macros: the
// wire carries only the enum kind). Kit-homed per the axis-home rule (ui-consumed tuple: the wand renders
// the submenu from the tuple; contracts derives the wire enum; the server reads the templates).

/** The plot-progression steer kinds (parity-plus §6.2 + the act-advance arm) — the wand's Plot submenu
 *  renders from this tuple; graft #R4: a new steer is a tuple member + a def, the fire path is byte-stable. */
export const RPG_PLOT_STEER_KINDS = ["natural", "randomized", "twist", "escalate", "deescalate", "advance"] as const;
export type RpgPlotSteerKind = (typeof RPG_PLOT_STEER_KINDS)[number];

/** Every wand-firable one-shot game steer: the plot kinds + the M5 "Offer choices" CYOA one-shot (same
 *  guided fire path, its own wand item). The wire enum (`guidedSteerSchema.gameSteer`) derives from this. */
export const GUIDED_GAME_STEER_KINDS = [...RPG_PLOT_STEER_KINDS, "choices"] as const;
export type GuidedGameSteerKind = (typeof GUIDED_GAME_STEER_KINDS)[number];

/** One game steer: the wand item's label + the macro-carrying steering template the server resolves. */
export interface GuidedGameSteerDef {
  readonly label: string;
  readonly template: string;
}

// The state-aware templates. {{rpgSceneState}}/{{rpgQuests}} resolve to the live tracker projection on a
// game turn (empty strings elsewhere — the macros degrade to "", leaving generic-but-sane steering prose).
const PLOT_NATURAL_TEMPLATE =
  "[Story steer: progress the story naturally this turn — advance the current scene toward its next beat, picking up an unresolved thread or pushing toward the party's current goal. Let it grow out of what is already in motion.]";
const PLOT_RANDOMIZED_TEMPLATE =
  "[Story steer: weave this unexpected development into the scene naturally this turn: {{random::a stranger arrives with urgent news::something valuable goes missing::an old debt resurfaces::the weather turns suddenly and violently::a hidden rivalry boils over::an unexpected ally offers help — at a price::a secret is accidentally revealed::a message arrives that changes everything}}.]";
const PLOT_TWIST_TEMPLATE =
  "[Story steer: introduce a complication grounded in the story's current state.\n{{rpgSceneState}}\nActive quests:\n{{rpgQuests}}\nPick ONE concrete element above — an active quest, a present character (especially a strained or hostile relationship), or a recent beat — and turn it into an immediate complication this turn.]";
const PLOT_ESCALATE_TEMPLATE =
  "[Story steer: raise the stakes this turn — sharpen the current tension, make a looming threat concrete, or force a cost onto the path the party is taking. Escalate what is already present; do not reset the scene.]";
const PLOT_DEESCALATE_TEMPLATE =
  "[Story steer: lower the intensity this turn — give the scene room to breathe. Let a tension ease, offer a quiet beat, a small comfort, or a moment of reflection before the story moves again.]";
const PLOT_ADVANCE_TEMPLATE =
  "[Story steer: the current act has run its course. Bring its open threads to a head and carry the story into the NEXT act — a clear shift in situation, goal, or stakes.\n{{rpgSceneState}}]";
const OFFER_CHOICES_TEMPLATE = `[For this turn only: end your response with a set of choices for the player. After your narration, add a line containing exactly :::${CHOICES_FENCE_NAME} then 3-5 numbered options (1. ...), each a distinct action the player could take next, then a line containing exactly ::: on its own.]`;

/** The plot steer defs the wand's Plot submenu renders (kind → label + template). */
export const RPG_PLOT_STEERS: Readonly<Record<RpgPlotSteerKind, GuidedGameSteerDef>> = {
  natural: { label: "Natural progression", template: PLOT_NATURAL_TEMPLATE },
  randomized: { label: "Random twist", template: PLOT_RANDOMIZED_TEMPLATE },
  twist: { label: "Grounded twist", template: PLOT_TWIST_TEMPLATE },
  escalate: { label: "Escalate", template: PLOT_ESCALATE_TEMPLATE },
  deescalate: { label: "De-escalate", template: PLOT_DEESCALATE_TEMPLATE },
  advance: { label: "Advance the act", template: PLOT_ADVANCE_TEMPLATE },
};

/** Every game steer by kind — the server's resolve map (the wand fires a kind; assembly renders the
 *  template through the macro engine and injects it depth-0 system, ephemeral). */
export const GUIDED_GAME_STEERS: Readonly<Record<GuidedGameSteerKind, GuidedGameSteerDef>> = {
  ...RPG_PLOT_STEERS,
  choices: { label: "Offer choices", template: OFFER_CHOICES_TEMPLATE },
};

export function resolveGuidedInstruction(
  promptTemplate: string,
  userInput: string,
  baseMacroOptions: ProcessMacroOptions,
  opts?: { person?: string; base?: string; registry?: MacroRegistry | undefined },
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
  // The per-turn user-macro registry (WAVE MU) when a guided template references a user macro; absent ⇒
  // `processMacros`' own `globalMacroRegistry` default (byte-identical for every existing caller).
  return opts?.registry !== undefined
    ? processMacros(template, { ...baseMacroOptions, input: safeInput }, opts.registry)
    : processMacros(template, { ...baseMacroOptions, input: safeInput });
}
