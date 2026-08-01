// @orb/contracts/preset — generation config: the `PromptConfig` blob, its lift chain, user-intent
// generation knobs, guided-actions config, custom parameters, the macro catalog, and ST/neo preset serde.
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
import { z } from "zod";
import type { EffortLevel as ModelEffortLevel } from "#connection";
import { EFFORT_LEVELS as MODEL_EFFORT_LEVELS, roleHandlingSchema, VERBOSITY_LEVELS } from "#connection";
import { regexScriptSchema } from "#regex";
import { defineVersionedConfig } from "#versioned-config";
import { PRESET_PROSE_SLOTS } from "./prose";

export * from "./prose";

const MAX_NAME_LENGTH = 200;
const MIN_ID_LENGTH = 1;
const MAX_TEXT_LENGTH = 100_000; // literal content + marker template (may carry {{macros}})
const MAX_SECTIONS = 500;
const MAX_REGEX_SCRIPTS = 500;
const MAX_VARIABLES = 200;
const MAX_CHOICE_OPTIONS = 200;
const MIN_CHOICE_OPTIONS = 1;
const MAX_CHOICE_LABEL_LENGTH = 500;
const MAX_CHOICE_VALUE_LENGTH = 10_000;
const MIN_QUESTION_LENGTH = 1;
const MAX_QUESTION_LENGTH = 2000;
const MAX_SEPARATOR_LENGTH = 64;
const MAX_FORMAT_STRING_LENGTH = 10_000;
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
// smaller overflows the model (vLLM 400s). Users tune it per preset; the exact number isn't load-bearing.
export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

