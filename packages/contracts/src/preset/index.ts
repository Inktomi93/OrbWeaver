// @orb/contracts/preset — generation config: the `PromptConfig` blob, its lift chain, user-intent
// generation knobs, guided-actions config, custom parameters, and ST/neo preset serde. NOT the macro
// catalog: the ONE catalog is the `@orb/kit/macro` registry+metadata pair, and every consumer (the macro
// browser, the `{{ }}` autocomplete) derives from it — a contracts-side copy lived here until 2026-08-02,
// redundant and consumer-less.
// preset = GENERATION config, NOT the connection (`{api, source, model}` is `contracts/connection`'s axis).
//
// Sibling module (D15 directory-module law: internals flat, this index re-exports):
//   • prose.ts — the per-PRESET PROSE-1 slot table; the ONE home for the BYTES of every guided-action
//     template + format string this file's schema defaults read.

import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import type { UserMacroDef, UserMacroInputValue } from "@orb/kit/macro";
import { MACRO_ARG_TYPES, MACRO_NAME_RE, USER_MACRO_INPUT_KINDS } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import type { RegexPlacement } from "@orb/kit/regex";
import { z } from "zod";
import type { EffortLevel as ModelEffortLevel } from "#connection";
import { EFFORT_LEVELS as MODEL_EFFORT_LEVELS, roleHandlingSchema, VERBOSITY_LEVELS } from "#connection";
import type { ProseOverrides, ProseSlotId } from "#prose-slot";
import { hasProseToken, proseOverridesSchema } from "#prose-slot";
import { defineVersionedConfig } from "#versioned-config";
import { PRESET_COMPACTION_SLOT_ID, PRESET_PROSE_SLOTS } from "./prose.ts";

export {
  PRESET_COMPACTION_SLOT_ID,
  PRESET_FORMAT_SLOT_IDS,
  PRESET_GREETING_TRANSFORM_PROSE_SLOTS,
  PRESET_GUIDED_SLOT_IDS,
  PRESET_PROSE_SLOTS,
  PRESET_REWRITE_TOGGLE_PROSE_SLOTS,
} from "./prose.ts";

const MAX_NAME_LENGTH = 200;
const MIN_ID_LENGTH = 1;
const MAX_TEXT_LENGTH = 100_000; // literal content + marker template (may carry {{macros}})
const MAX_SECTIONS = 500;
const MAX_VARIABLES = 200;
const MAX_CHOICE_OPTIONS = 200;
const MIN_CHOICE_OPTIONS = 1;
const MAX_CHOICE_LABEL_LENGTH = 500;
const MAX_CHOICE_VALUE_LENGTH = 10_000;
const MIN_QUESTION_LENGTH = 1;
const MAX_QUESTION_LENGTH = 2000;
const MAX_SEPARATOR_LENGTH = 64;
/** The cap on an authored TURN-INJECTION TEMPLATE — the ONE number for that whole class (owner ruling
 *  2026-08-08, option 2 of `docs/design/parked-options-tag-contract.md` §2). Two schemas wear it and they are
 *  the same kind of thing: a `formatStrings` slot and a `guidedActions.*.prompt` are both macro-carrying text
 *  spliced into a turn. It supersedes the old `MAX_FORMAT_STRING_LENGTH` (same value, renamed rather than aliased —
 *  a second spelling of one cap is the drift this constant exists to prevent), and the guided prompt was
 *  UNCAPPED until this ruling: a `z.string()` that reached both the preset row and the model wire unbounded.
 *
 *  EXPORTED because the editor must wear it: `formatStringsSchema` is also the READ path (`parsePromptConfig`
 *  degrades a failed parse to DEFAULT_PROMPT_CONFIG), so an over-cap format string is not a bounced field —
 *  it is the whole preset reading as defaults. Every field caps and counts off THIS number rather than
 *  re-spelling it (the `PROSE_MAX_CHARS` precedent).
 *
 *  NOT the cap for every authored string in this file, and deliberately so: the tiers below it are real
 *  (a section's literal content genuinely needs `MAX_TEXT_LENGTH`; a name needs `MAX_NAME_LENGTH`). This one
 *  names a CLASS, not a file-wide maximum. */
export const MAX_INJECTION_TEMPLATE_LENGTH = 10_000;
const MIN_INJECT_DEPTH = 0;
const INJECT_ORDER_MIN = -1_000_000;
const INJECT_ORDER_MAX = 1_000_000;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UserIntent — the preset-facing, cross-runner, model-agnostic generation snapshot (PromptConfig.params)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const QUALITY_LEVELS = ["fast", "balanced", "deep"] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

// The `quality → reasoning-effort` mapping: the funnel feeds this as the DEFAULT effort (an explicit
// `effort` knob overrides it), then clamps against the model's real `effortLevels`.
export const QUALITY_EFFORT: Record<Quality, ModelEffortLevel> = {
  fast: "minimal",
  balanced: "medium",
  deep: "high",
};

// The `quality → sampling` defaults: the ergonomic dial's SAMPLING half (the effort half is above). The
// funnel feeds each field as the DEFAULT for that knob (an explicit user knob wins) THEN capability-gates
// + clamps it against the model's real sampling range — a model whose descriptor omits the knob never
// receives it (D68). Conservative "creativity slider" numbers (fast=focused → deep=expansive); OWNER-TUNED
// by taste. Only `temperature` is dialed today (the one knob with a universal meaning across every wire);
// add `topP`/`topK` here to extend the preset — the funnel picks up any field present.
export const QUALITY_SAMPLING: Record<Quality, { readonly temperature?: number }> = {
  fast: { temperature: 0.5 },
  balanced: { temperature: 0.7 },
  deep: { temperature: 1 },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Side-generation postures — the FLOOR sampling catalog (the third rung of the side-gen sampling ladder).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Every side-generation call site (arbitration, quiet generation, compaction, distillation, analysis,
// greeting studio, /autobg, caption) used to hardcode its own `temperature`/`maxTokens` constants — a
// buried const that the user's own generation params could never override. The ladder resolves each site's
// posture right-to-left through `@orb/kit/side-gen-posture`:
//   the caller's preset `params`  →  THIS floor.
// There is no third rung: a per-TEMPLATE sampling override on the preset's guided actions was DELETED (owner
// ruling 2026-08-01) — guided generations run at the preset's normal generation params like every other turn.
// This catalog is the FLOOR — the last word, and the byte-identical encoding of the OLD hardcoded consts, so
// a user with no preset params gets exactly today's behavior. The numbers are NOT
// arbitrary — each entry carries the WHY from the const it replaced (a summary is not creative writing; a
// name is not prose; etc.). To retune a floor, edit HERE (one home), never at a call site.
export const SIDE_GEN_KINDS = [
  "arbiter",
  "quiet_generate",
  "extract_quiet",
  "compaction",
  "distill",
  "analyze",
  "greeting_studio",
  "autobg",
  "caption",
  "refine_score",
  "refine_rewrite",
  "refine_analyze",
  "schema_forge",
] as const satisfies readonly string[];
export type SideGenKind = (typeof SIDE_GEN_KINDS)[number];

/** A side-generation floor posture — the sampling knobs a side-gen call runs at ABSENT a preset
 *  override. Both fields optional: an ABSENT field means "the runner/backend default stands" (caption's
 *  empty posture is the honest encoding of a call that passed nothing). `maxOutputTokens` (not `maxTokens`)
 *  matches the `userIntentSchema` vocabulary — a call site whose seam takes `maxTokens` (the summarize role)
 *  maps the field at the seam. */
export interface SideGenPosture {
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

// biome-ignore-start lint/style/useNamingConvention: the map key IS the SideGenKind string (snake_case vocabulary)
export const SIDE_GEN_POSTURES = {
  // Smart 7b arbitration: a deterministic-ish classify (pick ONE next speaker) — a tiny output budget
  // because we want a name, not prose (the roster-validating parse + fallback cover the non-determinism).
  arbiter: { temperature: 0.2, maxOutputTokens: 24 },
  // Quiet (non-canon) generation: near-deterministic + bounded — a summary/marker is not creative writing.
  quiet_generate: { temperature: 0.3, maxOutputTokens: 1024 },
  // Imagery quiet keyword-extraction: low temp for a near-deterministic extraction, a budget sized for a
  // keyword list, not prose.
  extract_quiet: { temperature: 0.4, maxOutputTokens: 320 },
  // Managed-compaction marker: low-temp + bounded (a faithful summary, not creative writing). Historically
  // this passed ONLY a temperature (the output length floored through quiet_generate, which it rides) — so
  // the encoding carries NO `maxOutputTokens`, and the quiet_generate floor still supplies the length.
  compaction: { temperature: 0.3 },
  // Library distillation (card → filterable facets): near-deterministic guided decode, a budget sized for
  // the compact structured payload.
  distill: { temperature: 0.2, maxOutputTokens: 512 },
  // Library analysis (compare narrative + askCard answer): a grounded read over a precomputed diff / recent
  // scenes — a short, grounded structured answer. Both analyze calls share this posture (identical today:
  // 0.3 / 400 out for each); if the two budgets ever diverge, split into two kinds.
  analyze: { temperature: 0.3, maxOutputTokens: 400 },
  // Greeting studio bounded completion: a bounded transform of a base greeting, not an open creative turn —
  // mirrors the quiet_generate floor (temp 0.3, 1024 out).
  greeting_studio: { temperature: 0.3, maxOutputTokens: 1024 },
  // Automation /autobg background pick: a deterministic classify (pick ONE background name from a list) —
  // a tiny output budget because we want a name, nothing else.
  autobg: { temperature: 0.2, maxOutputTokens: 32 },
  // Vision caption: an EMPTY floor — the caption call historically passed NO sampling options (the backend
  // defaults stood). An empty posture is the honest encoding; the caller's preset params CAN now reach it.
  caption: {},
  // ── Refinery stage floors (R1 — docs/design/refinery-r0.md §9.7; study §5.3's values). The caller is
  //    always the card owner, so the preset-params rung ALWAYS applies (no mixed-owner batch arm here). ──
  // Score: near-deterministic critique, budgeted for the per-field payload (bigger than distill's facets).
  refine_score: { temperature: 0.2, maxOutputTokens: 768 },
  // Rewrite: the one CREATIVE stage — card prose, the largest budget of the three.
  refine_rewrite: { temperature: 0.7, maxOutputTokens: 2048 },
  // Analyze: a grounded drift comparison — short, structured, near-deterministic.
  refine_analyze: { temperature: 0.3, maxOutputTokens: 512 },
  // NL→JSON-schema generation (refinery SF — the NL design §4.6): a near-deterministic structural
  // artifact, budgeted for a depth-≤8 schema document, never prose.
  schema_forge: { temperature: 0.2, maxOutputTokens: 768 },
} as const satisfies Record<SideGenKind, SideGenPosture>;
// biome-ignore-end lint/style/useNamingConvention: the map key IS the SideGenKind string (snake_case vocabulary)

// The user-INTENT effort vocabulary (adds `none` = thinking-disabled) — derived from connection's
// `EffortLevel` set (never redeclared) so the two can't diverge.
export const EFFORT_LEVELS = ["none", ...MODEL_EFFORT_LEVELS] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const effortLevelSchema = z.enum(EFFORT_LEVELS);

export const THINKING_DISPLAYS = ["summarized", "omitted"] as const;
export type ThinkingDisplay = (typeof THINKING_DISPLAYS)[number];

// Compaction is a SAFETY property (owner ruling): a chat may never error from context growth, so turning
// compaction OFF is not an option — you control WHICH ENGINE compacts (auto = the SDK's native compaction;
// managed = OURS, a durable portable LINEAR marker via the chat's own model), never whether it happens.
export const COMPACTION_MODES = ["auto", "managed"] as const;
export type CompactionMode = (typeof COMPACTION_MODES)[number];

const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const TOP_P_MIN = 0;
const TOP_P_MAX = 1;
const MIN_P_MIN = 0;
const MIN_P_MAX = 1;
const TOP_A_MIN = 0;
const TOP_A_MAX = 1;
const PENALTY_MIN = -2;
const PENALTY_MAX = 2;
const REPETITION_PENALTY_MIN = 0;
const REPETITION_PENALTY_MAX = 2;
const COMPACTION_THRESHOLD_MIN = 0.5;
const COMPACTION_THRESHOLD_MAX = 0.99;
// The managed-compaction VERBATIM TAIL: the newest N canon rows kept literal when the SDK owns context and
// nothing trims — everything older is compacted (`maxSeq - tail`). Was the engine's `MANAGED_VERBATIM_TAIL=8`
// const (the missing 4th compaction knob); a value outside these bounds drops at parse → the engine floor.
const COMPACTION_VERBATIM_TAIL_MIN = 1;
const COMPACTION_VERBATIM_TAIL_MAX = 100;

// The RESPONSE-LENGTH default (ST `openai_max_tokens`), reserved for the completion when a preset/turn
// sets no explicit `maxOutputTokens`. Deliberately a small response length — NOT the model's output-cap
// ceiling (`capability.output.maxTokens.max`, which on a self-hosted vLLM equals the whole window). This is
// the ONE fallback both the budget reserve (fitBudget) and every runner's wire `max_tokens` read, so the
// two can never diverge: a reserve larger than the runner's real `max_tokens` starves history (amnesia);
// smaller overflows the model (vLLM 400s). Users tune it per preset.
//
// ⚠ THE NUMBER IS LOAD-BEARING ON A REASONING WIRE. This comment used to end "the exact number isn't
// load-bearing", which predates reasoning models and is now FALSE (dogfood MAXTOKENS-CAPS-THINKING). On every
// current reasoning wire `max_completion_tokens` caps THINKING AND RESPONSE TEXT TOGETHER — it is not a
// response-length knob there, it is the whole output budget. At a small value with a non-`none` effort the
// model can spend the entire allowance deliberating and emit zero prose, which surfaces as VER-1b's
// empty-generation refusal rather than as a truncation. The engine now NAMES that case in the error it throws
// (`emptyGenerationMessage`, `domain/chat/engine/engine.ts`) instead of reporting the generic "no text", so a
// host meets the lever rather than a mystery.
//
// A reasoning-aware DERIVED reserve (a floor scaled by effort) is the standing candidate fix and is
// deliberately NOT built here: no length-cut specimen has been observed on this deployment — every recorded
// failing turn was a tool-only completion, and the live presets run at 64000 — so a derived reserve would be
// tuned against zero evidence. Build it when a `finishReason:"length"` empty turn is actually recorded.
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

// ONE place per numeric bound — no split source between server/client (client accepts → server rejects).
export const generationKnobSchemas = {
  thinkingBudgetTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxContextTokens: z.number().int().positive().optional(),
  temperature: z.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX).optional(),
  topP: z.number().min(TOP_P_MIN).max(TOP_P_MAX).optional(),
  topK: z.number().int().nonnegative().optional(),
  minP: z.number().min(MIN_P_MIN).max(MIN_P_MAX).optional(),
  topA: z.number().min(TOP_A_MIN).max(TOP_A_MAX).optional(),
  frequencyPenalty: z.number().min(PENALTY_MIN).max(PENALTY_MAX).optional(),
  presencePenalty: z.number().min(PENALTY_MIN).max(PENALTY_MAX).optional(),
  repetitionPenalty: z.number().min(REPETITION_PENALTY_MIN).max(REPETITION_PENALTY_MAX).optional(),
  seed: z.number().int().optional(),
  compactionThresholdPct: z.number().min(COMPACTION_THRESHOLD_MIN).max(COMPACTION_THRESHOLD_MAX).optional(),
  compactionVerbatimTail: z.number().int().min(COMPACTION_VERBATIM_TAIL_MIN).max(COMPACTION_VERBATIM_TAIL_MAX).optional(),
} as const;

// `z.strictObject` rejects unknown keys (a typo'd knob is a real bug; `.catch({})` at the params field bounds
// the blast radius). HISTORICAL NOTE: this site used `.strict()` on a plain `z.object` because an early Zod v4
// `z.strictObject` inflated the inferred type with an index-signature tag that propagated through `.optional()`
// and tripped `noPropertyAccessFromIndexSignature`. FIXED UPSTREAM — on 4.4.3 `$strict` is byte-identical to
// `$strip` (`zod/v4/core/schemas.d.ts`: `{ out: {}; in: {} }`), verified type-level under this repo's own strict
// flags. Either spelling is fine now; `z.strictObject` is the direct one (`.strict()` is tagged legacy-compat in
// the installed d.ts), so new strict boundaries should use it.
export const userIntentSchema = z.strictObject({
  quality: z.enum(QUALITY_LEVELS).optional(),

  effort: effortLevelSchema.optional(),
  thinkingBudgetTokens: generationKnobSchemas.thinkingBudgetTokens,
  thinkingDisplay: z.enum(THINKING_DISPLAYS).optional(),

  maxOutputTokens: generationKnobSchemas.maxOutputTokens,
  maxContextTokens: generationKnobSchemas.maxContextTokens,
  providerContextCompression: z.boolean().optional(),

  temperature: generationKnobSchemas.temperature,
  topP: generationKnobSchemas.topP,
  topK: generationKnobSchemas.topK,
  minP: generationKnobSchemas.minP,
  topA: generationKnobSchemas.topA,
  frequencyPenalty: generationKnobSchemas.frequencyPenalty,
  presencePenalty: generationKnobSchemas.presencePenalty,
  repetitionPenalty: generationKnobSchemas.repetitionPenalty,
  seed: generationKnobSchemas.seed,
  logitBias: z.record(z.string(), z.number()).optional(),
  stop: z.array(z.string()).optional(),
  // Vocab derived from connection's VERBOSITY_LEVELS (never re-spelled).
  verbosity: z.enum(VERBOSITY_LEVELS).optional(),

  compaction: z
    .object({
      mode: z.enum(COMPACTION_MODES).optional(),
      thresholdPct: generationKnobSchemas.compactionThresholdPct,
      instructions: z.string().optional(),
      // The newest-N canon rows kept literal on the no-fit-boundary (agent-sdk) path; older rows compact.
      // Absent ⇒ the engine floor (`MANAGED_VERBATIM_TAIL`), derived from that const — byte-identical default.
      verbatimTail: generationKnobSchemas.compactionVerbatimTail,
    })
    .optional(),

  // Escape hatch — reserved-keys floor enforced at the env-builder / runner-translate seam.
  advanced: z
    .object({
      claudeEnv: z.record(z.string(), z.string().nullable()).optional(),
      // Where the volatile per-turn system-prompt half is delivered: "system" joins it into the cached
      // system-prompt string; "hook" delivers it at the message tail (cache-safe). Absent ⇒ the funnel
      // picks "hook" iff the model honors mid-conversation system, else "system".
      dynamicContext: z.enum(["system", "hook"]).optional(),
      // Merge CONSECUTIVE system-note runs before they convert to `user` rows — orthogonal to the
      // adjacent-same-role merge below (roleHandling). Absent ⇒ no pre-merge.
      squashSystemMessages: z.boolean().optional(),
      // Adjacent-same-role (user|assistant) merge strategy — user-authoring intent, clamped against the
      // model's `capability.turns.roleHandlingFloor` at the SHAPE splice (user may go stricter, never looser).
      roleHandling: roleHandlingSchema.optional(),
      // Whether the model may emit SEVERAL tool calls in one turn (OpenRouter `parallel_tool_calls`).
      // Rides the wire only when the request carries tools + the model is tool-capable. Absent ⇒ the
      // provider default (parallel allowed).
      parallelToolCalls: z.boolean().optional(),
    })
    .optional(),
});
export type UserIntent = z.infer<typeof userIntentSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Guided actions — the config half (the resolver + ZWSP neutralization live in `@orb/kit/guided`).
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const GUIDED_ACTION_KINDS = [
  "response",
  "swipe",
  "impersonate",
  "rewrite",
  "opening",
  "continue",
  "greeting_rewrite",
  "greeting_new",
] as const satisfies readonly string[];
export type GuidedActionKind = (typeof GUIDED_ACTION_KINDS)[number];

// The `impersonate` action's `{{person}}` word — spliced verbatim into "{{person}}-person perspective"
// templates. ONE importable union so the composer picker and the domain steer field can't drift apart.
export const GUIDED_IMPERSONATE_PERSONS = ["first", "second", "third"] as const satisfies readonly string[];
export type GuidedImpersonatePerson = (typeof GUIDED_IMPERSONATE_PERSONS)[number];
export const guidedActionKindSchema = z.enum(GUIDED_ACTION_KINDS);

// The guided-action default TEMPLATES are PROSE-1 slots — the bytes are authored once in `./prose` (census
// rows 38-44) and read here, so the shipped default, the registry row and the editor's ghosted placeholder
// can never disagree. Revising one is a `text` + `version` edit in `./prose`, gated by `prose-baseline.json`.
//
// Greeting studio (audit §3) — the guided-action machinery pointed at a BASE greeting text (the card's own
// opening), NOT a chat turn. `greeting_rewrite` carries `{{base}}` — the existing greeting text, spliced
// (ZWSP-neutralized, other-author content) by the same guided-only pre-substitution as `{{person}}`
// (@orb/kit/guided). Keep-close prose adapted from the source's editIntros.editExisting (verbatim
// sanctioned). `greeting_new` writes fresh from the instructions (editIntros.makeNew). Both resolve
// {{char}}/{{user}} through the normal macro engine, so the templates read naturally in the card editor.
const OPENING_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.opening"].text;
const CONTINUE_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.continue"].text;
const RESPONSE_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.response"].text;
const IMPERSONATE_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.impersonate"].text;
const REWRITE_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.rewrite"].text;
const GREETING_REWRITE_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.greetingRewrite"].text;
const GREETING_NEW_DEFAULT_PROMPT = PRESET_PROSE_SLOTS["preset.guided.greetingNew"].text;

const GUIDED_DEFAULT_ROLE: MessageRole = "system";

// A guided action carries its TEMPLATE + delivery role and NOTHING about sampling: the per-template
// sampling override (temperature/topP/maxOutputTokens) was DELETED (owner ruling 2026-08-01) — a guided
// generation runs at the preset's normal generation params, exactly like every other turn. Unknown keys on
// a stored blob are STRIPPED by this non-strict object, so a preset saved with the old `sampling` key still
// parses and simply loses it.
export const guidedActionConfigSchema = z.object({
  /** The injection template; `{{input}}` = the user's steering text. Missing/empty falls back to `{{input}}` alone.
   *
   *  CAPPED at the shared injection-template max (owner ruling 2026-08-08). It was an unbounded `z.string()` —
   *  the one authored text field in this contract with no ceiling, reaching BOTH the preset row and the model's
   *  system block (`assembly/macros.ts` resolveGuidedInstruction) at whatever length a caller sent. Its
   *  functional sibling `formatStrings` has always carried this same number; they are one class. */
  prompt: z.string().max(MAX_INJECTION_TEMPLATE_LENGTH),
  /** Conversation role the resolved text is delivered with; `system` renders in the cacheable system
   *  prompt, `user`/`assistant` push as an in-chat injection. */
  role: z.enum(MESSAGE_ROLES).default(GUIDED_DEFAULT_ROLE),
  /** In-chat delivery DEPTH for a `user`/`assistant` role: 0 = the tail (with `assistant` that IS the
   *  prefill-shaped position — prefill is a POSITION, not a role), N = N turns back. ABSENT (never
   *  `.default()`) ⇒ 0, which is the depth the guided injection candidate has always used — so every stored
   *  blob keeps its exact bytes and today's fixed behavior becomes the declared default. Inert on a `system`
   *  role: that steer rides the `guided_instruction` marker inside the system block, which has no depth. */
  depth: z.number().int().min(MIN_INJECT_DEPTH).max(MAX_INJECTION_DEPTH).optional(),
});
/** @public type twin of `guidedActionConfigSchema`, which shapes all six guided actions in this file. */
export type GuidedActionConfig = z.infer<typeof guidedActionConfigSchema>;

export const guidedActionsSchema = z.object({
  response: guidedActionConfigSchema,
  swipe: guidedActionConfigSchema,
  impersonate: guidedActionConfigSchema,
  rewrite: guidedActionConfigSchema,
  // Defaulted (not required) so a stored blob predating opening/continue still parses.
  opening: guidedActionConfigSchema.default({
    prompt: OPENING_DEFAULT_PROMPT,
    role: GUIDED_DEFAULT_ROLE,
  }),
  continue: guidedActionConfigSchema.default({
    prompt: CONTINUE_DEFAULT_PROMPT,
    role: GUIDED_DEFAULT_ROLE,
  }),
  // Greeting-studio kinds (audit §3) — defaulted like opening/continue so a stored blob predating them
  // still parses. `role` is inert for these (the studio verbs run a standalone bounded completion, never a
  // chat-turn injection) but kept for schema uniformity. The keys ARE the `GuidedActionKind` strings (the
  // schema map is keyed by kind, so key === kind avoids a translation layer); the audit-ratified vocabulary
  // is snake_case.
  // biome-ignore-start lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
  greeting_rewrite: guidedActionConfigSchema.default({
    prompt: GREETING_REWRITE_DEFAULT_PROMPT,
    role: GUIDED_DEFAULT_ROLE,
  }),
  greeting_new: guidedActionConfigSchema.default({
    prompt: GREETING_NEW_DEFAULT_PROMPT,
    role: GUIDED_DEFAULT_ROLE,
  }),
  // biome-ignore-end lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
});
export type GuidedActionsConfig = z.infer<typeof guidedActionsSchema>;

export const DEFAULT_GUIDED_ACTIONS: GuidedActionsConfig = {
  response: { prompt: RESPONSE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  swipe: { prompt: RESPONSE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  impersonate: { prompt: IMPERSONATE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  rewrite: { prompt: REWRITE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  opening: { prompt: OPENING_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  continue: { prompt: CONTINUE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  // biome-ignore-start lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
  greeting_rewrite: { prompt: GREETING_REWRITE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  greeting_new: { prompt: GREETING_NEW_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  // biome-ignore-end lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Rewrite toggle catalog — the "toggle options to guide it" the Rewrite modal renders (owner ruling
// 2026-07-25). Adapted (not ported) from the ST Guided-Generations rewrite family: the *Corrections*
// tool itself ships no toggle catalog (only a free-text instruction + include-history + selection-scope),
// so the guiding vocabulary here is lifted from the sibling **editIntros** transform catalog
// (`prompts.json editIntros.options`), which IS the source's "one-click steer without prose-writing" set.
// Only the transforms that make sense for a MID-CONVERSATION reply correction are kept: prose STYLE and
// TENSE. The perspective/gender options are excluded — they reframe {{user}} in an OPENING and belong to
// the greeting-studio surface (audit §3), not a reply rewrite. `concise`/`expand` are the two universal
// correction-length fragments the Corrections OOC prompt implies ("change it to reflect …").
//
// Registry-as-data (the databank SCRAPER_KINDS / steer-library precedent — "substrate not a type home":
// contracts owns the shape+data both the client chips and the server's composer need). Each toggle = a
// stable `id`, a display `label`, and the PROSE SLOT holding the instruction sentence it contributes.
//
// THE FRAGMENT BYTES ARE NOT HERE (the templating fork, ARM B — owner ruling 2026-08-09,
// `docs/design/templating-fork-rows-53-73.md`). They are host-editable prose slots
// (`PRESET_REWRITE_TOGGLE_PROSE_SLOTS`, ./prose.ts), resolved by the SERVER at the assembly seam that
// already holds the preset's prose blob, and joined there by the same pure `composeRewriteSteer`
// (`@orb/kit/guided`) — selected fragments join `. ` (the source's exact editIntros join) in CATALOG
// ORDER, then the user's free-text instruction is appended, producing the ONE steer string that becomes
// `{{input}}` inside the preset's `rewrite` template. Layering:
//   preset rewrite template  ⊃  (resolved slot fragments joined) + free-text instruction
// which mirrors the source's editIntros layering (options joined `". "` → filled into the task template).
// The WIRE carries only the picked ids (`guidedSteerSchema.rewriteToggles`), never the fragment text — the
// `gameSteer` doctrine, so a host's override is the bytes the model actually got and the capture proves it.
export interface RewriteToggle {
  readonly id: RewriteToggleId;
  readonly label: string;
  /** The prose slot whose resolved text this toggle contributes to the composed steer (no trailing period —
   *  the composer joins with `. ` and terminates the whole steer, matching the source's editIntros join). */
  readonly slot: ProseSlotId;
}

/** The wire vocabulary (`guidedSteerSchema.rewriteToggles` derives its enum from this). Declared as its own
 *  tuple rather than inferred off the catalog so the schema gets a literal union; the catalog covers it
 *  exactly, both directions, by `satisfies` + the exhaustiveness pin below. */
export const REWRITE_TOGGLE_IDS = ["concise", "expand", "novella", "internet-rp", "literary", "past-tense", "present-tense"] as const;
export type RewriteToggleId = (typeof REWRITE_TOGGLE_IDS)[number];

export const REWRITE_TOGGLES = [
  { id: "concise", label: "More concise", slot: "preset.rewriteToggle.concise" },
  { id: "expand", label: "Expand", slot: "preset.rewriteToggle.expand" },
  { id: "novella", label: "Novella prose", slot: "preset.rewriteToggle.novella" },
  { id: "internet-rp", label: "Internet-RP style", slot: "preset.rewriteToggle.internetRp" },
  { id: "literary", label: "Literary style", slot: "preset.rewriteToggle.literary" },
  { id: "past-tense", label: "Past tense", slot: "preset.rewriteToggle.pastTense" },
  { id: "present-tense", label: "Present tense", slot: "preset.rewriteToggle.presentTense" },
] as const satisfies readonly RewriteToggle[];

/** tsc-forced exhaustiveness: a wire id with no catalog row surfaces HERE (the `TEMPLATE_DEFS` precedent).
 *  The other direction is `satisfies` — a catalog row whose id is not in the tuple fails to assign. */
type UncataloguedRewriteToggleId = Exclude<RewriteToggleId, (typeof REWRITE_TOGGLES)[number]["id"]>;
const _rewriteTogglesAreExhaustive: [UncataloguedRewriteToggleId] extends [never] ? true : UncataloguedRewriteToggleId = true;
void _rewriteTogglesAreExhaustive;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Greeting transform catalog — the greeting studio's one-click steer set (audit §3). Adapted (not ported)
// from the ST Guided-Generations editIntros transform catalog (`prompts.json editIntros.options`): the
// 4-axis catalog (perspective / tense / style / gender) that IS the source's "steer an OPENING without
// prose-writing" ergonomic. Unlike REWRITE_TOGGLES (which drops the perspective/gender axes as nonsensical
// for a mid-conversation reply), the greeting studio keeps ALL FOUR — they reframe the user's viewpoint in
// an opening, which is exactly the greeting-authoring surface.
//
// Registry-as-data (the REWRITE_TOGGLES / databank SCRAPER_KINDS precedent — "substrate not a type home":
// contracts owns the shape+data both the client chips and the server's composer need). Each transform = a
// stable `id`, an `axis` (the group it belongs to — the client renders chips grouped), a display `label`,
// and the PROSE SLOT holding the instruction sentence it contributes.
//
// THE FRAGMENT BYTES ARE NOT HERE — same ARM B ruling as REWRITE_TOGGLES above: they are host-editable
// slots (`PRESET_GREETING_TRANSFORM_PROSE_SLOTS`, ./prose.ts) resolved SERVER-side by the greeting verbs
// against the caller's default-preset blob, then joined by `composeRewriteSteer` (@orb/kit/guided) in
// CATALOG ORDER with the free-text instruction appended — the ONE steer string that becomes `{{input}}`
// inside the preset's `greeting_rewrite`/`greeting_new` template. The client renders chips BLIND from this
// data and sends the picked IDS (`RewriteGreetingParams.transforms`), never fragment text. Fragments carry
// NO macros (`macros:"none"` on every slot: the composed steer is ZWSP-neutralized downstream as
// `{{input}}`, so a `{{user}}` in one would render as literal braces): "the user" / "the character" are
// spelled in plain words; the template's OWN {{char}}/{{user}} macros resolve the names.
export const GREETING_TRANSFORM_AXES = ["perspective", "tense", "style", "gender"] as const satisfies readonly string[];
export type GreetingTransformAxis = (typeof GREETING_TRANSFORM_AXES)[number];

export interface GreetingTransform {
  readonly id: GreetingTransformId;
  readonly axis: GreetingTransformAxis;
  readonly label: string;
  /** The prose slot whose resolved text this transform contributes to the composed steer (no trailing
   *  period — the composer joins with `. ` and terminates the whole steer, the source's editIntros join). */
  readonly slot: ProseSlotId;
}

/** The wire vocabulary (`RewriteGreetingParams.transforms` / `GenerateGreetingParams.transforms` validate
 *  against this). Its own tuple, for the same reason `REWRITE_TOGGLE_IDS` is one. */
export const GREETING_TRANSFORM_IDS = [
  "first-person-standard",
  "first-person-by-name",
  "first-person-as-you",
  "second-person",
  "third-person",
  "past-tense",
  "present-tense",
  "novella-style",
  "internet-rp-style",
  "literary-style",
  "script-style",
  "he-him",
  "she-her",
  "they-them",
] as const;
/** @public id twin of `GREETING_TRANSFORMS`, the catalog the greeting studio renders. */
export type GreetingTransformId = (typeof GREETING_TRANSFORM_IDS)[number];

export const GREETING_TRANSFORMS = [
  // ── perspective ──
  { id: "first-person-standard", axis: "perspective", label: "First person (I/me)", slot: "preset.greetingTransform.firstPersonStandard" },
  { id: "first-person-by-name", axis: "perspective", label: "First person (by name)", slot: "preset.greetingTransform.firstPersonByName" },
  { id: "first-person-as-you", axis: "perspective", label: "First person (as 'you')", slot: "preset.greetingTransform.firstPersonAsYou" },
  { id: "second-person", axis: "perspective", label: "Second person", slot: "preset.greetingTransform.secondPerson" },
  { id: "third-person", axis: "perspective", label: "Third person", slot: "preset.greetingTransform.thirdPerson" },
  // ── tense ──
  { id: "past-tense", axis: "tense", label: "Past tense", slot: "preset.greetingTransform.pastTense" },
  { id: "present-tense", axis: "tense", label: "Present tense", slot: "preset.greetingTransform.presentTense" },
  // ── style ──
  { id: "novella-style", axis: "style", label: "Novella prose", slot: "preset.greetingTransform.novellaStyle" },
  { id: "internet-rp-style", axis: "style", label: "Internet-RP style", slot: "preset.greetingTransform.internetRpStyle" },
  { id: "literary-style", axis: "style", label: "Literary style", slot: "preset.greetingTransform.literaryStyle" },
  { id: "script-style", axis: "style", label: "Script style", slot: "preset.greetingTransform.scriptStyle" },
  // ── gender ──
  { id: "he-him", axis: "gender", label: "He/him", slot: "preset.greetingTransform.heHim" },
  { id: "she-her", axis: "gender", label: "She/her", slot: "preset.greetingTransform.sheHer" },
  { id: "they-them", axis: "gender", label: "They/them", slot: "preset.greetingTransform.theyThem" },
] as const satisfies readonly GreetingTransform[];

/** tsc-forced exhaustiveness, both directions (the `REWRITE_TOGGLES` pin). */
type UncataloguedGreetingTransformId = Exclude<GreetingTransformId, (typeof GREETING_TRANSFORMS)[number]["id"]>;
const _greetingTransformsAreExhaustive: [UncataloguedGreetingTransformId] extends [never] ? true : UncataloguedGreetingTransformId = true;
void _greetingTransformsAreExhaustive;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Custom parameters — Layer-1 boundary guard (schema). Layer-2 runtime defense (`deepMergeRequestBody`,
// the ACTUAL defense) lives in `@orb/server/kit/custom-parameters`. Zod strips `__proto__` implicitly;
// `superRefine` here rejects `constructor`/`prototype` (which Zod does NOT strip) at every nested level.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

export type CustomParameters = Record<string, unknown>;

function rejectForbiddenKeys(obj: Record<string, unknown>, ctx: z.RefinementCtx): void {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      ctx.addIssue({
        code: "custom",
        message: `Forbidden key '${key}' — would enable prototype pollution.`,
        path: [key],
      });
    }
  }
}

// Recursive lenient JSON validator; the key check rejects FORBIDDEN_KEYS at every level.
const jsonValueSchema: z.ZodType<unknown> = z.lazy(
  (): z.ZodType<unknown> =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema).superRefine(rejectForbiddenKeys)]),
);

export const customParametersSchema: z.ZodType<CustomParameters> = z.record(z.string(), jsonValueSchema).superRefine(rejectForbiddenKeys);

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PromptConfig — the `presets.config` blob: an ordered (= array index) list of sections + generation
// knobs + regex/variables/customParameters + the names/postfix/format/guided/postProcess knobs.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Marker = a SLOT filled from chat data at assembly time. `chat_history` is the PIVOT — sections before
 *  build the system block, sections after land after the conversation. Templated markers carry an
 *  editable `template`; plain markers (content owned by the assembler) do not. */
const TEMPLATED_MARKERS = [
  "main_prompt",
  "char_description",
  "char_personality",
  "scenario",
  "dialogue_examples",
  "post_history",
  "persona",
  "memory",
  "compact_summary",
  "guided_instruction",
] as const satisfies readonly string[];
type TemplatedMarker = (typeof TEMPLATED_MARKERS)[number];

export const PLAIN_MARKERS = ["chat_history", "world_info_before", "world_info_after"] as const satisfies readonly string[];

export const MARKER_TYPES = [...TEMPLATED_MARKERS, ...PLAIN_MARKERS] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];

// Speaker-name handling on outgoing message arrays (ST `names_behavior`). `none` never includes names;
// `default` = ST persona-switch prefixing; `content` always prefixes `${name}: `; `completion` populates
// the OpenAI-spec `name` field.
export const NAMES_BEHAVIOR = ["none", "default", "content", "completion"] as const;
export type NamesBehavior = (typeof NAMES_BEHAVIOR)[number];

/** What an UNSET `namesBehavior` resolves to on the wire. Exported because the EDITOR must ghost the
 *  effective default in its select rather than render blank (side-eye F-05) — a select that shows nothing
 *  for "inherited" hides the very datum it exists to state. The assembler's two `?? "default"` sites read
 *  this same constant, so the shown default and the sent default cannot drift. */
export const DEFAULT_NAMES_BEHAVIOR: NamesBehavior = "default";

// Generation types a section's `trigger` can gate on (ST `injection_trigger`).
export const GENERATION_TYPES = ["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

// Continuation delimiter inserted between existing tip + new chunk on a continue turn.
export const CONTINUE_POSTFIX_TYPES = ["none", "space", "newline", "double-newline"] as const;
export type ContinuePostfix = (typeof CONTINUE_POSTFIX_TYPES)[number];

/** What an UNSET `continuePostfix` resolves to (the engine's `?? "none"`). Exported for the same reason as
 *  {@link DEFAULT_NAMES_BEHAVIOR} — the editor ghosts the effective default instead of rendering blank. */
export const DEFAULT_CONTINUE_POSTFIX: ContinuePostfix = "none";

/** A section's conditional gate (ST `injection_trigger`). Empty/absent ⇒ always fires. */
const triggerSchema = z.array(z.enum(GENERATION_TYPES)).max(GENERATION_TYPES.length);

/** Absolute-depth placement (ST `injection_position: ABSOLUTE`). Depth 0 = the tail; N = N turns back.
 *  Ceiling shared with `@orb/kit/injection.MAX_INJECTION_DEPTH` (one source of truth). */
const injectSchema = z.object({
  depth: z.number().int().min(MIN_INJECT_DEPTH).max(MAX_INJECTION_DEPTH),
  order: z.number().int().min(INJECT_ORDER_MIN).max(INJECT_ORDER_MAX).optional(),
});
type SectionInject = z.infer<typeof injectSchema>;

const literalSection = z.object({
  type: z.literal("literal"),
  id: z.string().min(MIN_ID_LENGTH),
  name: z.string().max(MAX_NAME_LENGTH),
  role: z.enum(MESSAGE_ROLES).default("system"),
  content: z.string().max(MAX_TEXT_LENGTH),
  enabled: z.boolean().default(true),
  inject: injectSchema.optional(),
  trigger: triggerSchema.optional(),
});

const plainMarkerSection = z.object({
  type: z.literal("marker"),
  id: z.string().min(MIN_ID_LENGTH),
  name: z.string().max(MAX_NAME_LENGTH),
  marker: z.enum(PLAIN_MARKERS),
  role: z.enum(MESSAGE_ROLES).default("system"),
  enabled: z.boolean().default(true),
});

const templatedMarkerSection = z.object({
  type: z.literal("marker"),
  id: z.string().min(MIN_ID_LENGTH),
  name: z.string().max(MAX_NAME_LENGTH),
  marker: z.enum(TEMPLATED_MARKERS),
  role: z.enum(MESSAGE_ROLES).default("system"),
  enabled: z.boolean().default(true),
  /** Custom framing template (macros allowed). Omit ⇒ `DEFAULT_MARKER_TEMPLATES[marker]` — except
   *  `main_prompt`, whose default is MODE-AWARE (a narrator turn resolves `NARRATOR_MAIN_PROMPT_TEMPLATE`;
   *  the pick lives in `assembly/assemble.ts` templateFor). This field is ONE stored text either way: an
   *  override REPLACES the default on both turn kinds, and there is no per-mode override slot.
   *  There is no "render nothing" arm: an EMPTY string is the same thing as omitted (the editor writes
   *  `undefined` when you clear the field), and turning a marker off is `enabled: false` — the one
   *  mechanism (preset-surface-redesign §5.2a, the tri-state retirement; the v4→v5 lift retires every
   *  stored `""`). */
  template: z.string().max(MAX_TEXT_LENGTH).optional(),
  inject: injectSchema.optional(),
  trigger: triggerSchema.optional(),
  /** Block the character-card override for `main_prompt`/`post_history` (ST `forbid_overrides`). */
  forbidCharacterOverride: z.boolean().optional(),
  /** Block the host ROOM override; independent of the card override. */
  forbidRoomOverride: z.boolean().optional(),
});

// Regular union (not discriminatedUnion): both marker branches share `type: "marker"`.
export const promptSectionSchema = z.union([literalSection, plainMarkerSection, templatedMarkerSection]);
export type PromptSection = z.infer<typeof promptSectionSchema>;

/** The FALLBACK the assembler uses when a preset doesn't supply a `formatStrings.<key>` — one PROSE-1 slot
 *  each (census rows 45-48), so the bytes are authored once in `./prose`. The KEYS are the editable/importable
 *  format-string vocabulary (the ST import mapper + the `knob-wire-coverage` arm-E reader both key off this
 *  literal); the VALUES are read from the registry.
 *
 *  `impersonateNudge` is the measured voice-lock (`./prose` carries the measurement + the IMP-1 probe-harness
 *  note); `responseNudge` fires only when a Response lands on an ASSISTANT tail; macros are RENDERED on the
 *  `nudgeOf` path (turn.ts `resolveNudgeText`). */
export const DEFAULT_FORMAT_STRINGS = {
  continueNudge: PRESET_PROSE_SLOTS["preset.format.continueNudge"].text,
  impersonateNudge: PRESET_PROSE_SLOTS["preset.format.impersonateNudge"].text,
  responseNudge: PRESET_PROSE_SLOTS["preset.format.responseNudge"].text,
  wiFormat: PRESET_PROSE_SLOTS["preset.format.wiFormat"].text,
  /** The history-START boundary (ST `new_chat_prompt`/`new_group_chat_prompt` — ONE key covers both; we have
   *  no chat/group split). BLANK by design, which is exactly today's behavior: the assembler emits nothing
   *  until a preset sets it (`assembly/context.ts` newChatMarkerCandidate). Spelled here rather than read
   *  from a PROSE-1 slot precisely BECAUSE it is blank — a slot is authored bytes (no slot may ship empty
   *  text), and "no boundary marker" is a product behavior, not a sentence someone wrote. */
  newChatMarker: "",
} as const;

/** The editable/importable format-string vocabulary, DERIVED from the one literal above (never re-spelled —
 *  the `knob-wire-coverage` arm-E reader and the ST import mapper both key off that literal). */
export type FormatStringKey = keyof typeof DEFAULT_FORMAT_STRINGS;

/** One format string whose token IS its payload slot. */
interface FormatCarrierToken {
  readonly key: FormatStringKey;
  /** The macro the value MUST keep: it is where the wrapped content lands. */
  readonly token: string;
}

/** CARRIER tokens — the write-boundary guard's whole enumeration (owner ruling 2026-08-02: "format strings
 *  must not silently break"). A carrier format string WRAPS content, so a non-empty value that drops its
 *  token renders the wrapper with the content GONE (`wrapWiFormat` skips the wrap entirely and the author's
 *  framing silently never ships). That write is REFUSED with a message naming the token — never accepted and
 *  quietly ignored. Blank/absent stays legal: blank means "the shipped default rides", the storage semantic
 *  everywhere in this schema.
 *
 *  THE LINE IS "DELETES CONTENT", NOT "IS A FORMAT STRING" (owner ruling 2026-08-08, option C of
 *  `docs/design/note-token-intent-history.md` — this clause previously read "DELIBERATELY DISTINCT from
 *  PROSE-1's `requiredMacros`", which was true of the `requiredMacros` set as it then stood and false of
 *  `{{note}}`). A carrier is any token whose absence deletes the payload, wherever it is stored: the two
 *  injection note frames are carriers too and refuse alongside these, from `PROSE_CARRIER_TOKENS` beside the
 *  write schema (a separate list only because their storage is the `prose` blob, not `formatStrings`).
 *
 *  PROSE-1's general `requiredMacros` STAYS A LINT (`contracts/prose-slot`: "a lint in the editor — never a
 *  block") and this ruling does not widen it: those are voice guidance whose absence WEAKENS prose (the
 *  identity macros in the impersonate nudge). Same reason the guided templates' missing-`{{input}}` check
 *  stays a display lint (`guidedFooterState`) and is not enumerated here — an empty steer template
 *  legitimately means "the steer lands on its own, unwrapped".
 *
 *  A new carrier = one row here; the refine below reads nothing else. */
const FORMAT_STRING_CARRIER_TOKENS = [{ key: "wiFormat", token: "{{entry}}" }] as const satisfies readonly FormatCarrierToken[];

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE TEMPLATE DEFINITION REGISTRY (preset-surface-redesign §6.6) — the Actions view's ONE data source.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Registry-as-data (the REWRITE_TOGGLES / GREETING_TRANSFORMS precedent — contracts owns the shape+data both
// the client rows and any server consumer need). The Actions view DERIVES groups, rows, kind badges and
// drill-in FIELDS from this table: a new template is one enum member + one row here (the D117
// registration-cost shape), never a new editor. The client's old `GUIDED_ACTION_COPY` map is retired INTO
// `label`/`fires` (G11) — one home for the copy.
//
// SCOPE (§6.6, WIDENED by the owner ruling of 2026-08-07 — "templates need to have one home in presets not
// scattered between that and settings or hiding in code"): `guidedActions` ∪ the ACTION-shaped
// `formatStrings` ∪ `PRESET_PROSE_SLOT_IDS` (the turn-wire framings, which used to be `UserSettings.prose`
// rows and a `const` in `assembly/shape.ts`). The original §6.6 line read "the ACTIONS-VIEW set only" and was
// scoped to things a USER ACTION fires; the ruling makes the tab the one home for authorable prompt TEXT,
// which is a superset. A row's `kind` still says which it is. WIDENED AGAIN 2026-08-08 by the same ruling read
// to its end ("we are putting everything in presets"): the eleven rpg steering-reminder teaches re-homed here
// from `rpg_games.config.prose`, so the set is now every `PRESET_PROSE_SLOT_ID` whatever domain authored it.
// `wiFormat` is NOT here: it frames world-info ENTRIES and is edited in the WI marker's body editor (§6.5
// census), so a row would mint the second home the census exists to prevent. Marker templates
// (scenario/personality/…) likewise keep their section home.
//
// `label`/`fires` are the ROW's copy (per-kind: `response` and `swipe` are two rows), distinct from the
// PROSE-1 slot's `title`/`fires` (per-SLOT copy — those two kinds SHARE one slot, so slot copy cannot name a
// row). `defaultSlot` is the one pointer between them: the ghost/placeholder bytes always come from PROSE-1.

// `teach` (added 2026-08-08 with the rpg re-home) is the sixth kind and the only one that does NOT fire on a user
// action: a teach is standing copy the GAME TURN's steering reminder composes — it teaches the model an output
// grammar (`<lie …/>`, `:::card`, `:::choices`) or labels a block of tracked state. It is its own kind rather
// than more `format` rows because a group kicker is what tells a preset author "these eleven only do anything on
// a game turn"; folding them into Format would put game vocabulary under the New-chat marker with nothing on
// screen saying so.
// `extract` is the WRITE-surface twin of `teach` (PROSE-1 S4): a `teach` row shapes what the NARRATOR is told
// the tracked values mean; an `extract` row shapes what the EXTRACTOR is told to write back — the per-plane
// teaching, the six state tools' descriptions, the two state-round system framings, and the born-state
// (populate) round's own header/teaching/user-turn blocks. Its own kind rather
// than more `teach` rows because the two groups fire on different CALLS (the character turn vs the state
// round) and a host tuning one has no reason to read the other.
// `group` (added 2026-08-08 with the F4 re-home) is the wire framings a GROUP round puts around content — the
// co-speaker card headings and the per-speaker/narrator round nudges + speaker-tag instruction. Its own kind
// rather than more `format` rows for the exact reason `teach` is: the kicker is what tells a preset author
// "these seven only do anything on a MULTI-character round"; folding them into Format would bury group
// vocabulary under the New-chat marker with nothing on screen saying so. Like `format`/`nudge` they fire on
// the shape of the WIRE (a merged/narrator round), never on a user action.
export const TEMPLATE_KINDS = ["steer", "voice", "studio", "format", "nudge", "group", "teach", "extract"] as const satisfies readonly string[];
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Sub-clusters for a kind whose row count outgrew a glance (the Actions-tab IA,
 *  `docs/design/actions-tab-information-architecture.md` §2.1). Today that is `extract` alone: its 40 rows
 *  render as collapsed disclosure bands, one per member here, in THIS tuple's order. Membership is DECLARED
 *  per def (`TemplateDef.cluster`) rather than derived from the slot-id dot-prefixes, because the grouping
 *  follows what a HOST TUNES TOGETHER, not the engineering id structure (`rpg.extract.plane.party` clusters
 *  with the party teaching, which no string-split can know). The client's band labels are keyed by this
 *  union (`TEMPLATE_CLUSTER_LABEL`), so a new member fails `tsc` there until labeled — the
 *  `TEMPLATE_KIND_LABEL` registration shape, one level down. */
export const TEMPLATE_CLUSTERS = ["round", "scene", "party", "planes", "tools", "refs"] as const satisfies readonly string[];
export type TemplateClusterId = (typeof TEMPLATE_CLUSTERS)[number];

/** One declared capability of a template — the EXTENSIBLE axis. A template needing a genuinely new field
 *  class is a NEW MEMBER here plus its renderer row in the editor's exhaustive `Record`, never a fork of the
 *  editor ([[lock-the-extensible-shape]]). A def declaring NO capabilities renders text-only BY DERIVATION
 *  (that is why the nudges need no branch on their name). */
export type TemplateCapability =
  | { readonly kind: "role" }
  | { readonly kind: "depth" }
  /** The substitution vocabulary the editor offers as chips + lints. Membership here is EDITOR vocabulary,
   *  never a write refusal: a missing `{{input}}` is a lint (empty legitimately means "the steer lands on its
   *  own"). The refusal set is `FORMAT_STRING_CARRIER_TOKENS`, above. */
  | { readonly kind: "tokens"; readonly tokens: readonly string[] };

/** WHICH slot a def edits — three storage arms, every vocabulary derived rather than re-spelled: a
 *  guided-action kind (`guidedActions.<kind>.prompt`), a format-string key (`formatStrings.<key>`), or a
 *  PROSE-1 slot id (`prose[<id>].text` — the 2026-08-07 framing rows). The id IS the storage key in all
 *  three, which is what keeps "one enum member + one def row" true for the new arm too.
 *
 *  The prose arm is typed as the WHOLE `ProseSlotId` union because the `home` that narrows it to the
 *  preset-owned subset is runtime data in `#prose`, and `#prose` imports THIS module (the `no-circular`
 *  reason `#prose-slot` exists). The narrowing is enforced two-sidedly instead — every
 *  `PRESET_PROSE_SLOT_IDS` member has a row and every prose-armed row is a member — by
 *  `tests/contracts/prose/index.contract.test.ts`, which can import both. */
export type TemplateDefId = GuidedActionKind | FormatStringKey | ProseSlotId;

export interface TemplateDef {
  readonly id: TemplateDefId;
  /** The GROUP header AND the row badge — one vocabulary, two renderings. */
  readonly kind: TemplateKind;
  readonly label: string;
  /** The fires-on gloss. DESCRIPTIVE ONLY — never a control: a template's firing condition is the user's
   *  click, and the editable trigger vocabulary lives exclusively in the section drill-in (§5.0). */
  readonly fires: string;
  readonly caps: readonly TemplateCapability[];
  /** The ghost's byte source — the PROSE-1 one-home for every default (`./prose`). `undefined` ⇒ this slot
   *  ships NO default bytes (`newChatMarker`: blank means the feature is off until the host writes it), so
   *  its editor ghosts nothing. A prose slot is authored bytes; an empty one is not a slot. Spelled
   *  `| undefined` (and written explicitly on that one row) so the property exists on EVERY def — a reader
   *  walking the table never has to narrow before asking for it. */
  readonly defaultSlot?: ProseSlotId | undefined;
  /** The Actions-list SUB-CLUSTER this row renders under ({@link TEMPLATE_CLUSTERS}) — declared on every
   *  `extract` row and on nothing else, a pairing the type system cannot state (the kind and the cluster are
   *  two independent fields), so it is enforced two-sidedly by the registry contract test instead: an
   *  extract row WITHOUT a cluster would render mis-filed above the bands, and a clustered row of an
   *  un-banded kind would declare a band no renderer draws. */
  readonly cluster?: TemplateClusterId | undefined;
}

/** Every guided template delivers in-chat, so each carries role + depth; the token list is the editor's chip
 *  vocabulary for that template. */
const STEER_CAPS: readonly TemplateCapability[] = [{ kind: "role" }, { kind: "depth" }, { kind: "tokens", tokens: ["{{input}}"] }];

export const TEMPLATE_DEFS = [
  {
    id: "response",
    kind: "steer",
    label: "Response",
    fires: "You steer your next reply from the composer",
    caps: STEER_CAPS,
    defaultSlot: "preset.guided.response",
  },
  { id: "swipe", kind: "steer", label: "Swipe", fires: "You steer a re-roll of the last reply", caps: STEER_CAPS, defaultSlot: "preset.guided.response" },
  {
    id: "rewrite",
    kind: "steer",
    label: "Rewrite",
    fires: "You rewrite the last reply out of character",
    caps: STEER_CAPS,
    defaultSlot: "preset.guided.rewrite",
  },
  { id: "opening", kind: "steer", label: "Opening", fires: "A new chat's first message", caps: STEER_CAPS, defaultSlot: "preset.guided.opening" },
  // ── THE REWRITE MODAL'S ONE-CLICK STEER VOCABULARY (the templating fork, ARM B — owner 2026-08-09) ────
  // The seven toggle sentences the Rewrite modal joins into the correction steer. `steer` kind, and they sit
  // under the Rewrite row they compose into: their bytes reach the model INSIDE that steer, by exactly the
  // delivery `TEMPLATE_KIND_DELIVERY.steer` already states (a system-role steer rides the
  // `{{guided_instruction}}` marker). A new kind would have had to restate that sentence, which is the
  // doubling one-home forbids — the kicker "Steers" is true of these rows too.
  // `caps: []` — a fragment is a plain sentence: no role, no depth (the Rewrite ACTION owns delivery) and no
  // token vocabulary (`macros:"none"`; a `{{…}}` here would ship as literal braces past the neutralizer).
  {
    id: "preset.rewriteToggle.concise",
    kind: "steer",
    label: "More concise",
    fires: 'The Rewrite modal with "More concise" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.concise",
  },
  {
    id: "preset.rewriteToggle.expand",
    kind: "steer",
    label: "Expand",
    fires: 'The Rewrite modal with "Expand" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.expand",
  },
  {
    id: "preset.rewriteToggle.novella",
    kind: "steer",
    label: "Novella prose",
    fires: 'The Rewrite modal with "Novella prose" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.novella",
  },
  {
    id: "preset.rewriteToggle.internetRp",
    kind: "steer",
    label: "Internet-RP style",
    fires: 'The Rewrite modal with "Internet-RP style" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.internetRp",
  },
  {
    id: "preset.rewriteToggle.literary",
    kind: "steer",
    label: "Literary style",
    fires: 'The Rewrite modal with "Literary style" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.literary",
  },
  {
    id: "preset.rewriteToggle.pastTense",
    kind: "steer",
    label: "Past tense",
    fires: 'The Rewrite modal with "Past tense" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.pastTense",
  },
  {
    id: "preset.rewriteToggle.presentTense",
    kind: "steer",
    label: "Present tense",
    fires: 'The Rewrite modal with "Present tense" picked',
    caps: [],
    defaultSlot: "preset.rewriteToggle.presentTense",
  },
  {
    id: "continue",
    kind: "steer",
    label: "Continue",
    fires: "You steer a continuation of the last reply",
    caps: STEER_CAPS,
    defaultSlot: "preset.guided.continue",
  },
  {
    id: "impersonate",
    kind: "voice",
    label: "Impersonate",
    fires: "The model writes as you for one turn",
    caps: [{ kind: "role" }, { kind: "depth" }, { kind: "tokens", tokens: ["{{input}}", "{{person}}"] }],
    defaultSlot: "preset.guided.impersonate",
  },
  {
    id: "greeting_rewrite",
    kind: "studio",
    label: "Greeting rewrite",
    fires: "You rewrite an existing greeting in the character studio",
    caps: [{ kind: "role" }, { kind: "depth" }, { kind: "tokens", tokens: ["{{input}}", "{{base}}"] }],
    defaultSlot: "preset.guided.greetingRewrite",
  },
  {
    id: "greeting_new",
    kind: "studio",
    label: "New greeting",
    fires: "You generate a fresh greeting in the character studio",
    caps: STEER_CAPS,
    defaultSlot: "preset.guided.greetingNew",
  },
  // ── THE GREETING STUDIO'S ONE-CLICK STEER VOCABULARY (the same ARM B ruling) ──────────────────────────
  // The fourteen transform sentences the studio joins into the greeting steer, across its four axes
  // (perspective / tense / style / gender — the axis groups the CHIPS, so it lives on the catalog row, not
  // here). `studio` kind for the same reason the toggles are `steer`: these bytes reach the model inside the
  // `greeting_rewrite`/`greeting_new` steer, which is the delivery that kind already states. `caps: []`.
  {
    id: "preset.greetingTransform.firstPersonStandard",
    kind: "studio",
    label: "First person (I/me)",
    fires: 'The greeting studio with "First person (I/me)" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.firstPersonStandard",
  },
  {
    id: "preset.greetingTransform.firstPersonByName",
    kind: "studio",
    label: "First person (by name)",
    fires: 'The greeting studio with "First person (by name)" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.firstPersonByName",
  },
  {
    id: "preset.greetingTransform.firstPersonAsYou",
    kind: "studio",
    label: "First person (as 'you')",
    fires: "The greeting studio with \"First person (as 'you')\" picked",
    caps: [],
    defaultSlot: "preset.greetingTransform.firstPersonAsYou",
  },
  {
    id: "preset.greetingTransform.secondPerson",
    kind: "studio",
    label: "Second person",
    fires: 'The greeting studio with "Second person" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.secondPerson",
  },
  {
    id: "preset.greetingTransform.thirdPerson",
    kind: "studio",
    label: "Third person",
    fires: 'The greeting studio with "Third person" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.thirdPerson",
  },
  {
    id: "preset.greetingTransform.pastTense",
    kind: "studio",
    label: "Past tense",
    fires: 'The greeting studio with "Past tense" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.pastTense",
  },
  {
    id: "preset.greetingTransform.presentTense",
    kind: "studio",
    label: "Present tense",
    fires: 'The greeting studio with "Present tense" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.presentTense",
  },
  {
    id: "preset.greetingTransform.novellaStyle",
    kind: "studio",
    label: "Novella prose",
    fires: 'The greeting studio with "Novella prose" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.novellaStyle",
  },
  {
    id: "preset.greetingTransform.internetRpStyle",
    kind: "studio",
    label: "Internet-RP style",
    fires: 'The greeting studio with "Internet-RP style" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.internetRpStyle",
  },
  {
    id: "preset.greetingTransform.literaryStyle",
    kind: "studio",
    label: "Literary style",
    fires: 'The greeting studio with "Literary style" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.literaryStyle",
  },
  {
    id: "preset.greetingTransform.scriptStyle",
    kind: "studio",
    label: "Script style",
    fires: 'The greeting studio with "Script style" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.scriptStyle",
  },
  {
    id: "preset.greetingTransform.heHim",
    kind: "studio",
    label: "He/him",
    fires: 'The greeting studio with "He/him" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.heHim",
  },
  {
    id: "preset.greetingTransform.sheHer",
    kind: "studio",
    label: "She/her",
    fires: 'The greeting studio with "She/her" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.sheHer",
  },
  {
    id: "preset.greetingTransform.theyThem",
    kind: "studio",
    label: "They/them",
    fires: 'The greeting studio with "They/them" picked',
    caps: [],
    defaultSlot: "preset.greetingTransform.theyThem",
  },
  // A `formatStrings` slot is a plain string: no role, no depth (nothing to deliver it as — the assembler
  // owns where each one lands), so its drill-in renders text-only by declaring no such capability.
  {
    id: "continueNudge",
    kind: "nudge",
    label: "Continue nudge",
    fires: "A Continue fired with no steering text",
    caps: [],
    defaultSlot: "preset.format.continueNudge",
  },
  {
    id: "impersonateNudge",
    kind: "nudge",
    label: "Impersonate nudge",
    fires: "An Impersonate fired with no steering text — the measured voice-lock",
    caps: [{ kind: "tokens", tokens: ["{{person}}", "{{user}}", "{{char}}"] }],
    defaultSlot: "preset.format.impersonateNudge",
  },
  {
    id: "responseNudge",
    kind: "nudge",
    label: "Response nudge",
    fires: "A Response fired on an assistant tail — a reply with nothing to reply to",
    caps: [],
    defaultSlot: "preset.format.responseNudge",
  },
  {
    id: "newChatMarker",
    kind: "format",
    label: "New-chat marker",
    fires: "Marks where the conversation starts, at the top of the history",
    caps: [],
    // No prose slot: blank by design — nothing is emitted until the host writes a marker, and a PROSE-1
    // slot is authored bytes (no slot may ship empty text).
    defaultSlot: undefined,
  },
  // ── THE TURN-WIRE FRAMINGS (owner ruling 2026-08-07) ──────────────────────────────────────────────────
  // The three wrappers assembly puts AROUND content on the way to the model. They are `format`, not `nudge`:
  // a nudge is prose fired by an ACTION with nothing to steer it; these fire on the shape of the WIRE (a
  // demoted system row, an operator note, a history that would end on the model's own reply). Their id is a
  // PROSE-1 slot id, so their storage is `prose[<id>].text` — the third form path.
  {
    id: "chat.injection.systemNote",
    kind: "format",
    label: "System-note frame",
    fires: "A system-role injection the model can't take as a real system row",
    caps: [{ kind: "tokens", tokens: ["{{note}}"] }],
    defaultSlot: "chat.injection.systemNote",
  },
  {
    id: "chat.injection.userNote",
    kind: "format",
    label: "User-note frame",
    fires: "Every user-role injection — author's note, host steering, a re-framed injection",
    caps: [{ kind: "tokens", tokens: ["{{note}}"] }],
    defaultSlot: "chat.injection.userNote",
  },
  {
    id: "chat.assembly.continuationNudge",
    kind: "format",
    label: "Continuation cue",
    fires: "A turn you didn't type into, on a history that would otherwise end on the model's own reply",
    caps: [],
    defaultSlot: "chat.assembly.continuationNudge",
  },
  // ── THE GROUP-ROUND FRAMINGS (F4 re-home, owner ruling 2026-08-08 — D132(B) amendment) ─────────────────────
  // The seven `chat.group.*` slots the MULTI-character round puts around content: the merged/narrator co-speaker
  // card headings and the per-speaker/narrator round nudges + the speaker-tag instruction. Re-homed user →
  // preset by the F4 ruling arm (a) — they resolve during the turn's own context build where the preset IS in
  // scope, so their storage is `promptConfig.prose` and each ghosts its own slot's bytes (`defaultSlot === id`).
  // `group` kind (not `format`) so the "Group rounds" kicker tells a preset author these only fire on a
  // multi-character round. The `{{name}}`/`{{names}}` are PRE-SUBSTITUTION tokens the assembler splices per
  // member — the editor offers them as chips and lints their absence; `speakerTags` carries no macro token.
  {
    id: "chat.group.alsoPresent",
    kind: "group",
    label: "Co-speaker heading",
    fires: "A merged group turn — opens each other present member's card block",
    caps: [{ kind: "tokens", tokens: ["{{name}}"] }],
    defaultSlot: "chat.group.alsoPresent",
  },
  {
    id: "chat.group.castMember",
    kind: "group",
    label: "Cast heading",
    fires: "A narrator round — opens each cast member's card block beside the primary",
    caps: [{ kind: "tokens", tokens: ["{{name}}"] }],
    defaultSlot: "chat.group.castMember",
  },
  {
    id: "chat.group.scenarioHeading",
    kind: "group",
    label: "Scenario heading",
    fires: "A merged group turn — heads each present member's scenario",
    caps: [{ kind: "tokens", tokens: ["{{name}}"] }],
    defaultSlot: "chat.group.scenarioHeading",
  },
  {
    id: "chat.group.exampleHeading",
    kind: "group",
    label: "Example heading",
    fires: "A merged group turn — heads each present member's example dialogue",
    caps: [{ kind: "tokens", tokens: ["{{name}}"] }],
    defaultSlot: "chat.group.exampleHeading",
  },
  {
    id: "chat.group.roundNudge",
    kind: "group",
    label: "Speaker nudge",
    fires: "Every speaker of a MULTI-speaker group round — the per-speaker voice fence",
    caps: [{ kind: "tokens", tokens: ["{{name}}"] }],
    defaultSlot: "chat.group.roundNudge",
  },
  {
    id: "chat.group.narratorNudge",
    kind: "group",
    label: "Narrator nudge",
    fires: "A multi-member narrator round with the group nudge on — names the cast this one reply voices",
    caps: [{ kind: "tokens", tokens: ["{{names}}"] }],
    defaultSlot: "chat.group.narratorNudge",
  },
  {
    id: "chat.group.speakerTags",
    kind: "group",
    label: "Speaker tags",
    fires: 'A multi-member narrator round with "Label each speaker" on — asks for the <speaker> markers',
    caps: [],
    defaultSlot: "chat.group.speakerTags",
  },
  // ── THE GAME-TURN TEACHES (owner ruling 2026-08-08, "we are putting everything in presets") ────────────────
  // The eleven slots the rpg steering reminder composes. They were `rpg_games.config.prose` for one merge; the
  // ruling re-homed them to `promptConfig.prose`, which is what puts them here — a preset-homed prose slot with
  // no row is a slot no host can reach, and the two-sided coverage test in `tests/contracts/prose/` REDs on it.
  // Each row's `fires` states its GATE, because most of these are conditional on a per-game feature knob: the
  // copy is authored on the preset, the FIRING is still the game's.
  // The seven `names-only` teaches declare `{{user}}`/`{{char}}` as token vocabulary — the identity registry
  // really does resolve them in an override (`resolveTeach`), so the chips are a true statement, not decoration.
  {
    id: "rpg.reminder.steeringLicense",
    kind: "teach",
    label: "Steering license",
    fires: "Every game turn — licenses the tracked values to shape the fiction",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.reminder.steeringLicense",
  },
  {
    id: "rpg.reminder.deceptionTeach",
    kind: "teach",
    label: "Deception teach",
    fires: "A game turn with Deception on — teaches the hidden <lie …/> tag",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.reminder.deceptionTeach",
  },
  {
    id: "rpg.reminder.omniscienceTeach",
    kind: "teach",
    label: "Perception teach",
    fires: "A game turn with Perception filter on — teaches the hidden <ofilter …/> tag",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.reminder.omniscienceTeach",
  },
  // The pair's `fires` glosses FRONT-LOAD the discriminator: they used to differ only in their final word
  // ("…interactivity allowed"/"…off"), so at any one-line truncation the two rows read byte-identically.
  {
    id: "rpg.card.askInteractive",
    kind: "teach",
    label: "Interactive card",
    fires: "Interactivity allowed — a game turn with immersive cards on",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.card.askInteractive",
  },
  {
    id: "rpg.card.askStatic",
    kind: "teach",
    label: "Static card",
    fires: "Interactivity off — a game turn with immersive cards on",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.card.askStatic",
  },
  {
    id: "rpg.card.example",
    kind: "teach",
    label: "Card example",
    fires: "Appended to whichever card teach is running",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.card.example",
  },
  {
    id: "rpg.reminder.cyoaTeach",
    kind: "teach",
    label: "Choices teach",
    fires: "A game turn with CYOA on — teaches the standing :::choices fence",
    caps: [{ kind: "tokens", tokens: ["{{user}}", "{{char}}"] }],
    defaultSlot: "rpg.reminder.cyoaTeach",
  },
  // The four `macros:"none"` labels — no token vocabulary, because a header has no character context to
  // substitute and a `{{…}}` in an override would ship as literal braces.
  {
    id: "rpg.reminder.castHeader",
    kind: "teach",
    label: "Present header",
    fires: "Heads the present cast, whenever a scene member carries a standing guide",
    caps: [],
    defaultSlot: "rpg.reminder.castHeader",
  },
  {
    id: "rpg.reminder.offstageHeader",
    kind: "teach",
    label: "Offstage header",
    fires: "Heads the established characters who are not in this scene",
    caps: [],
    defaultSlot: "rpg.reminder.offstageHeader",
  },
  {
    id: "rpg.delta.changesHeading",
    kind: "teach",
    label: "Changes heading",
    fires: "Heads the what-changed block, on a game turn where tracked state moved",
    caps: [],
    defaultSlot: "rpg.delta.changesHeading",
  },
  {
    id: "rpg.delta.sceneOpensHeading",
    kind: "teach",
    label: "Scene opens",
    fires: "Heads the first beat's state — an opening, not a diff",
    caps: [],
    defaultSlot: "rpg.delta.sceneOpensHeading",
  },
  // ── THE EXTRACTION SEAM (PROSE-1 S4, census 11-26 + 29-36) ───────────────────────────────────────────────
  // The write surface's own prose: what the state round is told to record, per plane, per tool. Several rows
  // carry a PRE-SUBSTITUTION token vocabulary — this game's tracker catalogue, the resolved ref lists, the
  // worked example's keys — which the seam splices as DATA (never the macro engine, which has no binding to
  // offer an extraction prompt). Those chips are true statements: drop a token from an override and the value
  // it carried is simply gone, which is exactly what the footer lint warns about.
  //
  // EVERY row here declares a `cluster` (the Actions-list bands — the tuple order within a cluster is this
  // table's own), and the `fires` glosses do NOT re-say the cluster's noun: the band names the scene plane /
  // the ref block ONCE, so a row under it states only its own condition (the X-7 anti-echo rule).
  {
    id: "rpg.extract.deceptionSurface",
    kind: "extract",
    label: "Surface only",
    fires: "Heads every extraction on a Deception/Perception game",
    caps: [],
    defaultSlot: "rpg.extract.deceptionSurface",
    cluster: "round",
  },
  {
    id: "rpg.extract.party.resources",
    kind: "extract",
    label: "Resource trackers",
    fires: "This game defines a spend/restore tracker on an actor",
    caps: [{ kind: "tokens", tokens: ["{{trackerCatalogue}}"] }],
    defaultSlot: "rpg.extract.party.resources",
    cluster: "party",
  },
  {
    id: "rpg.extract.party.states",
    kind: "extract",
    label: "State trackers",
    fires: "This game defines a set-the-reading tracker on an actor",
    caps: [{ kind: "tokens", tokens: ["{{trackerCatalogue}}"] }],
    defaultSlot: "rpg.extract.party.states",
    cluster: "party",
  },
  {
    id: "rpg.extract.party.trackerScope",
    kind: "extract",
    label: "Not every actor",
    fires: "Closes the per-actor tracker teaching",
    caps: [],
    defaultSlot: "rpg.extract.party.trackerScope",
    cluster: "party",
  },
  {
    id: "rpg.extract.scene.core",
    kind: "extract",
    label: "Scene basics",
    fires: "Opens the plane on every extraction",
    caps: [{ kind: "tokens", tokens: ["{{timeOfDayValues}}"] }],
    defaultSlot: "rpg.extract.scene.core",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.clock",
    kind: "extract",
    label: "Keep time moving",
    fires: "When to advance the clock",
    caps: [],
    defaultSlot: "rpg.extract.scene.clock",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.weather",
    kind: "extract",
    label: "Weather steer",
    fires: "The sky, never the room",
    caps: [{ kind: "tokens", tokens: ["{{weatherTypes}}"] }],
    defaultSlot: "rpg.extract.scene.weather",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.dayStructured",
    kind: "extract",
    label: "Day counter",
    fires: "A game whose dates are structured (an integer day)",
    caps: [],
    defaultSlot: "rpg.extract.scene.dayStructured",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.dayNarrated",
    kind: "extract",
    label: "Narrated date",
    fires: "A game whose dates are narrated (no day counter)",
    caps: [],
    defaultSlot: "rpg.extract.scene.dayNarrated",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.present",
    kind: "extract",
    label: "Who is present",
    fires: "The cast upsert/remove teaching",
    caps: [],
    defaultSlot: "rpg.extract.scene.present",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.mood",
    kind: "extract",
    label: "Mood is short",
    fires: "The 1-3 word contract on mood",
    caps: [],
    defaultSlot: "rpg.extract.scene.mood",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.emoji",
    kind: "extract",
    label: "Portrait emoji",
    fires: "A newly-seen character's fallback",
    caps: [],
    defaultSlot: "rpg.extract.scene.emoji",
    cluster: "scene",
  },
  {
    id: "rpg.extract.scene.plot",
    kind: "extract",
    label: "Plot act rail",
    fires: "A game with Plot progression on",
    caps: [],
    defaultSlot: "rpg.extract.scene.plot",
    cluster: "scene",
  },
  {
    id: "rpg.extract.plane.party",
    kind: "extract",
    label: "Party plane",
    fires: "Mechanical changes only",
    caps: [],
    defaultSlot: "rpg.extract.plane.party",
    cluster: "party",
  },
  {
    id: "rpg.extract.plane.inventory",
    kind: "extract",
    label: "Inventory plane",
    fires: "Every extraction, and the born-state round",
    caps: [],
    defaultSlot: "rpg.extract.plane.inventory",
    cluster: "planes",
  },
  {
    id: "rpg.extract.plane.trackers",
    kind: "extract",
    label: "Game trackers",
    fires: "This game defines an unlocked game-wide tracker",
    caps: [{ kind: "tokens", tokens: ["{{trackerCatalogue}}"] }],
    defaultSlot: "rpg.extract.plane.trackers",
    cluster: "party",
  },
  {
    id: "rpg.extract.plane.quests",
    kind: "extract",
    label: "Quests plane",
    fires: "Every extraction, and the born-state round",
    caps: [],
    defaultSlot: "rpg.extract.plane.quests",
    cluster: "planes",
  },
  {
    id: "rpg.extract.plane.journal",
    kind: "extract",
    label: "Journal plane",
    fires: "Opens the plane on every extraction",
    caps: [],
    defaultSlot: "rpg.extract.plane.journal",
    cluster: "planes",
  },
  {
    id: "rpg.extract.journal.customType",
    kind: "extract",
    label: "Custom log type",
    fires: "A game that defines no journal-type labels of its own",
    caps: [],
    defaultSlot: "rpg.extract.journal.customType",
    cluster: "planes",
  },
  {
    id: "rpg.extract.journal.customLabels",
    kind: "extract",
    label: "This game's logs",
    fires: "A game that defines its own journal-type labels",
    caps: [{ kind: "tokens", tokens: ["{{journalTypeLabels}}"] }],
    defaultSlot: "rpg.extract.journal.customLabels",
    cluster: "planes",
  },
  // ROW 27 and the reconcile rule both tail the plane teaching on every extraction — their `fires` glosses
  // FRONT-LOAD what tells them apart (the identical-truncation defect the askInteractive/askStatic pair had:
  // two rows whose one-line glosses differ only past the ellipsis read as the same row).
  {
    id: "rpg.extract.stateTrackingGuide",
    kind: "extract",
    label: "Be thorough",
    fires: "The record-everything push — sums the planes on every extraction",
    caps: [],
    defaultSlot: "rpg.extract.stateTrackingGuide",
    cluster: "round",
  },
  {
    id: "rpg.extract.reconcileDoctrine",
    kind: "extract",
    label: "Reconcile rule",
    fires: "The contradiction fix — closes the plane teaching on every extraction",
    caps: [],
    defaultSlot: "rpg.extract.reconcileDoctrine",
    cluster: "round",
  },
  // The eight TOOL rows wear HUMAN labels (the Actions-tab IA — `template-rows.ts`'s own kicker law applies
  // to a row title too); the WIRE name each row edits stays in its `fires` gloss verbatim, so the author can
  // still map row → tool without a second registry field.
  {
    id: "rpg.extract.tool.updateParty",
    kind: "extract",
    label: "Party update",
    fires: "The update_party tool's description, every tool vehicle",
    caps: [{ kind: "tokens", tokens: ["{{actorTrackers}}", "{{partyExample}}"] }],
    defaultSlot: "rpg.extract.tool.updateParty",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.partyExample",
    kind: "extract",
    label: "Party example",
    fires: "The worked call update_party's description ends on",
    caps: [{ kind: "tokens", tokens: ["{{trackerDeltaArg}}", "{{trackerSetArg}}"] }],
    defaultSlot: "rpg.extract.tool.partyExample",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.updateInventory",
    kind: "extract",
    label: "Inventory update",
    fires: "The update_inventory tool's description",
    caps: [],
    defaultSlot: "rpg.extract.tool.updateInventory",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.updateScene",
    kind: "extract",
    label: "Scene update",
    fires: "The update_scene tool's description",
    caps: [{ kind: "tokens", tokens: ["{{weatherTypes}}"] }],
    defaultSlot: "rpg.extract.tool.updateScene",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.setTracker",
    kind: "extract",
    label: "Set tracker",
    fires: "The set_tracker tool — only when this game has one",
    caps: [{ kind: "tokens", tokens: ["{{gameTrackerCatalogue}}", "{{exampleTrackerKey}}"] }],
    defaultSlot: "rpg.extract.tool.setTracker",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.upsertQuest",
    kind: "extract",
    label: "Quest update",
    fires: "The upsert_quest tool's description",
    caps: [],
    defaultSlot: "rpg.extract.tool.upsertQuest",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.addJournalEntry",
    kind: "extract",
    label: "Journal entry",
    fires: "The add_journal_entry tool's description",
    caps: [],
    defaultSlot: "rpg.extract.tool.addJournalEntry",
    cluster: "tools",
  },
  {
    id: "rpg.extract.tool.noChanges",
    kind: "extract",
    label: "No changes",
    fires: "The no_changes quiet-beat escape tool's description",
    caps: [],
    defaultSlot: "rpg.extract.tool.noChanges",
    cluster: "tools",
  },
  {
    id: "rpg.extract.systemHeader",
    kind: "extract",
    label: "Extraction header",
    fires: "Opens the structured extraction's system prompt",
    caps: [],
    defaultSlot: "rpg.extract.systemHeader",
    cluster: "round",
  },
  {
    id: "rpg.extract.toolRoundHeader",
    kind: "extract",
    label: "Tool-round header",
    fires: "Opens the cheap tool round's system prompt",
    caps: [],
    defaultSlot: "rpg.extract.toolRoundHeader",
    cluster: "round",
  },
  {
    id: "rpg.extract.reconcilePass",
    kind: "extract",
    label: "Reconcile pass",
    fires: "A reconcile beat's state round, and a host resync",
    caps: [],
    defaultSlot: "rpg.extract.reconcilePass",
    cluster: "round",
  },
  {
    id: "rpg.extract.foldedReconcile",
    kind: "extract",
    label: "Folded reconcile",
    fires: "A reconcile beat on a folded game — rides the reminder",
    caps: [],
    defaultSlot: "rpg.extract.foldedReconcile",
    cluster: "round",
  },
  {
    id: "rpg.extract.lockedPaths",
    kind: "extract",
    label: "Locked paths",
    fires: "A turn where a player has pinned a tracked field",
    caps: [{ kind: "tokens", tokens: ["{{lockedPaths}}"] }],
    defaultSlot: "rpg.extract.lockedPaths",
    cluster: "round",
  },
  {
    id: "rpg.extract.refs.targets",
    kind: "extract",
    label: "Valid targets",
    fires: "When this call resolved a targetable actor",
    caps: [{ kind: "tokens", tokens: ["{{targetRefs}}"] }],
    defaultSlot: "rpg.extract.refs.targets",
    cluster: "refs",
  },
  {
    id: "rpg.extract.refs.playerToken",
    kind: "extract",
    label: "Player token",
    fires: 'When the "player" token is in the enum',
    caps: [{ kind: "tokens", tokens: ["{{playerRef}}", "{{playerName}}"] }],
    defaultSlot: "rpg.extract.refs.playerToken",
    cluster: "refs",
  },
  {
    id: "rpg.extract.refs.trackerGroup",
    kind: "extract",
    label: "Per-actor keys",
    fires: "Once per distinct writable-tracker set on this game's actors",
    caps: [{ kind: "tokens", tokens: ["{{targetRefs}}", "{{trackerKeys}}"] }],
    defaultSlot: "rpg.extract.refs.trackerGroup",
    cluster: "refs",
  },
  {
    id: "rpg.extract.refs.gameTrackerKeys",
    kind: "extract",
    label: "Game-wide keys",
    fires: "When this game has a writable game tracker",
    caps: [{ kind: "tokens", tokens: ["{{trackerKeys}}"] }],
    defaultSlot: "rpg.extract.refs.gameTrackerKeys",
    cluster: "refs",
  },
  {
    id: "rpg.extract.refs.conditions",
    kind: "extract",
    label: "Live conditions",
    fires: "When somebody is carrying a condition",
    caps: [{ kind: "tokens", tokens: ["{{conditions}}"] }],
    defaultSlot: "rpg.extract.refs.conditions",
    cluster: "refs",
  },
  {
    id: "rpg.extract.refs.closing",
    kind: "extract",
    label: "Never invent",
    fires: "Closes the block on every extraction",
    caps: [],
    defaultSlot: "rpg.extract.refs.closing",
    cluster: "refs",
  },
  // ── THE BORN-STATE ROUND (the populate census rows 1-7) ──────────────────────────────────────────────────
  // The host's one card-read click: its system framing, the identity-sheet clause, the invent-nothing doctrine,
  // and the three user-turn blocks (plus the blank-card stand-in). `extract` kind — they shape what a WRITE
  // surface is told to record, which is the kind's own definition; the round they fire on is what each `fires`
  // gloss front-loads ("Born-state round …"), because the `round` band holds both this round and the turn-loop
  // extraction and a row that only said "Opens the system prompt" would read as either.
  // CLUSTER `round` rather than a seventh TEMPLATE_CLUSTERS member: a new band member is a `tsc` error in the
  // client's `TEMPLATE_CLUSTER_LABEL` until labeled, and these seven ARE round framings — the band's own noun.
  {
    id: "rpg.populate.systemHeader",
    kind: "extract",
    label: "Populate header",
    fires: "Born-state round — opens its system prompt",
    caps: [],
    defaultSlot: "rpg.populate.systemHeader",
    cluster: "round",
  },
  {
    id: "rpg.populate.identity",
    kind: "extract",
    label: "Identity sheet",
    fires: "Born-state round — the sheet plane no turn writes",
    caps: [],
    defaultSlot: "rpg.populate.identity",
    cluster: "round",
  },
  {
    id: "rpg.populate.doctrine",
    kind: "extract",
    label: "Invent nothing",
    fires: "Born-state round — closes its teaching",
    caps: [],
    defaultSlot: "rpg.populate.doctrine",
    cluster: "round",
  },
  {
    id: "rpg.populate.cardBlock",
    kind: "extract",
    label: "Card block",
    fires: "Born-state round — the card itself, always",
    caps: [{ kind: "tokens", tokens: ["{{cardName}}", "{{cardBody}}"] }],
    defaultSlot: "rpg.populate.cardBlock",
    cluster: "round",
  },
  {
    id: "rpg.populate.emptyCard",
    kind: "extract",
    label: "Empty card",
    fires: "Born-state round — a card with no written description",
    caps: [],
    defaultSlot: "rpg.populate.emptyCard",
    cluster: "round",
  },
  {
    id: "rpg.populate.openingBlock",
    kind: "extract",
    label: "Opening block",
    fires: "Born-state round — the room has posted an opening",
    caps: [{ kind: "tokens", tokens: ["{{opening}}"] }],
    defaultSlot: "rpg.populate.openingBlock",
    cluster: "round",
  },
  {
    id: "rpg.populate.targetLine",
    kind: "extract",
    label: "Target line",
    fires: "Born-state round — names the one actor it fills",
    caps: [{ kind: "tokens", tokens: ["{{targetRef}}"] }],
    defaultSlot: "rpg.populate.targetLine",
    cluster: "round",
  },
] as const satisfies readonly TemplateDef[];

/** The ids the registry MUST cover: every guided kind + every ACTION-shaped format string. `wiFormat` is
 *  excluded by the §6.6 scope boundary (it lives in the WI section editor). */
type RegistryTemplateId = GuidedActionKind | Exclude<FormatStringKey, "wiFormat">;
/** tsc-forced exhaustiveness: a new guided kind or format string with no `TEMPLATE_DEFS` row surfaces HERE
 *  as the missing id, not as a silently absent row in the Actions view. */
type UnregisteredTemplateId = Exclude<RegistryTemplateId, (typeof TEMPLATE_DEFS)[number]["id"]>;
const _templateDefsAreExhaustive: [UnregisteredTemplateId] extends [never] ? true : UnregisteredTemplateId = true;
void _templateDefsAreExhaustive;

/** By-id lookup for the surfaces that render ONE template (a drill-in, a per-kind row) rather than walking
 *  the ordered table. TOTAL over `RegistryTemplateId` by construction — the guard above proves every id has
 *  a row, which is why the fold's assertion carries no runtime fallback (there is no missing case to handle).
 *  PARTIAL over `ProseSlotId` by TYPE only: the framing rows cover exactly `PRESET_PROSE_SLOT_IDS`, which is a
 *  runtime narrowing tsc cannot express here, so that half's totality is the contract test's (see
 *  `TemplateDefId`). */
export const TEMPLATE_DEF_BY_ID: Record<RegistryTemplateId, TemplateDef> & Partial<Record<ProseSlotId, TemplateDef>> = ((): Record<
  RegistryTemplateId,
  TemplateDef
> &
  Partial<Record<ProseSlotId, TemplateDef>> => {
  const out: Partial<Record<TemplateDefId, TemplateDef>> = {};
  for (const def of TEMPLATE_DEFS) {
    out[def.id] = def;
  }
  return out as Record<RegistryTemplateId, TemplateDef> & Partial<Record<ProseSlotId, TemplateDef>>;
})();

/** Default `/compact` steering (RP-tuned vs the SDK's generic coding-agent summary). DERIVED from the
 *  PROSE-1 slot (census 49, §4.6 adapted): the override stays `promptConfig.compaction.instructions`; the
 *  slot is what gives the default a version, a staleness signal and registry coverage from ONE place. */
export const DEFAULT_COMPACT_INSTRUCTIONS = PRESET_PROSE_SLOTS[PRESET_COMPACTION_SLOT_ID].text;

/** Managed-compaction trigger threshold (fraction of `contextWindow`). Overridable per preset. */
export const MANAGED_COMPACT_DEFAULT_PCT = 0.85;

/** How many newest canon rows managed compaction keeps VERBATIM on the no-fit-boundary (agent-sdk) path —
 *  the engine floor `params.compaction.verbatimTail` overrides. Homed HERE, beside the knob's own bounds,
 *  because it now has TWO consumers (the engine's coverage point AND the deck's blank-means-default
 *  placeholder, redesign G4) and the schema's doc already claimed it was derived from one const. */
export const MANAGED_VERBATIM_TAIL = 8;

/** The RESOLVED default compaction mode — the ONE home BOTH consumers read: the engine's
 *  `resolveEffectiveCompaction` (unset ⇒ this) AND the preset UI's unset placeholder. `"managed"` per the owner
 *  ruling: compaction is a SAFETY property (no chat may error from context growth), and `auto` (the SDK's native
 *  compaction) cannot be the safe floor while its functioning on non-Anthropic backends is UNVERIFIED (the probe-1
 *  gap) — so an unconfigured chat gets OUR durable managed marker, never nothing. */
export const DEFAULT_COMPACTION_MODE = "managed" as const satisfies CompactionMode;

/** The default inline-reasoning tag pair (`reasoningParse`) — the `<think>` convention. ONE pair, no registry;
 *  shared by the schema defaults + the form mapper so they can't drift. */
export const THINK_PREFIX_DEFAULT = "<think>";
export const THINK_SUFFIX_DEFAULT = "</think>";

const macro = (name: string): string => `{{${name}}}`;

export const DEFAULT_MARKER_TEMPLATES: Record<TemplatedMarker, string> = {
  // THE STARTER FRAMING LIVES HERE, NOT IN A STORED `template` (side-eye F-03, 2026-08-02). It used to be
  // materialized as a VALUE on `DEFAULT_PROMPT_CONFIG`'s main section, so the untouched built-in preset
  // opened with a full-weight body and a `custom` cue — the exact F2/§5.2a defect the redesign exists to
  // kill, on the one preset every user meets first. Moving the bytes to the marker's DEFAULT makes the
  // built-in's section carry `template: undefined`, which the editor ghosts as a placeholder and the
  // `custom` cue derives honestly from. The WIRE is unchanged: the assembler already resolves
  // `section.template ?? DEFAULT_MARKER_TEMPLATES[marker]` (`assembly/assemble.ts`), so the same bytes go
  // out — a marker-less ST import now inherits this framing instead of nothing, which is the same "the
  // built-in default rides" rule every other marker already followed.
  // The ADDRESS clause is not filler (owner-ruled, 2026-08-02). `{{user}}` resolves to a persona NAME, and a
  // default persona's name is a LABEL, not a name its owner picked — so a model reaching for a vocative
  // produced "Goodnight, You." The clause is deliberately CONDITIONAL rather than a name ban: a persona the
  // user actually named ("Sarah") must stay addressable, and only the placeholder case degrades to "you".
  // It lives HERE, on the marker defaults — BOTH of them, verbatim and identically (see
  // {@link NARRATOR_MAIN_PROMPT_TEMPLATE}) — and not in a PROSE-1 slot: the only identity-framing slot
  // (`chat.assembly.anchorIdentity`) fires solely on a persona SWAP, the default persona block ships
  // deliberately unframed, and PROSE-1's own census leaves this template un-slotted (row 52) precisely
  // because the per-section `template` override IS its edit path.
  // THIS entry is the PER-SPEAKER/SOLO text — the mode-aware pick is made where the default RESOLVES
  // (`assembly/assemble.ts` templateFor), never re-derived here; see the narrator sibling below.
  ["main_prompt"]:
    "You are {{char}} in an immersive, ongoing roleplay with {{user}}. Stay in character; write {{char}}'s perspective only. " +
    "Address {{user}} in the second person; use their name only when it is one they have chosen for themselves.",
  ["post_history"]: "",
  ["char_description"]: macro("description"),
  ["char_personality"]: macro("personality"),
  ["scenario"]: macro("scenario"),
  ["dialogue_examples"]: macro("example"),
  ["persona"]: macro("persona"),
  ["compact_summary"]: `Summary of the conversation so far:\n${macro("compact_summary")}`,
  ["memory"]: `Past events:\n${macro("memory")}`,
  ["guided_instruction"]: macro("guided_instruction"),
};

/** The NARRATOR-turn `main_prompt` default — the sibling of `DEFAULT_MARKER_TEMPLATES.main_prompt`, not a
 *  replacement for it. A narrator round is ONE generation voicing the WHOLE cast, so the shipped
 *  per-speaker framing (`You are {{char}} … write {{char}}'s perspective only`) arrives at the model as a
 *  self-contradiction: the 2026-08-07 live drive read "write Charlotte, JFC's perspective only" on a turn
 *  that had to produce both. `{{char}}` binds to the JOINED cast on that arm (`assembly/macros`
 *  charForSpeaker), which is exactly what `voicing {{char}}` wants and what `{{char}}'s perspective only`
 *  cannot survive.
 *
 *  WHICH text a turn gets is decided ONCE, where the default resolves (`assembly/assemble.ts` templateFor,
 *  keyed on `speaker.kind === "cast"` — the same axis `memberHeadingSlot` already selects the co-speaker
 *  card frame on). There is deliberately NO second resolution home and NO mode-keyed record here: this file
 *  owns the BYTES, the assembler owns the pick.
 *
 *  The ADDRESS clause is byte-identical to the per-speaker default's, on purpose (owner ruling 2026-08-02 —
 *  see the comment above): the vocative defect is a property of `{{user}}`, not of the turn's mode.
 *
 *  A host's per-section `template` override is ONE stored text and REPLACES both arms (row 52: the override
 *  IS the edit path; there is no per-mode override slot). */
export const NARRATOR_MAIN_PROMPT_TEMPLATE =
  "You are the narrator of an immersive, ongoing roleplay with {{user}}, voicing {{char}} and the world around them. " +
  "Give each speaking character a distinct, consistent voice. " +
  "Address {{user}} in the second person; use their name only when it is one they have chosen for themselves.";

// ChoiceBlock — preset-author-declared named variables (POV/tense/style); the macro engine exposes
// them as `{{getvar::<name>}}` / `{{<name>}}`.
const choiceBlockOptionSchema = z.object({
  label: z.string().min(MIN_ID_LENGTH).max(MAX_CHOICE_LABEL_LENGTH),
  value: z.string().max(MAX_CHOICE_VALUE_LENGTH),
});
export const choiceBlockSchema = z.object({
  name: z.string().min(MIN_ID_LENGTH).max(MAX_NAME_LENGTH),
  question: z.string().min(MIN_QUESTION_LENGTH).max(MAX_QUESTION_LENGTH),
  options: z.array(choiceBlockOptionSchema).min(MIN_CHOICE_OPTIONS).max(MAX_CHOICE_OPTIONS),
  defaultValue: z.string().max(MAX_CHOICE_VALUE_LENGTH).optional(),
  multiSelect: z.boolean().default(false),
  separator: z.string().max(MAX_SEPARATOR_LENGTH).default(", "),
  randomPick: z.boolean().default(false),
});
export type ChoiceBlockSpec = z.infer<typeof choiceBlockSchema>;

/** The per-chat ChoiceBlock PICKS bag (`chats.variableValues`, written by `setVariables`): variable name →
 *  the picked option value. The `userMacroValuesSchema` sibling — FLAT because a ChoiceBlock pick is one
 *  string (a `multiSelect` pick is its chosen values `separator`-joined, the exact shape
 *  `resolveChoiceVariables` splits again at turn time). An absent key OR an empty string is UNSET (the
 *  resolver treats both alike): the turn falls back to the declared `defaultValue`, else the first option. */
export const choiceBlockValuesSchema = z.record(z.string().max(MAX_NAME_LENGTH), z.string().max(MAX_CHOICE_VALUE_LENGTH));
export type ChoiceBlockValues = z.infer<typeof choiceBlockValuesSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// User macros (WAVE MU — parity-plus §12A.5 M5 + the #24 typed-input fold). The DEFINITION home is
// preset/game CONFIG (owner ruling #20 — never a global runtime): `promptConfig.userMacros` here and
// `rpg_games.config.userMacros` (contracts/rpg/config.ts imports THIS schema — one shape, two homes).
// The vocabulary (kinds/arg-types/name shape) derives from `@orb/kit/macro` — the engine half
// (`registerUserMacros`/`resolveUserMacroInputs`, kit/macro/user-macros.ts) consumes exactly these
// shapes, pinned by the contract test's assignability guard. A name colliding with a builtin is refused
// at REGISTRATION (never silently shadowed) — the schema pins only the parseable-name shape.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const MAX_USER_MACROS = 100;
const MAX_USER_MACRO_ARGS = 16;
const MAX_USER_MACRO_INPUTS = 16;

/** One declared positional arg — kit's `MacroArgDef` authored (checkMacroArgs enforces it at render). */
const userMacroArgSchema = z.object({
  name: z.string().regex(MACRO_NAME_RE).max(MAX_NAME_LENGTH),
  type: z.enum(MACRO_ARG_TYPES).default("string"),
  optional: z.boolean().default(false),
  default: z.string().max(MAX_CHOICE_VALUE_LENGTH).optional(),
  description: z.string().max(MAX_QUESTION_LENGTH).optional(),
});

const userMacroInputOptionSchema = z.object({
  label: z.string().min(MIN_ID_LENGTH).max(MAX_CHOICE_LABEL_LENGTH),
  value: z.string().max(MAX_CHOICE_VALUE_LENGTH),
});

/** One typed input (#24): a FLAT shape (kind + per-kind knobs, the ChoiceBlock editor idiom) — the
 *  semantics table lives on kit's `UserMacroInputDef` (resolveUserMacroInputs is the ONE resolution
 *  home). Every knob is defaulted so a stored def predating a knob self-heals at the parse seam. */
const userMacroInputSchema = z.object({
  kind: z.enum(USER_MACRO_INPUT_KINDS),
  name: z.string().regex(MACRO_NAME_RE).max(MAX_NAME_LENGTH),
  label: z.string().max(MAX_QUESTION_LENGTH).default(""),
  options: z.array(userMacroInputOptionSchema).max(MAX_CHOICE_OPTIONS).default([]),
  separator: z.string().max(MAX_SEPARATOR_LENGTH).default(", "),
  onValue: z.string().max(MAX_CHOICE_VALUE_LENGTH).default("true"),
  offValue: z.string().max(MAX_CHOICE_VALUE_LENGTH).default(""),
  defaultValue: z.string().max(MAX_CHOICE_VALUE_LENGTH).default(""),
});

/** One user macro definition. `args` must declare optionals as a CONTIGUOUS SUFFIX (the arity model
 *  counts on it — the same shape rule the builtin metadata test pins). */
export const userMacroSchema = z
  .object({
    name: z.string().regex(MACRO_NAME_RE).max(MAX_NAME_LENGTH),
    description: z.string().max(MAX_QUESTION_LENGTH).default(""),
    args: z.array(userMacroArgSchema).max(MAX_USER_MACRO_ARGS).default([]),
    body: z.string().max(MAX_TEXT_LENGTH),
    inputs: z.array(userMacroInputSchema).max(MAX_USER_MACRO_INPUTS).default([]),
    strict: z.boolean().default(false),
  })
  .superRefine((def, ctx) => {
    const firstOptional = def.args.findIndex((a) => a.optional);
    if (firstOptional !== -1 && def.args.slice(firstOptional).some((a) => !a.optional)) {
      ctx.addIssue({ code: "custom", message: "optional args must form a contiguous suffix after the required ones", path: ["args"] });
    }
  });
export type UserMacroSpec = z.infer<typeof userMacroSchema>;

// Drift guard: the authored schema must produce EXACTLY kit's UserMacroDef — the engine half consumes it
// unmapped. A schema field diverging from the kit shape is a compile error here, not a runtime surprise.
const _userMacroIsKitDef = (spec: UserMacroSpec): UserMacroDef => spec;
void _userMacroIsKitDef;

/** The per-turn per-user input VALUES bag (#24): macro name → input name → pick. This is the WIRE shape
 *  the FOREIGN-inputs threading (`ResolveForeignInputsOp`, the post-P2 stint) carries UNRESHAPED into
 *  kit's `resolveUserMacroInputs` — string (single-select) · boolean (boolean-toggle) · string[]
 *  (multi-select picks / the random-pick POOL). */
export const userMacroInputValueSchema = z.union([
  z.string().max(MAX_CHOICE_VALUE_LENGTH),
  z.boolean(),
  z.array(z.string().max(MAX_CHOICE_VALUE_LENGTH)).max(MAX_CHOICE_OPTIONS),
]);
export const userMacroValuesSchema = z.record(z.string().max(MAX_NAME_LENGTH), z.record(z.string().max(MAX_NAME_LENGTH), userMacroInputValueSchema));
export type UserMacroValues = z.infer<typeof userMacroValuesSchema>;

// The values-bag wire type must stay assignable to kit's per-macro bag (the threading passes it through).
const _valueIsKitValue = (value: z.infer<typeof userMacroInputValueSchema>): UserMacroInputValue => value;
void _valueIsKitValue;

/** Current blob shape. Bump + add a lift below when the shape changes (NO DB migration needed). */
export const PROMPT_CONFIG_SCHEMA_VERSION = 6;
const SCHEMA_VERSION_V1 = 1; // walk floor — a versionless/garbage blob probes as v1
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;
const SCHEMA_VERSION_V4 = 4;
const SCHEMA_VERSION_V5 = 5;
const SCHEMA_VERSION_V6 = 6;

/** The per-preset format-string overrides. Every key is optional and blank-means-default. NO carrier refine
 *  here on purpose — this schema is also the READ path (`parsePromptConfig` degrades a failed parse to
 *  DEFAULT_PROMPT_CONFIG), so refusing on read would nuke an entire stored preset over one bad wrapper. The
 *  guard rides `promptConfigWriteSchema` below. */
export const formatStringsSchema = z.object({
  continueNudge: z.string().max(MAX_INJECTION_TEMPLATE_LENGTH).optional(),
  impersonateNudge: z.string().max(MAX_INJECTION_TEMPLATE_LENGTH).optional(),
  responseNudge: z.string().max(MAX_INJECTION_TEMPLATE_LENGTH).optional(),
  wiFormat: z.string().max(MAX_INJECTION_TEMPLATE_LENGTH).optional(),
  newChatMarker: z.string().max(MAX_INJECTION_TEMPLATE_LENGTH).optional(),
});

export const promptConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(PROMPT_CONFIG_SCHEMA_VERSION),
  sections: z.array(promptSectionSchema).max(MAX_SECTIONS),
  // `.catch({})` bounds a malformed params blob to JUST this field — `userIntentSchema` is strict,
  // so without this a single unknown nested key would degrade the WHOLE preset to DEFAULT_PROMPT_CONFIG.
  params: userIntentSchema.catch({}).default({}),
  // NO `regexScripts` (D121-E): a preset's regex set is a REFERENCE list in `preset_regex_scripts`, not an
  // embedded copy. `promptConfigSchema` is a plain (non-strict) object, so a stored pre-D121-E blob simply
  // strips the retired key at the parse seam — no lift, no schema bump; the owner re-attaches by hand
  // (BACKREST-MANUAL, the ruled NO-LEGACY carryover posture).
  variables: z.array(choiceBlockSchema).max(MAX_VARIABLES).default([]),
  // WAVE MU (§12A.5 M5): preset-authored user macros — additive defaulted (a pre-MU blob parses; no
  // version bump needed, the `variables`/`guidedActions` precedent).
  userMacros: z.array(userMacroSchema).max(MAX_USER_MACROS).default([]),
  customParameters: customParametersSchema.optional(),
  namesBehavior: z.enum(NAMES_BEHAVIOR).optional(),
  continuePostfix: z.enum(CONTINUE_POSTFIX_TYPES).optional(),
  formatStrings: formatStringsSchema.optional(),
  guidedActions: guidedActionsSchema.optional(),
  // The per-PRESET PROSE-1 overrides (owner ruling 2026-08-07: templates have ONE home and it is presets).
  // Keyed by slot id, holding the SAME `{text, baseVersion}` record every other home stores — which is why
  // `resolveProse` needs no per-home arm. Additive + `.prefault({})`, so a pre-ruling blob parses unchanged
  // and resolves every slot to its shipped default (the `variables`/`userMacros` precedent — no version bump).
  // NOT a second door for the guided/format slots: those stay in their own fields (§4.6) and
  // `PRESET_PROSE_SLOT_IDS` excludes them.
  prose: proseOverridesSchema,
  postProcess: z
    .object({
      collapseNewlines: z.boolean().default(false),
      trimTrailingWhitespace: z.boolean().default(false),
      dropIncompleteSentence: z.boolean().default(false),
      singleLine: z.boolean().default(false),
    })
    .optional(),
  // Inline `<think>` reasoning-tag fallback: native reasoning is always preferred; this only fires when
  // the reply has no native reasoning AND `autoParse` is on. Defaults OFF (opt-in per preset).
  reasoningParse: z
    .object({
      autoParse: z.boolean().default(false),
      prefix: z.string().default(THINK_PREFIX_DEFAULT),
      suffix: z.string().default(THINK_SUFFIX_DEFAULT),
    })
    .optional(),
});
export type PromptConfig = z.infer<typeof promptConfigSchema>;

// ── THE PIPELINE ORDER (the ONE declaration of what runs when) ─────────────────────────────────────
// The order the prompt-side and reply-side transforms execute in is a FACT OF THE ENGINE, and it used to
// live in two places that could not check each other: the executors (`domain/chat/engine/pipeline.ts`'s
// `applyReceiveTransforms` + `@orb/server/kit/post-process`) and a hand-numbered list of rows in the
// preset editor's Transforms readout. The list drifted, as a hand-numbered list of someone else's order
// always does, and the readout printed FOUR untruths at once: `REASONING` before the post-process block
// (the engine runs it after), the three receive switches in exactly reverse execution order, and
// `collapseNewlines` on the reply lane at all — it is an ASSEMBLE transform (`applyAssemblePostProcess`,
// on the rendered system halves) that the reply path never calls.
//
// So the order is DECLARED ONCE, here, and CONSUMED: `applyReceivePostProcess`/`applyAssemblePostProcess`
// iterate the two flag tuples below (they no longer carry their own if-chains), and the readout renders
// its rows off the lanes (it no longer carries slot numbers at all). It lives in `contracts` because it
// is the one shape both the server executor and the client readout must agree on, and the cake gives them
// no lower shared home that can see `postProcess`'s keys.
//
// WHAT IS DELIBERATELY NOT A STEP: the per-speaker reply clean (`cleanPerSpeakerContent`, which runs
// between the post-process block and the `REASONING` pass). It is driven by the TURN's shape, not by a
// preset switch, so a row for it in a preset editor would name a control that does not exist there. Its
// absence does not make the printed order wrong — every step that IS printed keeps its true position.

/** One post-process switch, by the side of the pipeline it runs on. */
export type PostProcessFlag = keyof NonNullable<PromptConfig["postProcess"]>;

/** WHICH LANE EACH SWITCH RUNS ON — a TOTAL map over the schema's own keys, so a new switch cannot enter
 *  `postProcess` without answering the question `collapseNewlines` was silently answered wrong on (it sat
 *  in the reply readout while the reply path never calls it), and a renamed one fails `tsc` here. */
export const POST_PROCESS_LANE = {
  singleLine: "receive",
  dropIncompleteSentence: "receive",
  trimTrailingWhitespace: "receive",
  collapseNewlines: "assemble",
} as const satisfies Readonly<Record<PostProcessFlag, "assemble" | "receive">>;

type FlagsOnLane<L extends "assemble" | "receive"> = { [K in PostProcessFlag]: (typeof POST_PROCESS_LANE)[K] extends L ? K : never }[PostProcessFlag];
export type ReceivePostProcessFlag = FlagsOnLane<"receive">;
export type AssemblePostProcessFlag = FlagsOnLane<"assemble">;

/** The RECEIVE switches in the order `applyReceivePostProcess` applies them — single-line FIRST (the most
 *  aggressive cut), so the later sentence/whitespace trims operate on the already-reduced line. That the
 *  tuple is COMPLETE (a receive-lane flag left out here would simply never run) is pinned at runtime by
 *  `tests/contracts/preset/index.contract.test.ts` against the schema's own key set. */
export const RECEIVE_POST_PROCESS_ORDER = [
  "singleLine",
  "dropIncompleteSentence",
  "trimTrailingWhitespace",
] as const satisfies readonly ReceivePostProcessFlag[];

/** The ASSEMBLE switches, same contract on the prompt side (`applyAssemblePostProcess`). The split is the
 *  point: a flag in this tuple runs on a rendered system half and NEVER on a reply. */
export const ASSEMBLE_POST_PROCESS_ORDER = ["collapseNewlines"] as const satisfies readonly AssemblePostProcessFlag[];

/** ONE step of a lane. `native-reasoning` and `reasoning-parse` are the reply's two reasoning-source arms
 *  (native is always preferred; the inline `<think>` parse only fires when the reply carried no native
 *  channel AND `autoParse` is on) — the parse is a real executor step and the native arm is the gate on it. */
export type PromptPipelineStep =
  | { readonly kind: "native-reasoning" }
  | { readonly kind: "reasoning-parse" }
  | { readonly kind: "regex"; readonly placement: RegexPlacement }
  | { readonly kind: "post-process"; readonly flag: PostProcessFlag };

/** A step's STABLE identity — the key a total label map is keyed by and the token an order pin compares.
 *  Never a rendered string (the copy is the client's), and never an index (the index IS the drift). */
export function pipelineStepKey(step: PromptPipelineStep): string {
  if (step.kind === "regex") {
    return `regex:${step.placement}`;
  }
  if (step.kind === "post-process") {
    return `post-process:${step.flag}`;
  }
  return step.kind;
}

/** THE PROMPT-SIDE LANE. `USER_INPUT` rewrites the draft before it is persisted, `WORLD_INFO` rewrites each
 *  entry as it is rendered, the ASSEMBLE collapse runs on the joined system halves at the end of BUILD, and
 *  only then does `PROMPT_HISTORY` rewrite the assembled transcript on its way to the wire — the one
 *  prompt-side stage whose output never becomes canon. */
export const PROMPT_LANE_STEPS: readonly PromptPipelineStep[] = [
  { kind: "regex", placement: "USER_INPUT" },
  { kind: "regex", placement: "WORLD_INFO" },
  ...ASSEMBLE_POST_PROCESS_ORDER.map((flag): PromptPipelineStep => ({ kind: "post-process", flag })),
  { kind: "regex", placement: "PROMPT_HISTORY" },
];

/** THE REPLY-SIDE LANE, in the order `applyReceiveTransforms` runs it: the inline-reasoning demux, the
 *  `AI_OUTPUT` pass over the content, the post-process block, then the `REASONING` pass over the demuxed
 *  channel — and last, client-side, the `DISPLAY` pass, which changes what you read and never touches the
 *  wire. Pinned against the live engine by `tests/server/domain/chat/engine/pipeline.test.ts`. */
export const REPLY_LANE_STEPS: readonly PromptPipelineStep[] = [
  { kind: "native-reasoning" },
  { kind: "reasoning-parse" },
  { kind: "regex", placement: "AI_OUTPUT" },
  ...RECEIVE_POST_PROCESS_ORDER.map((flag): PromptPipelineStep => ({ kind: "post-process", flag })),
  { kind: "regex", placement: "REASONING" },
  { kind: "regex", placement: "DISPLAY" },
];

/** One PROSE slot whose pre-substitution token IS its payload slot — the `FormatCarrierToken` sibling for the
 *  frames that store in `promptConfig.prose` instead of `formatStrings`. */
export interface ProseCarrierToken {
  readonly slotId: ProseSlotId;
  /** The token NAME, brace-less — the key `spliceProseTokens` splices by, and what `hasProseToken` recognises. */
  readonly name: string;
  /** The BRACED spelling — what the refusal message says and what the editor's chip shows. It is also the exact
   *  string the slot's own `requiredMacros` carries; the preset contract test pins the pair. */
  readonly token: string;
}

/** PROSE CARRIER slots — the write guard's SECOND enumeration (owner ruling 2026-08-08, option C of
 *  `docs/design/note-token-intent-history.md`). The two injection note frames carry `{{note}}`, which is the
 *  injection's ENTIRE payload: `spliceProseTokens` is a replace, so an override that drops the token matches
 *  nothing and the frame ships as an empty wrapper (`[Note from user: ]`) with the author's note gone. That is
 *  byte-for-byte the `{{entry}}` failure the 2026-08-02 carrier ruling refuses, so these refuse with it.
 *
 *  WHY A SECOND LIST rather than a row in `FORMAT_STRING_CARRIER_TOKENS`: that enum keys off `FormatStringKey`
 *  and its loop reads `config.formatStrings`. These frames are `kind:"format"` rows in the same Templates tab,
 *  but their STORAGE is `promptConfig.prose[<slot id>].text` — a different field with a different key type, so
 *  the enum structurally cannot absorb them. The enforcement split used to track exactly that plumbing
 *  difference; it no longer does.
 *
 *  WHAT DID NOT CHANGE: PROSE-1's general `requiredMacros` stays a LINT (`contracts/prose-slot` — "a lint in
 *  the editor, never a block"). That posture is ruled and correct for VOICE macros, whose absence weakens
 *  prose. This list is not a widening of it — it names the two slots whose token absence DELETES content, which
 *  is the carrier-bucket's own membership test.
 *
 *  A new prose carrier = one row here; the refine below reads nothing else. */
const PROSE_CARRIER_TOKENS = [
  { slotId: "chat.injection.systemNote", name: "note", token: "{{note}}" },
  { slotId: "chat.injection.userNote", name: "note", token: "{{note}}" },
] as const satisfies readonly ProseCarrierToken[];

/** THE CARRIER PREDICATE — every stored note-frame override that is non-blank and DROPPED its token, i.e.
 *  exactly the set {@link promptConfigWriteSchema} refuses.
 *
 *  EXPORTED because the refusal needs a SECOND consumer, not a second spelling: the preset editor's form
 *  validator holds the autosave on this (`validatePresetProse`), so a host who deletes `{{note}}` sees the save
 *  withheld with the reason in the field — instead of the autosave firing and bouncing off the server, which is
 *  the exact fail-shape the over-cap prose regime already fixed on this surface. The server guard stays the
 *  FLOOR regardless: an import, a foreign API write and a preset file never pass through an editor. */
export function proseCarrierMisses(prose: ProseOverrides): readonly ProseCarrierToken[] {
  return PROSE_CARRIER_TOKENS.filter((carrier) => {
    const text = prose[carrier.slotId]?.text;
    // `hasProseToken`, never a hand-rolled `includes`: the splice recognises `{{ note }}` and `{{NOTE}}` too,
    // and a refusal stricter than the renderer would bounce text that works.
    return text !== undefined && text.trim().length > 0 && !hasProseToken(text, carrier.name);
  });
}

/** THE WRITE BOUNDARY (the `injectionDirectiveSchema` → wire-guard layering precedent, `@orb/kit/injection`):
 *  `promptConfigSchema` plus the guards that may REFUSE an author's edit. The transport create/update procs
 *  parse through THIS; every read path (`parsePromptConfig`, `parsePresetFile`, the assembler) keeps the
 *  plain schema, so a preset already carrying a broken wrapper still LOADS (and the editor can show it) —
 *  a refusal on read would degrade the whole preset to default over one field.
 *
 *  ONE guard, TWO enumerations — the carrier-token refusal over `FORMAT_STRING_CARRIER_TOKENS` (the
 *  `formatStrings` field) and over `PROSE_CARRIER_TOKENS` (the `prose` blob). Blank/absent is legal on both:
 *  blank means "the shipped default rides", the storage semantic everywhere in this schema. */
export const promptConfigWriteSchema = promptConfigSchema.superRefine((config, ctx): void => {
  const formatStrings = config.formatStrings;
  if (formatStrings !== undefined) {
    for (const { key, token } of FORMAT_STRING_CARRIER_TOKENS) {
      const text = formatStrings[key];
      if (text !== undefined && text.trim().length > 0 && !text.includes(token)) {
        ctx.addIssue({
          code: "custom",
          path: ["formatStrings", key],
          message: `${key} must contain ${token} — that is where the wrapped content lands, so without it the content is dropped. Leave it blank to use the default.`,
        });
      }
    }
  }
  for (const { slotId, token } of proseCarrierMisses(config.prose)) {
    ctx.addIssue({
      code: "custom",
      path: ["prose", slotId, "text"],
      message: `${slotId} must contain ${token} — that is where the injection's own content lands, so without it the note ships as an empty frame. Leave it blank to use the default.`,
    });
  }
});

// ── The lift chain (maps a blob at version N → N+1; the versioned-config primitive walks it) ───────
type RawSection = Record<string, unknown>;
const isMarker = (s: RawSection, m: string): boolean => s["type"] === "marker" && s["marker"] === m;

/** v1→v2 per-section transform. Returns `null` to DROP the section: `jailbreak` content folds into
 *  `post_history`'s template; the literal `'main'` becomes a `main_prompt` marker. */
function liftSectionV1(s: RawSection, jailbreakContent: string | undefined): RawSection | null {
  if (isMarker(s, "char_system")) {
    return null;
  }
  if (isMarker(s, "jailbreak")) {
    return null;
  }
  if (s["type"] === "literal" && s["id"] === "main") {
    return {
      type: "marker",
      id: "main",
      name: typeof s["name"] === "string" ? s["name"] : "Main",
      marker: "main_prompt",
      role: s["role"] ?? "system",
      enabled: s["enabled"] ?? true,
      template: typeof s["content"] === "string" ? s["content"] : "",
    };
  }
  if (isMarker(s, "post_history")) {
    const existing = typeof s["template"] === "string" ? s["template"] : "";
    return { ...s, template: jailbreakContent ?? existing };
  }
  return s;
}

/** Insert a `chat_history` pivot immediately before `post_history` when one exists and no pivot is
 *  present yet. Mutates `lifted`. */
function insertChatHistoryPivot(lifted: RawSection[]): void {
  const hasPivot = lifted.some((s): boolean => isMarker(s, "chat_history"));
  const phIdx = lifted.findIndex((s): boolean => isMarker(s, "post_history"));
  if (!hasPivot && phIdx >= 0) {
    lifted.splice(phIdx, 0, {
      type: "marker",
      id: "chat-history",
      name: "Chat history",
      marker: "chat_history",
      role: "system",
      enabled: true,
    });
  }
}

export const CONFIG_LIFTS: Record<number, (config: Record<string, unknown>) => Record<string, unknown>> = {
  1: (c): Record<string, unknown> => {
    const sections = Array.isArray(c["sections"]) ? (c["sections"] as RawSection[]) : [];
    const jailbreak = sections.find((s): boolean => isMarker(s, "jailbreak"));
    const jailbreakTemplate = jailbreak?.["template"];
    const jailbreakContent = typeof jailbreakTemplate === "string" ? jailbreakTemplate : undefined;

    const lifted: RawSection[] = [];
    for (const s of sections) {
      const next = liftSectionV1(s, jailbreakContent);
      if (next !== null) {
        lifted.push(next);
      }
    }
    insertChatHistoryPivot(lifted);

    return { ...c, schemaVersion: SCHEMA_VERSION_V2, sections: lifted };
  },
  // v2 → v3: purely additive (trigger, inject.order optional/defaulted). Stamp the version only.
  2: (c): Record<string, unknown> => ({ ...c, schemaVersion: SCHEMA_VERSION_V3 }),
  // v3 → v4: `compaction.mode:"off"` is retired (compaction is a SAFETY property — a chat may never error from
  // context growth). A stored "off" lifts to "managed" (our durable marker); all other fields untouched.
  3: (c): Record<string, unknown> => ({ ...c, schemaVersion: SCHEMA_VERSION_V4, params: liftCompactionOff(c["params"]) }),
  // v4 → v5 (redesign G8): the Default/Custom/SILENT tri-state is retired. Silent's stored form was
  // `template: ""` ("render nothing") — which is the ENABLE mechanism wearing a second face. A stored
  // empty template becomes `{ template: undefined, enabled: false }`: the marker is off, and clearing the
  // field in the editor now means "the built-in default rides" for every section alike.
  4: (c): Record<string, unknown> => ({ ...c, schemaVersion: SCHEMA_VERSION_V5, sections: liftSilentTemplates(c["sections"]) }),
  // v5 → v6: `params.maxBudgetUsd` is DELETED (owner ruling 2026-08-02, resolving the redesign's D6 fork:
  // the knob had no editor on any surface, so no user could ever set, see, or clear it). A LIFT and not a
  // silent drop, because `userIntentSchema` is strict and `promptConfigSchema` `.catch({})`s the whole
  // params blob on a parse failure: without this, one stored budget key would take EVERY other knob on that
  // preset down with it. Strip the key, keep the rest.
  5: (c): Record<string, unknown> => ({ ...c, schemaVersion: SCHEMA_VERSION_V6, params: liftDropMaxBudgetUsd(c["params"]) }),
};

/** v5→v6: drop the retired `maxBudgetUsd` knob. Non-object params / a blob that never carried it pass
 *  through UNTOUCHED (by reference where nothing changes — the same shape every lift above uses). */
function liftDropMaxBudgetUsd(params: unknown): unknown {
  if (params === null || typeof params !== "object" || !("maxBudgetUsd" in params)) {
    return params;
  }
  const { maxBudgetUsd: _retired, ...rest } = params as Record<string, unknown>;
  return rest;
}

/** v4→v5: `template: ""` ⇒ drop the template AND disable the section. Non-array sections / non-object
 *  entries / a non-empty template pass through untouched (by reference where nothing changes). */
function liftSilentTemplates(sections: unknown): unknown {
  if (!Array.isArray(sections)) {
    return sections;
  }
  return sections.map((entry: unknown): unknown => {
    if (entry === null || typeof entry !== "object") {
      return entry;
    }
    const section = entry as RawSection;
    if (section["template"] !== "") {
      return entry;
    }
    const { template: _silent, ...rest } = section;
    return { ...rest, enabled: false };
  });
}

/** v3→v4: map a stored `params.compaction.mode:"off"` → `"managed"`. Non-object params / absent compaction / a
 *  non-"off" mode pass through untouched (return by reference where nothing changes). */
function liftCompactionOff(params: unknown): unknown {
  if (params === null || typeof params !== "object") {
    return params;
  }
  const p = params as Record<string, unknown>;
  const compaction = p["compaction"];
  if (compaction === null || typeof compaction !== "object" || (compaction as Record<string, unknown>)["mode"] !== "off") {
    return params;
  }
  return { ...p, compaction: { ...(compaction as Record<string, unknown>), mode: "managed" } };
}

/** Walk a raw config blob forward through {@link CONFIG_LIFTS} — mirrors `defineVersionedConfig`'s
 *  internal lift loop for the STRICT file path (validates and REJECTS after lifting, no degrade). */
function liftConfigForward(config: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let out = config;
  let version = fromVersion;
  for (let lift = CONFIG_LIFTS[version]; lift !== undefined; lift = CONFIG_LIFTS[version]) {
    out = lift(out);
    version += 1;
  }
  return out;
}

/** The version a versioned blob probes as: its positive-integer `schemaVersion`, else v1 (the floor). */
function probeSchemaVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= SCHEMA_VERSION_V1 ? value : SCHEMA_VERSION_V1;
}

/** The starter arrangement (used when a chat pins no preset). */
export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
  sections: [
    {
      type: "marker",
      id: "main",
      name: "Main",
      marker: "main_prompt",
      role: "system",
      enabled: true,
      // NO `template` (side-eye F-03): the starter framing is `DEFAULT_MARKER_TEMPLATES.main_prompt`, so
      // the built-in ships this section UNSET like every other marker — the editor ghosts the default and
      // the `custom` cue stays honest. Same bytes on the wire (the assembler's `?? DEFAULT_MARKER_TEMPLATES`).
    },
    {
      type: "marker",
      id: "wi-before",
      name: "World info (before)",
      marker: "world_info_before",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "char-desc",
      name: "Description",
      marker: "char_description",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "char-pers",
      name: "Personality",
      marker: "char_personality",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "scenario",
      name: "Scenario",
      marker: "scenario",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "persona",
      name: "User persona",
      marker: "persona",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "wi-after",
      name: "World info (after)",
      marker: "world_info_after",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "examples",
      name: "Dialogue examples",
      marker: "dialogue_examples",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "memory",
      name: "Memory",
      marker: "memory",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "guided-instruction",
      name: "Guided instruction",
      marker: "guided_instruction",
      role: "system",
      enabled: true,
    },
    // THE PIVOT — sections before build the system block; sections after land after the conversation.
    {
      type: "marker",
      id: "chat-history",
      name: "Chat history",
      marker: "chat_history",
      role: "system",
      enabled: true,
    },
    // Post-history ("jailbreak") — after the pivot; a card's `post_history_instructions` overrides in place.
    {
      type: "marker",
      id: "post-history",
      name: "Post-history",
      marker: "post_history",
      role: "system",
      enabled: true,
    },
  ],
  params: {},
  variables: [],
  userMacros: [],
  formatStrings: { ...DEFAULT_FORMAT_STRINGS },
  guidedActions: DEFAULT_GUIDED_ACTIONS,
  // EMPTY, not the shipped framing bytes: an override record IS the "the host wrote this" signal, so seeding
  // it would make every new preset read Customized and would freeze today's wording into stored data that a
  // revised default could never reach (§4.4). Absent ⇒ the slot's own text, byte-identical.
  prose: {},
};

export const promptConfigConfig = defineVersionedConfig({
  schema: promptConfigSchema,
  version: PROMPT_CONFIG_SCHEMA_VERSION,
  lifts: CONFIG_LIFTS,
  default: DEFAULT_PROMPT_CONFIG,
});

/** Parse a stored config blob, lifting older shapes forward. LENIENT: a malformed blob degrades to
 *  DEFAULT_PROMPT_CONFIG rather than throwing mid-load (vs `parsePresetFile`'s STRICT validation).
 *
 *  D121-E asymmetry, deliberate — do NOT "fix" it: the retired `regexScripts` field needs NO lift here
 *  because `promptConfigSchema` is a plain (non-strict) `z.object`, so a stored pre-D121-E key is simply
 *  stripped at this seam. `UserSettings` DID take a version bump + a lift-to-drop for the same deletion,
 *  because its `USER_SETTINGS_SECTIONS` tuple is the section-PATCH door: an unlisted stored key there
 *  survives in the blob as an unaddressable orphan. Non-strict parse ⇒ strip; addressable door ⇒ lift. */
export function parsePromptConfig(raw: unknown): PromptConfig {
  return promptConfigConfig.parse(raw);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Serde — the ST Chat-Completion preset importer + the neo native preset-file codec.
// `parsePresetFile` is STRICT (a broken file errors loudly); `parsePromptConfig` is LENIENT (a
// malformed stored blob degrades to default). This distinction is load-bearing — preserved here.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// ── ST Chat-Completion preset → PromptConfig (one-way importer) ───────────────────────────────────
const ST_INJECTION_ABSOLUTE = 1;
const ST_DEFAULT_DEPTH = 4;
const ST_DEFAULT_ORDER = 100;
const ST_NAMES_NONE = -1;
const ST_NAMES_DEFAULT = 0;
const ST_NAMES_COMPLETION = 1;
const ST_NAMES_CONTENT = 2;
// ST's own default is 0 = "off" (`top_a_openai: 0`, SillyTavern/public/scripts/openai.js:418) — the same
// sentinel discipline as `min_p`. It read `1` here while the field was being DROPPED, so nothing depended
// on it; carrying the knob (G1) makes the sentinel load-bearing, and 1 would have inverted it (dropping a
// deliberate 1 and importing an "off" 0 as an explicit knob).
const ST_TOP_A_DEFAULT = 0;
const ST_MIN_P_DEFAULT = 0;
const ST_DISABLED_NUMERIC = 0; // ST top_k 0 / seed -1 / max 0 = disabled/unset

/** ST canonical prompt identifier → MarkerType. Identifiers not here are custom prompts (→ literals). */
const ST_IDENTIFIER_TO_MARKER: Record<string, MarkerType> = {
  main: "main_prompt",
  jailbreak: "post_history",
  charDescription: "char_description",
  charPersonality: "char_personality",
  scenario: "scenario",
  dialogueExamples: "dialogue_examples",
  personaDescription: "persona",
  chatHistory: "chat_history",
  worldInfoBefore: "world_info_before",
  worldInfoAfter: "world_info_after",
};

const PLAIN_MARKER_SET: ReadonlySet<string> = new Set(PLAIN_MARKERS);
const OVERRIDABLE_MARKERS: ReadonlySet<MarkerType> = new Set<MarkerType>(["main_prompt", "post_history"]);

// ST character_names_behavior enum → NamesBehavior.
const ST_NAMES_BEHAVIOR: Record<number, NamesBehavior> = {
  [ST_NAMES_NONE]: "none",
  [ST_NAMES_DEFAULT]: "default",
  [ST_NAMES_COMPLETION]: "completion",
  [ST_NAMES_CONTENT]: "content",
};

// ST wire field names are snake_case — they must match the foreign JSON verbatim.
// biome-ignore-start lint/style/useNamingConvention: SillyTavern wire field names (snake_case)
const stPromptSchema = z
  .object({
    identifier: z.string(),
    name: z.string().optional(),
    role: z.string().optional(),
    content: z.string().optional(),
    system_prompt: z.boolean().optional(),
    marker: z.boolean().optional(),
    injection_position: z.number().optional(),
    injection_depth: z.number().optional(),
    injection_order: z.number().optional(),
    injection_trigger: z.array(z.string()).optional(),
    forbid_overrides: z.boolean().optional(),
  })
  .loose();

const stOrderEntrySchema = z.object({
  identifier: z.string(),
  enabled: z.boolean().optional(),
});

const stPresetSchema = z
  .object({
    prompts: z.array(stPromptSchema).optional(),
    prompt_order: z.array(z.object({ character_id: z.number(), order: z.array(stOrderEntrySchema) })).optional(),
  })
  .loose();
// biome-ignore-end lint/style/useNamingConvention: SillyTavern wire field names (snake_case)

export interface StDroppedField {
  field: string;
  reason: string;
}

export interface StImportResult {
  config: PromptConfig;
  dropped: StDroppedField[];
  /** How many sections the import produced (markers + literals). */
  sectionCount: number;
}

type StPrompt = z.infer<typeof stPromptSchema>;
type StOrderGroup = NonNullable<z.infer<typeof stPresetSchema>["prompt_order"]>[number];

function roleOf(prompt: StPrompt): MessageRole {
  return prompt.role === "user" || prompt.role === "assistant" ? prompt.role : "system";
}

/** A non-empty trimmed name, else the fallback id. */
function resolveSectionName(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : fallback;
}

/** ST injection_trigger → GenerationType[] (the enums coincide). Unknown values are dropped. */
function triggerOf(prompt: StPrompt): GenerationType[] | undefined {
  const t = prompt.injection_trigger;
  if (t === undefined || t.length === 0) {
    return;
  }
  const valid = t.filter((v): v is GenerationType => (GENERATION_TYPES as readonly string[]).includes(v));
  return valid.length > 0 ? valid : undefined;
}

/** Absolute-depth injection (ST injection_position === ABSOLUTE) → `inject`. */
function injectOf(prompt: StPrompt): SectionInject | undefined {
  if (prompt.injection_position !== ST_INJECTION_ABSOLUTE) {
    return;
  }
  const depth = Number.isFinite(prompt.injection_depth) ? (prompt.injection_depth as number) : ST_DEFAULT_DEPTH;
  const order = prompt.injection_order;
  return order !== undefined && order !== ST_DEFAULT_ORDER ? { depth, order } : { depth };
}

/** The optional `inject`/`trigger` fields, present only when set (shared by both section branches). */
function injectTriggerFields(inject: SectionInject | undefined, trigger: GenerationType[] | undefined): { inject?: SectionInject; trigger?: GenerationType[] } {
  return {
    ...(inject !== undefined ? { inject } : {}),
    ...(trigger !== undefined ? { trigger } : {}),
  };
}

/** The override-block fields a templated marker carries when it's one of the two overridable slots. */
function overrideFields(prompt: StPrompt, marker: MarkerType): { template?: string; forbidCharacterOverride?: boolean } {
  if (!OVERRIDABLE_MARKERS.has(marker)) {
    return {};
  }
  const content = prompt.content ?? "";
  return {
    ...(content.length > 0 ? { template: content } : {}),
    ...(prompt.forbid_overrides === true ? { forbidCharacterOverride: true } : {}),
  };
}

/** Build ONE section from an ST prompt + its prompt_order enabled flag. */
function sectionFromPrompt(prompt: StPrompt, enabled: boolean): PromptSection {
  const id = prompt.identifier;
  const name = resolveSectionName(prompt.name, id);
  const marker = ST_IDENTIFIER_TO_MARKER[id];
  const inject = injectOf(prompt);
  const trigger = triggerOf(prompt);
  const role = roleOf(prompt);

  if (marker !== undefined) {
    if (PLAIN_MARKER_SET.has(marker)) {
      return { type: "marker", id, name, marker, role, enabled };
    }
    return {
      type: "marker",
      id,
      name,
      marker,
      role,
      enabled,
      ...overrideFields(prompt, marker),
      ...injectTriggerFields(inject, trigger),
    };
  }

  // Custom prompt → a literal section carrying its content verbatim.
  return {
    type: "literal",
    id,
    name,
    role,
    content: prompt.content ?? "",
    enabled,
    ...injectTriggerFields(inject, trigger),
  };
}

/** Pick the authored prompt_order: ST ships a short default alongside the real arrangement — take the
 *  LONGEST (the one the author actually built). */
function pickOrder(orders: StOrderGroup[]): StOrderGroup["order"] {
  if (orders.length === 0) {
    return [];
  }
  return orders.reduce((best, o): StOrderGroup => (o.order.length > best.order.length ? o : best)).order;
}

const readNum = (raw: Record<string, unknown>, k: string): number | undefined => {
  const v = raw[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};
const setNum = (out: Record<string, unknown>, k: string, v: number | undefined): void => {
  if (v !== undefined) {
    out[k] = v;
  }
};
const setNumAbove = (out: Record<string, unknown>, k: string, v: number | undefined, floor: number): void => {
  if (v !== undefined && v > floor) {
    out[k] = v;
  }
};

/** Map ST sampling/behavior scalars onto UserIntent. Every scalar ST carries now HAS a home (G1 closed the
 *  last one, `top_a`); the remaining drops are TOP-LEVEL fields, reported by `DROPPABLE_FIELDS`. */
function mapParams(raw: Record<string, unknown>): UserIntent {
  const out: Record<string, unknown> = {};
  setNum(out, "temperature", readNum(raw, "temperature"));
  setNum(out, "topP", readNum(raw, "top_p"));
  setNumAbove(out, "topK", readNum(raw, "top_k"), ST_DISABLED_NUMERIC); // ST 0 = disabled
  setNum(out, "frequencyPenalty", readNum(raw, "frequency_penalty"));
  setNum(out, "presencePenalty", readNum(raw, "presence_penalty"));
  setNum(out, "repetitionPenalty", readNum(raw, "repetition_penalty"));
  // ST's default (0) means "off", so only carry a non-default value.
  const minP = readNum(raw, "min_p");
  if (minP !== undefined && minP !== ST_MIN_P_DEFAULT) {
    out["minP"] = minP;
  }
  setNumAbove(out, "maxOutputTokens", readNum(raw, "openai_max_tokens"), ST_DISABLED_NUMERIC);
  setNumAbove(out, "maxContextTokens", readNum(raw, "openai_max_context"), ST_DISABLED_NUMERIC);

  const seed = readNum(raw, "seed");
  if (seed !== undefined && seed >= ST_DISABLED_NUMERIC) {
    out["seed"] = seed; // ST -1 = random/unset
  }
  const effort = raw["reasoning_effort"];
  if (typeof effort === "string" && (EFFORT_LEVELS as readonly string[]).includes(effort)) {
    out["effort"] = effort;
  }
  const showThoughts = raw["show_thoughts"];
  if (typeof showThoughts === "boolean") {
    out["thinkingDisplay"] = showThoughts ? "summarized" : "omitted";
  }

  // Only carry a `true` (ST's default `false` = "no preference", never pinned).
  if (raw["squash_system_messages"] === true) {
    out["advanced"] = { squashSystemMessages: true };
  }

  // G1 (redesign §10): `top_a` HAS sampling vocab (`userIntentSchema.topA`) and now an editor — the drop
  // was a stale claim contradicting the schema two hundred lines up. Mapped exactly like `min_p`: ST's
  // default (0 = off) is not carried.
  const topA = readNum(raw, "top_a");
  if (topA !== undefined && topA !== ST_TOP_A_DEFAULT) {
    out["topA"] = topA;
  }

  // `.catch({})` keeps a stray field from sinking the whole blob.
  return userIntentSchema.catch({}).parse(out);
}

const ST_CONTINUE_POSTFIX: Record<string, ContinuePostfix> = {
  "": "none",
  " ": "space",
  "\n": "newline",
  "\n\n": "double-newline",
};

// Top-level ST fields with no neo home — reported (when present + meaningful) so the user knows.
const DROPPABLE_FIELDS: readonly StDroppedField[] = [
  { field: "group_nudge_prompt", reason: "group nudge is room-owned, not preset-owned" },
  { field: "new_chat_prompt", reason: "no new-chat injection slot" },
  // Reason CORRECTED 2026-08-08: it read "no group chats", which was already stale post-rooms and became
  // flatly false when the ST profile importer started building group rooms from `groups/`. The DROP stays —
  // like its `new_chat_prompt` sibling, this is a history-START boundary string and orb has no injection slot
  // for one. (The `group_nudge_prompt` row got this same repair earlier; this sibling was missed then.)
  { field: "new_group_chat_prompt", reason: "no new-group-chat injection slot" },
  { field: "new_example_chat_prompt", reason: "no example-chat injection slot" },
  { field: "bias_preset_selected", reason: "no logit-bias presets" },
  { field: "assistant_prefill", reason: "response prefill unsupported across providers" },
  { field: "assistant_impersonation", reason: "no impersonation prefill" },
  { field: "wrap_in_quotes", reason: "no quote-wrapping knob" },
  { field: "function_calling", reason: "no tool-calling in chat presets" },
  { field: "enable_web_search", reason: "no web-search knob" },
];

/** A dropped field is "meaningful" (worth reporting) when it carries a real value. */
function isMeaningful(v: unknown): boolean {
  return (
    (typeof v === "string" && v.trim().length > 0) ||
    (typeof v === "boolean" && v) ||
    (typeof v === "number" && v !== ST_DISABLED_NUMERIC && v !== ST_NAMES_NONE)
  );
}

/** Resolve ST `names_behavior` (numeric enum OR a literal string) → NamesBehavior. */
function namesBehaviorOf(raw: unknown): NamesBehavior | undefined {
  if (typeof raw === "number") {
    return ST_NAMES_BEHAVIOR[raw];
  }
  return typeof raw === "string" && (NAMES_BEHAVIOR as readonly string[]).includes(raw) ? (raw as NamesBehavior) : undefined;
}

/** The authored walk: the prompt_order if present, else the prompts[] declaration order (all enabled). */
function buildWalk(order: StOrderGroup["order"], prompts: StPrompt[]): { identifier: string; enabled: boolean }[] {
  if (order.length > 0) {
    return order.map((e): { identifier: string; enabled: boolean } => ({
      identifier: e.identifier,
      enabled: e.enabled !== false,
    }));
  }
  return prompts.map((p): { identifier: string; enabled: boolean } => ({
    identifier: p.identifier,
    enabled: true,
  }));
}

/** Build the section list from the id→prompt map walked in the authored order. */
function buildSections(byId: Map<string, StPrompt>, walk: { identifier: string; enabled: boolean }[]): PromptSection[] {
  const sections: PromptSection[] = [];
  for (const entry of walk) {
    const prompt = byId.get(entry.identifier);
    if (prompt !== undefined) {
      sections.push(sectionFromPrompt(prompt, entry.enabled));
    }
  }
  return sections;
}

/** The top-level ST fields with no neo home that carry a meaningful value (reported to the user). */
function collectDroppableFields(rawObj: Record<string, unknown>): StDroppedField[] {
  const out: StDroppedField[] = [];
  for (const { field, reason } of DROPPABLE_FIELDS) {
    if (isMeaningful(rawObj[field])) {
      out.push({ field, reason });
    }
  }
  return out;
}

/** Map ST's prompt-string slots onto the preset's `formatStrings`. `impersonation_prompt` →
 *  `impersonateNudge` (previously dropped) and `continue_nudge_prompt` → `continueNudge`; a blank/absent slot
 *  is omitted so the assembler falls back to `DEFAULT_FORMAT_STRINGS`. Bounds each to the schema max so a
 *  hostile import can't smuggle an oversized nudge. */
function collectFormatStrings(rawObj: Record<string, unknown>): PromptConfig["formatStrings"] {
  const out: Record<string, string> = {};
  const take = (key: string, slot: string): void => {
    const v = rawObj[key];
    if (typeof v === "string" && v.trim().length > 0) {
      out[slot] = v.slice(0, MAX_INJECTION_TEMPLATE_LENGTH);
    }
  };
  take("continue_nudge_prompt", "continueNudge");
  take("impersonation_prompt", "impersonateNudge");
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── The ST `power_user` GENERATION-adjacent knobs (owner ruling 2026-08-08) ────────────────────────
// ST scatters what orb calls "generation settings" across TWO sections: the per-family preset (`oai_settings`
// / `OpenAI Settings/*.json`) AND the global `power_user` blob. orb homes generation config on the PRESET, so
// the `power_user` half folds in HERE — the one ST→PromptConfig mapper — rather than growing a second answer
// in the importer. They are GLOBAL in ST, so the caller only supplies them for the LIVE preset (see
// `domain/import/substrate/preset.ts`): stamping one box's live stop-strings onto every SAVED preset file
// would rewrite presets the author tuned for something else.
//
// Six seats, all exact: `custom_stopping_strings` → `params.stop`; the four ST post-processing switches →
// `postProcess` (orb's four flags ARE these four, by meaning); `reasoning.{auto_parse,prefix,suffix}` →
// `reasoningParse` (the `<think>` inline-reasoning fallback — the same three fields, same defaults).

/** ST stores `custom_stopping_strings` as a JSON-array STRING. ST's own reader `JSON.parse`s it and yields
 *  nothing on failure — mirrored exactly here (never a comma-split guess it does not make). */
function stStopStrings(powerUser: Record<string, unknown>): string[] | undefined {
  const raw = powerUser["custom_stopping_strings"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) {
    return;
  }
  const strings = parsed.filter((s): s is string => typeof s === "string" && s.length > 0);
  return strings.length > 0 ? strings : undefined;
}

/** The four ST post-processing switches, only when at least one is ON (an all-false blob would persist an
 *  explicit `postProcess` block that is byte-equivalent to absent). */
function stPostProcess(powerUser: Record<string, unknown>): PromptConfig["postProcess"] {
  const flag = (key: string): boolean => powerUser[key] === true;
  const collapseNewlines = flag("collapse_newlines");
  const dropIncompleteSentence = flag("trim_sentences");
  const trimTrailingWhitespace = flag("trim_spaces");
  const singleLine = flag("single_line");
  if (!(collapseNewlines || dropIncompleteSentence || trimTrailingWhitespace || singleLine)) {
    return;
  }
  return { collapseNewlines, dropIncompleteSentence, trimTrailingWhitespace, singleLine };
}

/** ST `power_user.reasoning` → orb `reasoningParse`. Only when ST had auto-parse ON: the tag pair alone is
 *  inert (orb's parse is gated on `autoParse`), so importing an OFF blob would be noise. */
function stReasoningParse(powerUser: Record<string, unknown>): PromptConfig["reasoningParse"] {
  const reasoning = powerUser["reasoning"];
  if (reasoning === null || typeof reasoning !== "object" || Array.isArray(reasoning)) {
    return;
  }
  const r = reasoning as Record<string, unknown>;
  if (r["auto_parse"] !== true) {
    return;
  }
  const prefix = r["prefix"];
  const suffix = r["suffix"];
  return {
    autoParse: true,
    prefix: typeof prefix === "string" && prefix.length > 0 ? prefix : THINK_PREFIX_DEFAULT,
    suffix: typeof suffix === "string" && suffix.length > 0 ? suffix : THINK_SUFFIX_DEFAULT,
  };
}

// `power_user` keys that are GENERATION-adjacent (so they would belong on a preset) but have no orb seat at
// all. Reported on the LIVE preset's dropped list so the operator sees them exactly where they'd have landed.
const DROPPABLE_POWER_USER_FIELDS: readonly StDroppedField[] = [
  { field: "token_padding", reason: "ST reserves context headroom for its own tokenizer's inaccuracy; orb budgets from provider-reported usage" },
  { field: "tokenizer", reason: "the ST tokenizer set is reaffirmed OUT (D49) — orb counts through the provider" },
  { field: "custom_stopping_strings_macro", reason: "macro substitution INSIDE stop strings — orb's stop list is literal (the strings themselves DO import)" },
  { field: "auto_continue", reason: "ST's auto-continue-until-length loop — no orb counterpart" },
  { field: "context", reason: "text-completion context template — needs an ST→orb template mapper (separate epic)" },
  { field: "instruct", reason: "text-completion instruct template — needs an ST→orb template mapper (separate epic)" },
  { field: "sysprompt", reason: "system-prompt template — needs an ST→orb template mapper (separate epic)" },
];

/** A `power_user` value worth reporting as dropped: a non-empty string, a `true`, a non-zero number, or a
 *  non-empty object (the three template blobs are objects and are ALWAYS present in a real profile, so an
 *  object counts only when it carries keys). */
function isMeaningfulPowerUserValue(value: unknown): boolean {
  if (value !== null && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return isMeaningful(value);
}

/** The whole `power_user` fold, as ONE call: the three config slices plus the seat-less keys to report.
 *  Extracted so `importStChatCompletionPreset` keeps its shape (and clears the cognitive-complexity gate)
 *  as this half grew. A non-object `powerUser` (the saved-preset-file path) folds nothing. */
function stPowerUserGenerationKnobs(powerUser: unknown): {
  readonly stop: string[] | undefined;
  readonly postProcess: PromptConfig["postProcess"];
  readonly reasoningParse: PromptConfig["reasoningParse"];
  readonly dropped: StDroppedField[];
} {
  const pu: Record<string, unknown> =
    powerUser !== null && typeof powerUser === "object" && !Array.isArray(powerUser) ? (powerUser as Record<string, unknown>) : {};
  return {
    stop: stStopStrings(pu),
    postProcess: stPostProcess(pu),
    reasoningParse: stReasoningParse(pu),
    dropped: DROPPABLE_POWER_USER_FIELDS.filter(({ field }) => isMeaningfulPowerUserValue(pu[field])),
  };
}

/** Import a SillyTavern Chat Completion preset (parsed JSON) into a validated PromptConfig. Throws when
 *  `raw` isn't a recognizable ST preset (no prompts AND no prompt_order).
 *
 *  `powerUser` is ST's GLOBAL `settings.json.power_user` blob, supplied ONLY when importing the LIVE
 *  `oai_settings` preset (see the section above): its generation-adjacent knobs fold onto the config, and its
 *  seat-less ones join `dropped`. Omitted for a saved preset FILE, which carries none of them. */
export function importStChatCompletionPreset(raw: unknown, powerUser?: unknown): StImportResult {
  const parsed = stPresetSchema.safeParse(raw);
  if (!(parsed.success && (parsed.data.prompts || parsed.data.prompt_order))) {
    throw new Error("Not a SillyTavern Chat Completion preset (expected prompts[] + prompt_order).");
  }
  const data = parsed.data;
  const rawObj: Record<string, unknown> = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const prompts = data.prompts ?? [];
  const byId = new Map<string, StPrompt>(prompts.map((p): [string, StPrompt] => [p.identifier, p]));
  const walk = buildWalk(pickOrder(data.prompt_order ?? []), prompts);
  const sections = buildSections(byId, walk);

  const dropped: StDroppedField[] = [];
  const params = mapParams(rawObj);
  dropped.push(...collectDroppableFields(rawObj));

  const namesBehavior = namesBehaviorOf(rawObj["names_behavior"]);
  const rawPostfix = rawObj["continue_postfix"];
  const continuePostfix = typeof rawPostfix === "string" ? ST_CONTINUE_POSTFIX[rawPostfix] : undefined;
  const formatStrings = collectFormatStrings(rawObj);

  // The GLOBAL `power_user` half of ST's generation config (live preset only — see the section above).
  const { stop, postProcess, reasoningParse, dropped: powerUserDropped } = stPowerUserGenerationKnobs(powerUser);
  dropped.push(...powerUserDropped);

  // Construct + validate via the canonical (lenient) parser — fills defaults, runs the lift, drops
  // anything malformed to a safe shape so the importer can never emit an invalid PromptConfig.
  const config = parsePromptConfig({
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections,
    params: stop === undefined ? params : { ...params, stop },
    ...(namesBehavior !== undefined ? { namesBehavior } : {}),
    ...(continuePostfix !== undefined ? { continuePostfix } : {}),
    ...(formatStrings !== undefined ? { formatStrings } : {}),
    ...(postProcess === undefined ? {} : { postProcess }),
    ...(reasoningParse === undefined ? {} : { reasoningParse }),
  });

  return { config, dropped, sectionCount: sections.length };
}

// ── orb native preset file (the lossless full-preset export) ───────────────────────────────────────
// `PRESET_SCHEMA_KIND` is the ONE accepted kind — orb-native backup only. There is no legacy-kind accept:
// neo-tavern never launched, so no foreign preset file exists to import.
export const PRESET_SCHEMA_KIND = "orb.preset";

export interface PresetFile {
  schemaKind: typeof PRESET_SCHEMA_KIND;
  /** The PromptConfig schema version at export time — `parsePresetFile` uses it as the lift-walk
   *  start so older files are lifted forward before strict validation (falls back to the config blob's
   *  own `schemaVersion` when absent/garbage). */
  schemaVersion: number;
  name: string;
  config: PromptConfig;
}

/** Build the export payload for a preset (name + its full config). */
export function buildPresetFile(name: string, config: PromptConfig): PresetFile {
  return {
    schemaKind: PRESET_SCHEMA_KIND,
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    name,
    config,
  };
}

export type ParsePresetResult = { ok: true; name: string; config: PromptConfig } | { ok: false; error: string };

/** Parse an `orb.preset` file. Validates the envelope, LIFTS an older config forward through the
 *  `CONFIG_LIFTS` chain (a v1/v2-era orb config imports — the config blob carries its own schemaVersion),
 *  then STRICTLY validates the lifted config via `promptConfigSchema` directly: a structurally-wrong config
 *  is REJECTED (not degraded to DEFAULT) so a broken file errors loudly instead of silently importing as an
 *  empty preset — the deliberate contrast with `parsePromptConfig`'s lenient degrade-to-default. */
export function parsePresetFile(raw: unknown): ParsePresetResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Not a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  if (o["schemaKind"] !== PRESET_SCHEMA_KIND) {
    return { ok: false, error: `Not a ${PRESET_SCHEMA_KIND} file.` };
  }
  const rawConfig = o["config"];
  if (rawConfig === null || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return {
      ok: false,
      error: "The file's \"config\" isn't a valid prompt config: not an object.",
    };
  }
  // The envelope's `schemaVersion` is the export-time version and wins as the lift-walk start; a
  // missing/garbage envelope version falls back to the config blob's own probe (floored at v1).
  const envelopeVersion = o["schemaVersion"];
  const startVersion =
    typeof envelopeVersion === "number" && Number.isInteger(envelopeVersion) && envelopeVersion >= SCHEMA_VERSION_V1
      ? envelopeVersion
      : probeSchemaVersion((rawConfig as Record<string, unknown>)["schemaVersion"]);
  const lifted = liftConfigForward(rawConfig as Record<string, unknown>, startVersion);
  const result = promptConfigSchema.safeParse(lifted);
  if (!result.success) {
    // `z.prettifyError` (not `issues[0].message`): the old hand-flatten printed "Too small: expected string to
    // have >=1 characters" with NO path, so an operator importing a 500-section preset was told a field was bad
    // without being told WHICH. prettify carries `→ at sections[0].id` for every issue (paths are relative to
    // the `config` blob — this parse runs on the lifted blob, not the envelope). The import dialog
    // renders this string in prose flow, so the line breaks collapse into one readable run.
    return {
      ok: false,
      error: `The file's "config" isn't a valid prompt config.\n${z.prettifyError(result.error)}`,
    };
  }
  const rawName = o["name"];
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : "Imported preset";
  return { ok: true, name, config: result.data };
}