// ONE place per numeric bound — no split source between server/client (client accepts → server rejects).
export const generationKnobSchemas = {
  thinkingBudgetTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
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

// `.strict()` rejects unknown keys (a typo'd field is a real bug). We use `.strict()` on a plain
// `z.object` rather than `z.strictObject` because in Zod v4 `z.strictObject` inflates the inferred type
// with an index-signature tag that propagates through `.optional()` and trips
// `noPropertyAccessFromIndexSignature` on every consumer.
export const userIntentSchema = z
  .object({
    quality: z.enum(QUALITY_LEVELS).optional(),

    effort: effortLevelSchema.optional(),
    thinkingBudgetTokens: generationKnobSchemas.thinkingBudgetTokens,
    thinkingDisplay: z.enum(THINKING_DISPLAYS).optional(),

    maxOutputTokens: generationKnobSchemas.maxOutputTokens,
    maxBudgetUsd: generationKnobSchemas.maxBudgetUsd,
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
        claudeEnv: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
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
  })
  .strict();
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
  /** The injection template; `{{input}}` = the user's steering text. Missing/empty falls back to `{{input}}` alone. */
  prompt: z.string(),
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
// contracts owns the shape+data both the client chips and the pure composer need). Each toggle = a stable
// `id`, a display `label`, and the instruction `fragment` it contributes. The pure composition lives in
// `@orb/kit/guided` (`composeRewriteSteer`) — selected fragments join `. ` (the source's exact editIntros
// join) in CATALOG ORDER, then the user's free-text instruction is appended, producing the ONE steer
// string that becomes `{{input}}` inside the preset's `rewrite` template. Layering:
//   preset rewrite template  ⊃  (catalog fragments joined) + free-text instruction
// which mirrors the source's editIntros layering (options joined `". "` → filled into the task template).
export interface RewriteToggle {
  readonly id: string;
  readonly label: string;
  /** The instruction sentence this toggle contributes to the composed steer (no trailing period — the
   *  composer joins with `. ` and terminates the whole steer, matching the source's editIntros join). */
  readonly fragment: string;
}

export const REWRITE_TOGGLES = [
  { id: "concise", label: "More concise", fragment: "Make it more concise and tighter — cut filler while keeping the substance" },
  { id: "expand", label: "Expand", fragment: "Expand it with more detail and description, keeping the same events" },
  {
    id: "novella",
    label: "Novella prose",
    fragment: "Rewrite in a novella prose style: full paragraphs and proper dialogue punctuation, no asterisks for narration",
  },
  { id: "internet-rp", label: "Internet-RP style", fragment: "Rewrite in internet-RP style: asterisks for actions and narration, dialogue kept in quotes" },
  { id: "literary", label: "Literary style", fragment: "Rewrite in a richer literary style: vivid metaphor and description while keeping proper formatting" },
  { id: "past-tense", label: "Past tense", fragment: "Rewrite entirely in the past tense" },
  { id: "present-tense", label: "Present tense", fragment: "Rewrite entirely in the present tense" },
] as const satisfies readonly RewriteToggle[];

export type RewriteToggleId = (typeof REWRITE_TOGGLES)[number]["id"];

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Greeting transform catalog — the greeting studio's one-click steer set (audit §3). Adapted (not ported)
// from the ST Guided-Generations editIntros transform catalog (`prompts.json editIntros.options`): the
// 4-axis catalog (perspective / tense / style / gender) that IS the source's "steer an OPENING without
// prose-writing" ergonomic. Unlike REWRITE_TOGGLES (which drops the perspective/gender axes as nonsensical
// for a mid-conversation reply), the greeting studio keeps ALL FOUR — they reframe the user's viewpoint in
// an opening, which is exactly the greeting-authoring surface.
//
// Registry-as-data (the REWRITE_TOGGLES / databank SCRAPER_KINDS precedent — "substrate not a type home":
// contracts owns the shape+data both the client chips and the composed steer need). Each transform = a
// stable `id`, an `axis` (the group it belongs to — the client can render chips grouped), a display
// `label`, and the instruction `fragment` it contributes. The client renders chips BLIND from this data;
// the selected fragments join `. ` in CATALOG ORDER (the source's exact editIntros join, via
// `composeRewriteSteer` in @orb/kit/guided), then the free-text instruction is appended — the ONE steer
// string that becomes `{{input}}` inside the preset's `greeting_rewrite`/`greeting_new` template. Fragments
// carry NO macros (the composed steer is ZWSP-neutralized downstream as `{{input}}`, so a `{{user}}` in a
// fragment would render as literal braces — the REWRITE_TOGGLES posture): "the user" / "the character" are
// spelled in plain words; the template's OWN {{char}}/{{user}} macros resolve the names.
export const GREETING_TRANSFORM_AXES = ["perspective", "tense", "style", "gender"] as const satisfies readonly string[];
export type GreetingTransformAxis = (typeof GREETING_TRANSFORM_AXES)[number];

export interface GreetingTransform {
  readonly id: string;
  readonly axis: GreetingTransformAxis;
  readonly label: string;
  /** The instruction sentence this transform contributes to the composed steer (no trailing period — the
   *  composer joins with `. ` and terminates the whole steer, matching the source's editIntros join). */
  readonly fragment: string;
}

export const GREETING_TRANSFORMS = [
  // ── perspective ──
  {
    id: "first-person-standard",
    axis: "perspective",
    label: "First person (I/me)",
    fragment: "Rewrite the greeting in first person, where the user is the narrator using I/me, keeping the character's references consistent",
  },
  {
    id: "first-person-by-name",
    axis: "perspective",
    label: "First person (by name)",
    fragment:
      "Rewrite the greeting in first person, but refer to the user by their name instead of I/me, as if the narrator refers to themselves in the third person",
  },
  {
    id: "first-person-as-you",
    axis: "perspective",
    label: "First person (as 'you')",
    fragment: "Rewrite the greeting in first person, but refer to the user as 'you', creating a self-addressing perspective",
  },
  {
    id: "second-person",
    axis: "perspective",
    label: "Second person",
    fragment: "Rewrite the greeting in second person, addressing the user directly as 'you' and referring to the character accordingly",
  },
  {
    id: "third-person",
    axis: "perspective",
    label: "Third person",
    fragment:
      "Rewrite the greeting in third person, referring to the user and the character by name and appropriate pronouns, described from an outside observer",
  },
  // ── tense ──
  {
    id: "past-tense",
    axis: "tense",
    label: "Past tense",
    fragment: "Rewrite the greeting entirely in the past tense, as if these events had already occurred",
  },
  {
    id: "present-tense",
    axis: "tense",
    label: "Present tense",
    fragment: "Rewrite the greeting in present tense, making it feel immediate and ongoing",
  },
  // ── style ──
  {
    id: "novella-style",
    axis: "style",
    label: "Novella prose",
    fragment:
      "Change the greeting to a novella prose style: full paragraphs and proper dialogue punctuation, no asterisks for narration, keeping all links and images unchanged — a style change only, do not invent new sentences",
  },
  {
    id: "internet-rp-style",
    axis: "style",
    label: "Internet-RP style",
    fragment: "Change the greeting to internet-RP style: asterisks for actions and narration, dialogue kept in quotes",
  },
  {
    id: "literary-style",
    axis: "style",
    label: "Literary style",
    fragment: "Rewrite the greeting in a richer literary style: vivid metaphor and description while keeping proper formatting",
  },
  {
    id: "script-style",
    axis: "style",
    label: "Script style",
    fragment: "Rewrite the greeting in a script style: minimal narration, character names followed by dialogue lines, brief scene directions in parentheses",
  },
  // ── gender ──
  { id: "he-him", axis: "gender", label: "He/him", fragment: "Change all references to the user to use he/him pronouns" },
  { id: "she-her", axis: "gender", label: "She/her", fragment: "Change all references to the user to use she/her pronouns" },
  { id: "they-them", axis: "gender", label: "They/them", fragment: "Change all references to the user to use they/them pronouns" },
] as const satisfies readonly GreetingTransform[];

export type GreetingTransformId = (typeof GREETING_TRANSFORMS)[number]["id"];

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

// Generation types a section's `trigger` can gate on (ST `injection_trigger`).
export const GENERATION_TYPES = ["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

// Continuation delimiter inserted between existing tip + new chunk on a continue turn.
export const CONTINUE_POSTFIX_TYPES = ["none", "space", "newline", "double-newline"] as const;
export type ContinuePostfix = (typeof CONTINUE_POSTFIX_TYPES)[number];

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
  /** Custom framing template (macros allowed). Omit ⇒ `DEFAULT_MARKER_TEMPLATES[marker]`.
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
 *  DELIBERATELY DISTINCT from PROSE-1's `requiredMacros` (`contracts/prose-slot`: "a lint in the editor —
 *  never a block"). Those are voice guidance whose absence weakens prose (the identity macros in the
 *  impersonate nudge); these are carriers whose absence DELETES content. Same reason the guided templates'
 *  missing-`{{input}}` check stays a display lint (`guidedFooterState`) and is not enumerated here — an
 *  empty steer template legitimately means "the steer lands on its own, unwrapped".
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
// SCOPE (§6.6, deliberate): the ACTIONS-VIEW set only — `guidedActions` ∪ the ACTION-shaped `formatStrings`.
// `wiFormat` is NOT here: it frames world-info ENTRIES and is edited in the WI marker's body editor (§6.5
// census), so a row would mint the second home the census exists to prevent. Marker templates
// (scenario/personality/…) likewise keep their section home.
//
// `label`/`fires` are the ROW's copy (per-kind: `response` and `swipe` are two rows), distinct from the
// PROSE-1 slot's `title`/`fires` (per-SLOT copy — those two kinds SHARE one slot, so slot copy cannot name a
// row). `defaultSlot` is the one pointer between them: the ghost/placeholder bytes always come from PROSE-1.

export const TEMPLATE_KINDS = ["steer", "voice", "studio", "format", "nudge"] as const satisfies readonly string[];
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

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

/** WHICH slot a def edits: a guided-action kind (`guidedActions.<kind>`) or a format-string key
 *  (`formatStrings.<key>`). Both vocabularies are derived, never re-spelled. */
export type TemplateDefId = GuidedActionKind | FormatStringKey;

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
  readonly defaultSlot?: keyof typeof PRESET_PROSE_SLOTS | undefined;
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
 *  a row, which is why the fold's assertion carries no runtime fallback (there is no missing case to handle). */
export const TEMPLATE_DEF_BY_ID: Record<RegistryTemplateId, TemplateDef> = ((): { [K in RegistryTemplateId]: TemplateDef } => {
  const out: Partial<Record<RegistryTemplateId, TemplateDef>> = {};
  for (const def of TEMPLATE_DEFS) {
    out[def.id] = def;
  }
  return out as Record<RegistryTemplateId, TemplateDef>;
})();

/** Default `/compact` steering (RP-tuned vs the SDK's generic coding-agent summary). */
export const DEFAULT_COMPACT_INSTRUCTIONS =
  "Summarize the roleplay so far for continuation: preserve each character's voice and persona, the relationships and their current state, established facts and world details, unresolved threads, and the present scene/location. Be concise but lossless on canon — names, commitments, and specific details must survive.";

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
  ["main_prompt"]: "",
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
export const PROMPT_CONFIG_SCHEMA_VERSION = 5;
const SCHEMA_VERSION_V1 = 1; // walk floor — a versionless/garbage blob probes as v1
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;
const SCHEMA_VERSION_V4 = 4;
const SCHEMA_VERSION_V5 = 5;

/** The per-preset format-string overrides. Every key is optional and blank-means-default. NO carrier refine
 *  here on purpose — this schema is also the READ path (`parsePromptConfig` degrades a failed parse to
 *  DEFAULT_PROMPT_CONFIG), so refusing on read would nuke an entire stored preset over one bad wrapper. The
 *  guard rides `promptConfigWriteSchema` below. */
export const formatStringsSchema = z.object({
  continueNudge: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
  impersonateNudge: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
  responseNudge: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
  wiFormat: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
  newChatMarker: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
});

export const promptConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(PROMPT_CONFIG_SCHEMA_VERSION),
  sections: z.array(promptSectionSchema).max(MAX_SECTIONS),
  // `.catch({})` bounds a malformed params blob to JUST this field — `userIntentSchema` is `.strict()`,
  // so without this a single unknown nested key would degrade the WHOLE preset to DEFAULT_PROMPT_CONFIG.
  params: userIntentSchema.catch({}).default({}),
  regexScripts: z.array(regexScriptSchema).max(MAX_REGEX_SCRIPTS).default([]),
  variables: z.array(choiceBlockSchema).max(MAX_VARIABLES).default([]),
  // WAVE MU (§12A.5 M5): preset-authored user macros — additive defaulted (a pre-MU blob parses; no
  // version bump needed, the `variables`/`guidedActions` precedent).
  userMacros: z.array(userMacroSchema).max(MAX_USER_MACROS).default([]),
  customParameters: customParametersSchema.optional(),
  namesBehavior: z.enum(NAMES_BEHAVIOR).optional(),
  continuePostfix: z.enum(CONTINUE_POSTFIX_TYPES).optional(),
  formatStrings: formatStringsSchema.optional(),
  guidedActions: guidedActionsSchema.optional(),
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

/** THE WRITE BOUNDARY (the `injectionDirectiveSchema` → wire-guard layering precedent, `@orb/kit/injection`):
 *  `promptConfigSchema` plus the guards that may REFUSE an author's edit. The transport create/update procs
 *  parse through THIS; every read path (`parsePromptConfig`, `parsePresetFile`, the assembler) keeps the
 *  plain schema, so a preset already carrying a broken wrapper still LOADS (and the editor can show it) —
 *  a refusal on read would degrade the whole preset to default over one field.
 *
 *  Today's one guard: the carrier-token refusal (`FORMAT_STRING_CARRIER_TOKENS`). */
export const promptConfigWriteSchema = promptConfigSchema.superRefine((config, ctx): void => {
  const formatStrings = config.formatStrings;
  if (formatStrings === undefined) {
    return;
  }
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
};

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
      template: "You are {{char}} in an immersive, ongoing roleplay with {{user}}. Stay in character; write {{char}}'s perspective only.",
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
  regexScripts: [],
  variables: [],
  userMacros: [],
  formatStrings: { ...DEFAULT_FORMAT_STRINGS },
  guidedActions: DEFAULT_GUIDED_ACTIONS,
};

export const promptConfigConfig = defineVersionedConfig({
  schema: promptConfigSchema,
  version: PROMPT_CONFIG_SCHEMA_VERSION,
  lifts: CONFIG_LIFTS,
  default: DEFAULT_PROMPT_CONFIG,
});

/** Parse a stored config blob, lifting older shapes forward. LENIENT: a malformed blob degrades to
 *  DEFAULT_PROMPT_CONFIG rather than throwing mid-load (vs `parsePresetFile`'s STRICT validation). */
export function parsePromptConfig(raw: unknown): PromptConfig {
  return promptConfigConfig.parse(raw);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PROMPT_MACROS — the canonical macro catalog (client autocomplete + docs). The macro ENGINE is
// `@orb/kit/macro`; when you add a macro to the assembler, add it HERE too.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export interface PromptMacroDef {
  /** The bare name inside `{{…}}`. May contain `::arg` for parameterized forms (e.g. `getvar::name`). */
  name: string;
  /** One-line description shown in the autocomplete popover. */
  description: string;
  /** Optional concrete example shown under the description. */
  example?: string;
  /** Group used to bucket macros in the autocomplete list. */
  category: "identity" | "character" | "scenario" | "memory" | "variables" | "system";
}

export const PROMPT_MACROS: readonly PromptMacroDef[] = [
  {
    name: "char",
    description: "The active character's display name.",
    example: macro("char"),
    category: "identity",
  },
  {
    name: "user",
    description: "The active persona's display name.",
    example: macro("user"),
    category: "identity",
  },
  {
    name: "persona",
    description: "The active persona's description text.",
    example: macro("persona"),
    category: "identity",
  },
  {
    name: "description",
    description: "The character card's Description field.",
    category: "character",
  },
  {
    name: "personality",
    description: "The character card's Personality field.",
    category: "character",
  },
  {
    name: "scenario",
    description: "The chat scenario (card field or override).",
    category: "scenario",
  },
  {
    name: "example",
    description: "One example dialogue block, rendered inside the dialogue-examples marker.",
    category: "character",
  },
  {
    name: "charsysinfo",
    description: "The character card's own system-prompt override (when present).",
    category: "character",
  },
  {
    name: "charposthistory",
    description: "The character card's post-history instructions (the 'jailbreak' field).",
    category: "character",
  },
  {
    name: "memory",
    description: "Retrieved older-message memory from the chat-memory subsystem (when enabled).",
    category: "memory",
  },
  {
    name: "compact_summary",
    description: "The chat's compaction summary — stands in for compacted-away history.",
    category: "memory",
  },
  {
    name: "guided_instruction",
    description: "One-turn Guided Generation steer; empty when not guiding.",
    category: "memory",
  },
  {
    name: "getvar::name",
    description: "Explicit lookup of a preset variable / ChoiceBlock by name.",
    example: macro("getvar::pov"),
    category: "variables",
  },
  {
    name: "name",
    description: "Shorthand for a preset variable (catch-all direct lookup).",
    example: macro("tense"),
    category: "variables",
  },
  {
    name: "newline",
    description: "Inserts a literal newline (rare; usually just press Enter).",
    category: "system",
  },
] as const;

/** Fast lookup of every catalog macro's bare name. */
export const PROMPT_MACRO_NAMES: readonly string[] = PROMPT_MACROS.map((m): string => m.name);

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
  { field: "new_group_chat_prompt", reason: "no group chats" },
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
      out[slot] = v.slice(0, MAX_FORMAT_STRING_LENGTH);
    }
  };
  take("continue_nudge_prompt", "continueNudge");
  take("impersonation_prompt", "impersonateNudge");
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Import a SillyTavern Chat Completion preset (parsed JSON) into a validated PromptConfig. Throws when
 *  `raw` isn't a recognizable ST preset (no prompts AND no prompt_order). */
export function importStChatCompletionPreset(raw: unknown): StImportResult {
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

  // Construct + validate via the canonical (lenient) parser — fills defaults, runs the lift, drops
  // anything malformed to a safe shape so the importer can never emit an invalid PromptConfig.
  const config = parsePromptConfig({
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections,
    params,
    ...(namesBehavior !== undefined ? { namesBehavior } : {}),
    ...(continuePostfix !== undefined ? { continuePostfix } : {}),
    ...(formatStrings !== undefined ? { formatStrings } : {}),
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
    return {
      ok: false,
      error: `The file's "config" isn't a valid prompt config: ${result.error.issues[0]?.message ?? "schema mismatch"}`,
    };
  }
  const rawName = o["name"];
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName : "Imported preset";
  return { ok: true, name, config: result.data };
}
