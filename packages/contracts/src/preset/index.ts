// @orb/contracts/preset — generation config (the `PromptConfig` blob, its lift chain, the user-intent
// generation knobs, the guided-actions config, the flat preset form + mappers, custom parameters, the
// macro catalog, and the ST/neo preset serde).
//
// preset = GENERATION config, NOT the connection (the `{api, source, model}` selection is
// `contracts/connection`'s axis). A preset is a library of `PromptConfig` blobs — the user's authored,
// reorderable prompt structure + the provider-agnostic `UserIntent` generation snapshot.
//
// Cross-boundary: the tRPC router validates against these schemas AND the client preset editor runs the
// same schemas, so server and client can never disagree about a bound or a shape.
//
// Down-deps (LAWS — down-only):
//   • `#versioned-config` (`defineVersionedConfig`) — the ONE versioned-blob + lift-loop primitive shared
//     by AppSettings / UserSettings / PromptConfig (settings-and-config §0/§6).
//   • `#regex` (`regexScriptSchema`) — `PromptConfig.regexScripts` is `RegexScript[]` (per-preset scripts).
//   • `@orb/kit/message-role` (`MESSAGE_ROLES`) — the canonical `system|user|assistant` role axis (D32).
//     EVERY role field here is `z.enum(MESSAGE_ROLES)` — the neo role-array clones (`PROMPT_ROLES`,
//     `GUIDED_INJECTION_ROLES`, `PRESET_GUIDED_INJECTION_ROLES`) collapse into it (no-inline-union-redecl).
//   • `@orb/kit/injection` (`MAX_INJECTION_DEPTH`) — a section's absolute-depth placement and an at-depth
//     injection share ONE depth ceiling (no drift).
//
// What does NOT live here (ported elsewhere): `resolveGuidedInstruction` + `neutralizeMacros` →
// `@orb/kit/guided`; the macro engine → `@orb/kit/macro`; `deepMergeRequestBody` (the Layer-2
// prototype-pollution defense) → `@orb/server/kit/custom-parameters`; `applyReceivePostProcess` etc. →
// `@orb/server/kit/post-process`; the 8 assemble types → `@orb/contracts/chat`.

import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { z } from "zod";
import { regexScriptSchema } from "#regex";
import { defineVersionedConfig } from "#versioned-config";

// ── Shared field caps (named so the literals aren't bare magic numbers) ───────────────────────────
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
// ST `injection_order` priority within a single depth — symmetric large bound (descending priority).
const INJECT_ORDER_MIN = -1_000_000;
const INJECT_ORDER_MAX = 1_000_000;

/** Assign `value` to `target[key]` only when it is not `undefined` — the one-liner the flat-form mappers
 *  lean on so a long run of "copy this field when present" stays branch-free at the call site (keeps
 *  cognitive complexity down). The conditional lives here, once. */
function assignIfDefined<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined,
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UserIntent — the preset-facing, cross-runner, model-agnostic generation snapshot (PromptConfig.params)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Three tiers: the ergonomic `quality` dial (95% of presets), explicit power-user knobs, and an
// `advanced` env/request-body escape hatch (reserved-keys floor enforced at the runner seam).

export const QUALITY_LEVELS = ["fast", "balanced", "deep"] as const;
export type Quality = (typeof QUALITY_LEVELS)[number];

// Effort — the UNION of every effort value any supported runner accepts. DISTINCT from
// `contracts/connection.EffortLevel` (the model-capability descriptor, which excludes `none`): this is
// the user-INTENT effort vocabulary, where `none` = thinking-disabled.
export const EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const effortLevelSchema = z.enum(EFFORT_LEVELS);

export const THINKING_DISPLAYS = ["summarized", "omitted"] as const;
export type ThinkingDisplay = (typeof THINKING_DISPLAYS)[number];

export const COMPACTION_MODES = ["auto", "managed", "off"] as const;
export type CompactionMode = (typeof COMPACTION_MODES)[number];

// Sampling/penalty bounds (named per noMagicNumbers — the shared numeric source).
const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const TOP_P_MIN = 0;
const TOP_P_MAX = 1;
const PENALTY_MIN = -2;
const PENALTY_MAX = 2;
const REPETITION_PENALTY_MIN = 0;
const REPETITION_PENALTY_MAX = 2;
const COMPACTION_THRESHOLD_MIN = 0.5;
const COMPACTION_THRESHOLD_MAX = 0.99;

// Per-knob bound schemas — ONE place per numeric bound, spread into BOTH `userIntentSchema` and
// `presetFormValuesSchema`. Pre-lift these bounds were re-typed in two files; loosening one for a new
// vendor silently left the other rejecting the value (client accepts → server rejects). MUST stay
// co-located with `userIntentSchema` (the one bounds source — no split). Every chain is `.optional()`.
export const generationKnobSchemas = {
  thinkingBudgetTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  maxContextTokens: z.number().int().positive().optional(),
  temperature: z.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX).optional(),
  topP: z.number().min(TOP_P_MIN).max(TOP_P_MAX).optional(),
  topK: z.number().int().nonnegative().optional(),
  frequencyPenalty: z.number().min(PENALTY_MIN).max(PENALTY_MAX).optional(),
  presencePenalty: z.number().min(PENALTY_MIN).max(PENALTY_MAX).optional(),
  repetitionPenalty: z.number().min(REPETITION_PENALTY_MIN).max(REPETITION_PENALTY_MAX).optional(),
  seed: z.number().int().optional(),
  compactionThresholdPct: z
    .number()
    .min(COMPACTION_THRESHOLD_MIN)
    .max(COMPACTION_THRESHOLD_MAX)
    .optional(),
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
    frequencyPenalty: generationKnobSchemas.frequencyPenalty,
    presencePenalty: generationKnobSchemas.presencePenalty,
    repetitionPenalty: generationKnobSchemas.repetitionPenalty,
    seed: generationKnobSchemas.seed,
    logitBias: z.record(z.string(), z.number()).optional(),
    stop: z.array(z.string()).optional(),

    compaction: z
      .object({
        mode: z.enum(COMPACTION_MODES).optional(),
        thresholdPct: generationKnobSchemas.compactionThresholdPct,
        instructions: z.string().optional(),
      })
      .optional(),

    // Escape hatch — reserved-keys floor enforced at the env-builder / runner-translate seam
    // (auth / firewall / runner-owned fields can never be overridden).
    advanced: z
      .object({
        claudeEnv: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
        openrouterCustomParameters: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .strict();
export type UserIntent = z.infer<typeof userIntentSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Guided actions — the config half (the resolver + ZWSP neutralization live in `@orb/kit/guided`).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The §7.5 `guidedAction` axis (23 touch / 14 redecls / 4 untyped Records in neo). The canonical KIND
// union is `GuidedActionKind` (NOT neo's `GuidedAction`); the domain's dispatch is
// `GUIDED_ACTION_IMPLS: { [K in GuidedActionKind]: Impl<K> }` (a missing arm is a tsc error there).

export const GUIDED_ACTION_KINDS = [
  "response",
  "swipe",
  "impersonate",
  "rewrite",
  "opening",
  "continue",
] as const satisfies readonly string[];
export type GuidedActionKind = (typeof GUIDED_ACTION_KINDS)[number];
export const guidedActionKindSchema = z.enum(GUIDED_ACTION_KINDS);

// The default `opening` template mirrors the retired `newChat` sentinel so an unsteered opening reads
// the same; a trailing {{input}} folds in the composer steer. Const so the schema default +
// DEFAULT_GUIDED_ACTIONS can't drift.
const OPENING_DEFAULT_PROMPT =
  "[Open the scene: write your first message to me, in character — set the scene and greet me as {{char}} would. Stay fully in character. {{input}}]";
const CONTINUE_DEFAULT_PROMPT =
  "[Take the following into special consideration while continuing your previous message: {{input}}]";
const RESPONSE_DEFAULT_PROMPT =
  "[Take the following into special consideration for your next message: {{input}}]";
const IMPERSONATE_DEFAULT_PROMPT =
  "[Forget all other previous instructions. For this turn only, write in the {{person}}-person perspective AS {{user}} (not {{char}}). Limit yourself strictly to {{user}}'s voice and actions; do NOT narrate {{char}}'s reaction or the surrounding scene. Guidance: {{input}}]";
const REWRITE_DEFAULT_PROMPT =
  "[OOC: Answer me out of character. Don't continue the RP. Instead, rewrite {{char}}'s last response to reflect the following: {{input}}. Don't make any other changes besides this.]";

const GUIDED_DEFAULT_ROLE: MessageRole = "system";

export const guidedActionConfigSchema = z.object({
  /** The injection template. {{input}} = the user's steering text; standard {{char}}/{{user}}/{{persona}}
   *  macros also resolve. A missing/empty template falls back to {{input}} alone (resolver floor). */
  prompt: z.string(),
  /** Which conversation role this guided action's resolved text is delivered with (D32 — `MessageRole`,
   *  NOT a re-spelled inline union). `system` renders the {{guided_instruction}} marker in the cacheable
   *  system prompt; `user`/`assistant` push it as an in-chat depth-0 injection (the splice enforces the
   *  no-prefill / depth-0 wire constraints — not here). */
  role: z.enum(MESSAGE_ROLES).default(GUIDED_DEFAULT_ROLE),
});
export type GuidedActionConfig = z.infer<typeof guidedActionConfigSchema>;

export const guidedActionsSchema = z.object({
  response: guidedActionConfigSchema,
  swipe: guidedActionConfigSchema,
  impersonate: guidedActionConfigSchema,
  rewrite: guidedActionConfigSchema,
  // Defaulted (not required) so a stored blob predating `opening`/`continue` still parses + GAINS the
  // default rather than failing the schema and wiping the user's other overrides.
  opening: guidedActionConfigSchema.default({
    prompt: OPENING_DEFAULT_PROMPT,
    role: GUIDED_DEFAULT_ROLE,
  }),
  continue: guidedActionConfigSchema.default({
    prompt: CONTINUE_DEFAULT_PROMPT,
    role: GUIDED_DEFAULT_ROLE,
  }),
});
export type GuidedActionsConfig = z.infer<typeof guidedActionsSchema>;

export const DEFAULT_GUIDED_ACTIONS: GuidedActionsConfig = {
  response: { prompt: RESPONSE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  swipe: { prompt: RESPONSE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  impersonate: { prompt: IMPERSONATE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  rewrite: { prompt: REWRITE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  opening: { prompt: OPENING_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
  continue: { prompt: CONTINUE_DEFAULT_PROMPT, role: GUIDED_DEFAULT_ROLE },
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Custom parameters — the Layer-1 boundary guard (schema). The Layer-2 runtime defense
// (`deepMergeRequestBody`, "the ACTUAL defense") lives in `@orb/server/kit/custom-parameters`.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Prototype-pollution defense Layer 1: Zod v4 strips `__proto__` implicitly; our `superRefine` REJECTS
// `constructor`/`prototype` (which Zod does NOT strip) at EVERY nested level. Unbranded because
// symbol-keyed brands don't survive JSON/superjson serialization (the brand was a server-only hint,
// not the real safety contract — Layer 2's runtime check is).

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** A record intended to overlay onto a request body. Recommended habit: parse via
 *  `customParametersSchema.parse()` to strip/reject forbidden keys upfront — but the actual defense is
 *  the merge-time runtime check (`deepMergeRequestBody`, server/kit). */
export type CustomParameters = Record<string, unknown>;

/** Reject every prototype-pollution key present on `obj`, at the level it appears. Shared by the
 *  top-level schema and the recursive object arm (one rule, both sites). */
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

// Recursive lenient JSON validator: string/number/boolean/null/array/plain-object — the shape any wire
// request body has. The key check rejects FORBIDDEN_KEYS at every level.
const jsonValueSchema: z.ZodType<unknown> = z.lazy(
  (): z.ZodType<unknown> =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(jsonValueSchema),
      z.record(z.string(), jsonValueSchema).superRefine(rejectForbiddenKeys),
    ]),
);

/** Parse + validate a customParameters input. Rejects any forbidden key or non-JSON-shaped value. */
export const customParametersSchema: z.ZodType<CustomParameters> = z
  .record(z.string(), jsonValueSchema)
  .superRefine(rejectForbiddenKeys);

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PromptConfig — the `presets.config` blob: an ordered (= array index) list of sections + generation
// knobs + regex/variables/customParameters + the names/postfix/format/guided/postProcess knobs.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Marker = a SLOT filled from chat data at assembly time (vs a literal text block). The two
 *  character-overridable preset slots (`main_prompt`, `post_history`) follow SillyTavern's model: the
 *  card field REPLACES the slot content in place ({{original}} recovers the preset text). `chat_history`
 *  is the PIVOT — sections before build the system block, sections after land after the conversation. */
// Templated markers carry an editable `template`; plain markers (content owned by the assembler) do not.
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

// PLAIN markers — `chat_history` is the conversation pivot; the two `world_info_*` anchors render the
// always-scope WI bucket (split by entry metadata.position) at the marker's section position.
export const PLAIN_MARKERS = [
  "chat_history",
  "world_info_before",
  "world_info_after",
] as const satisfies readonly string[];

export const MARKER_TYPES = [...TEMPLATED_MARKERS, ...PLAIN_MARKERS] as const;
export type MarkerType = (typeof MARKER_TYPES)[number];

// Speaker-name handling on outgoing message arrays (#1.5 / `names_behavior`). `none` never includes
// names; `default` = ST persona-switch prefixing; `content` always prefixes `${name}: `; `completion`
// populates the OpenAI-spec `name` field.
export const NAMES_BEHAVIOR = ["none", "default", "content", "completion"] as const;
export type NamesBehavior = (typeof NAMES_BEHAVIOR)[number];

// Generation types a section's `trigger` can gate on (ST `injection_trigger`). A section with a
// non-empty `trigger` is included only when the current turn's type is in the list.
export const GENERATION_TYPES = [
  "normal",
  "continue",
  "impersonate",
  "swipe",
  "regenerate",
  "quiet",
] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

// Continuation delimiter inserted between existing tip + new chunk on a continue turn. ONE tuple shared
// by `promptConfigSchema.continuePostfix` AND `presetFormValuesSchema.continuePostfix` (was two
// inline declarations in neo — no-inline-union-redecl).
export const CONTINUE_POSTFIX_TYPES = ["none", "space", "newline", "double-newline"] as const;
export type ContinuePostfix = (typeof CONTINUE_POSTFIX_TYPES)[number];

/** A section's conditional gate (ST `injection_trigger`). Empty/absent ⇒ always fires. */
const triggerSchema = z.array(z.enum(GENERATION_TYPES)).max(GENERATION_TYPES.length);

/** Absolute-depth placement (ST `injection_position: ABSOLUTE`). Depth 0 = the tail; N = N turns back.
 *  The depth ceiling is the shared `@orb/kit/injection.MAX_INJECTION_DEPTH` (the storage cap == the
 *  injection cap — one source of truth). `order` = ST `injection_order` priority within a depth. */
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
  /** Custom framing template (macros allowed). Omit ⇒ `DEFAULT_MARKER_TEMPLATES[marker]`. Empty string
   *  = "render nothing". For the two character-overridable markers this IS the editable preset content
   *  the card field overrides in place. */
  template: z.string().max(MAX_TEXT_LENGTH).optional(),
  inject: injectSchema.optional(),
  trigger: triggerSchema.optional(),
  /** Block the character-card override for `main_prompt`/`post_history` (ST `forbid_overrides`). */
  forbidCharacterOverride: z.boolean().optional(),
  /** Block the host ROOM override for `main_prompt`/`post_history`. Independent of the card override. */
  forbidRoomOverride: z.boolean().optional(),
});

// Regular union (not discriminatedUnion): both marker branches share `type: "marker"` and differ only
// on `marker`, so a single-key discriminator would collide.
export const promptSectionSchema = z.union([
  literalSection,
  plainMarkerSection,
  templatedMarkerSection,
]);
export type PromptSection = z.infer<typeof promptSectionSchema>;

/** Hard-coded defaults the assembler uses when a preset doesn't supply a `formatStrings.<key>`. */
export const DEFAULT_FORMAT_STRINGS = {
  continueNudge:
    "[OOC: Continue your previous response exactly where it left off. Pick up mid-sentence if needed. Do NOT restate the existing text, do NOT rephrase, do NOT add a preamble or recap. Output ONLY the continuation, starting from where your previous reply ended.]",
  wiFormat: "{{entry}}",
} as const;

/** Default `/compact` steering (RP-tuned vs the SDK's generic coding-agent summary). */
export const DEFAULT_COMPACT_INSTRUCTIONS =
  "Summarize the roleplay so far for continuation: preserve each character's voice and persona, the relationships and their current state, established facts and world details, unresolved threads, and the present scene/location. Be concise but lossless on canon — names, commitments, and specific details must survive.";

/** Managed-compaction trigger threshold (fraction of `contextWindow`). Overridable per preset. */
export const MANAGED_COMPACT_DEFAULT_PCT = 0.85;

// `macro(name)` builds a `{{name}}` placeholder — used so the default templates aren't bare string
// literals (which `noSecrets` flags as high-entropy for the longer field names).
const macro = (name: string): string => `{{${name}}}`;

/** The factory framing for each templated marker (pure macro pass-through + the shipped neutral RP
 *  default). Bracketed string-literal keys match the snake_case `MarkerType` members verbatim. */
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

// ChoiceBlock — preset-author-declared named variables (POV/tense/style) the user picks per chat; the
// macro engine exposes them as `{{getvar::<name>}}` / `{{<name>}}`.
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

/** Current blob shape. Bump + add a lift below when the shape changes (NO DB migration needed). */
export const PROMPT_CONFIG_SCHEMA_VERSION = 3;
// Version constants for the lift chain (named so the walk's literals aren't bare numbers).
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;

export const promptConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(PROMPT_CONFIG_SCHEMA_VERSION),
  sections: z.array(promptSectionSchema).max(MAX_SECTIONS),
  // `.catch({})` bounds a malformed params blob to JUST this field (matches the user-settings self-heal
  // pattern). Without it, `userIntentSchema` is `.strict()`, so a single unknown nested key fails the
  // OUTER parse and silently degrades the WHOLE preset to DEFAULT_PROMPT_CONFIG — losing the user's
  // sections, regex, variables. LOAD-BEARING; do not remove for "cleanliness".
  params: userIntentSchema.catch({}).default({}),
  regexScripts: z.array(regexScriptSchema).max(MAX_REGEX_SCRIPTS).default([]),
  variables: z.array(choiceBlockSchema).max(MAX_VARIABLES).default([]),
  customParameters: customParametersSchema.optional(),
  namesBehavior: z.enum(NAMES_BEHAVIOR).optional(),
  continuePostfix: z.enum(CONTINUE_POSTFIX_TYPES).optional(),
  formatStrings: z
    .object({
      continueNudge: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
      wiFormat: z.string().max(MAX_FORMAT_STRING_LENGTH).optional(),
    })
    .optional(),
  guidedActions: guidedActionsSchema.optional(),
  postProcess: z
    .object({
      collapseNewlines: z.boolean().default(false),
      trimTrailingWhitespace: z.boolean().default(false),
      dropIncompleteSentence: z.boolean().default(false),
      singleLine: z.boolean().default(false),
    })
    .optional(),
});
export type PromptConfig = z.infer<typeof promptConfigSchema>;

// ── The lift chain (maps a blob at version N → N+1; the versioned-config primitive walks it) ───────
type RawSection = Record<string, unknown>;
const isMarker = (s: RawSection, m: string): boolean => s["type"] === "marker" && s["marker"] === m;

/** v1→v2 per-section transform. Returns `null` to DROP the section. (a) `jailbreak` content folds into
 *  `post_history`'s template; the bare `jailbreak`/`char_system` markers are dropped. (b) the literal
 *  `'main'` becomes a `main_prompt` marker carrying its content as the editable template. */
function liftSectionV1(s: RawSection, jailbreakContent: string | undefined): RawSection | null {
  if (isMarker(s, "char_system")) {
    return null; // folded into main_prompt's in-place override
  }
  if (isMarker(s, "jailbreak")) {
    return null; // merged into post_history below
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

/** (c) Insert a `chat_history` pivot immediately before `post_history` ONLY when one exists and no pivot
 *  is present — a config with no post-history needs no boundary (adding one would route all history out
 *  of the prompt). An existing pivot keeps the author's placement. Mutates `lifted`. */
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

/** Exported so the lift WALK is pinnable (the contract test exercises the three v1→v2 transforms). */
export const CONFIG_LIFTS: Record<
  number,
  (config: Record<string, unknown>) => Record<string, unknown>
> = {
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
  // v2 → v3: purely ADDITIVE (`trigger`, `inject.order` are optional/defaulted). Stamp the version only.
  2: (c): Record<string, unknown> => ({ ...c, schemaVersion: SCHEMA_VERSION_V3 }),
};

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
      template:
        "You are {{char}} in an immersive, ongoing roleplay with {{user}}. Stay in character; write {{char}}'s perspective only.",
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
 *  DEFAULT_PROMPT_CONFIG rather than throwing mid-load (vs `parseNeoPresetFile`'s STRICT validation). */
export function parsePromptConfig(raw: unknown): PromptConfig {
  return promptConfigConfig.parse(raw);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PresetFormValues — the FLAT client-side form shape + the wire ↔ flat-form mappers.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// TanStack Form's bound shadcn fields consume flat keys cleanly. The form provider owns the
// bidirectional mapping with the nested PromptConfig via `toPresetFormValues`/`toPromptConfig`.

/** The flat form shape. Every key is optional — drafts overlay server values; absent = "use server
 *  default". The numeric-knob bounds come from `generationKnobSchemas` (one source — no client/server
 *  drift). Guided-action roles are `MessageRole` (D32). */
export interface PresetFormValues {
  quality?: Quality;

  effort?: EffortLevel;
  thinkingBudgetTokens?: number;
  thinkingDisplay?: ThinkingDisplay;

  maxOutputTokens?: number;
  maxBudgetUsd?: number;
  maxContextTokens?: number;

  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  seed?: number;

  compactionMode?: CompactionMode;
  compactionThresholdPct?: number;
  compactionInstructions?: string;

  sections: PromptSection[];

  namesBehavior?: NamesBehavior;
  continuePostfix?: ContinuePostfix;

  ppCollapseNewlines?: boolean;
  ppTrimTrailingWhitespace?: boolean;
  ppDropIncompleteSentence?: boolean;
  ppSingleLine?: boolean;

  continueNudgePrompt?: string;
  wiFormat?: string;

  guidedResponsePrompt?: string;
  guidedResponseRole?: MessageRole;
  guidedSwipePrompt?: string;
  guidedSwipeRole?: MessageRole;
  guidedImpersonatePrompt?: string;
  guidedImpersonateRole?: MessageRole;
  guidedRewritePrompt?: string;
  guidedRewriteRole?: MessageRole;
  guidedOpeningPrompt?: string;
  guidedOpeningRole?: MessageRole;
  guidedContinuePrompt?: string;
  guidedContinueRole?: MessageRole;
}

export const presetFormValuesSchema = z.object({
  quality: z.enum(QUALITY_LEVELS).optional(),

  effort: z.enum(EFFORT_LEVELS).optional(),
  thinkingBudgetTokens: generationKnobSchemas.thinkingBudgetTokens,
  thinkingDisplay: z.enum(THINKING_DISPLAYS).optional(),

  maxOutputTokens: generationKnobSchemas.maxOutputTokens,
  maxBudgetUsd: generationKnobSchemas.maxBudgetUsd,
  maxContextTokens: generationKnobSchemas.maxContextTokens,

  temperature: generationKnobSchemas.temperature,
  topP: generationKnobSchemas.topP,
  topK: generationKnobSchemas.topK,
  frequencyPenalty: generationKnobSchemas.frequencyPenalty,
  presencePenalty: generationKnobSchemas.presencePenalty,
  repetitionPenalty: generationKnobSchemas.repetitionPenalty,
  seed: generationKnobSchemas.seed,

  compactionMode: z.enum(COMPACTION_MODES).optional(),
  compactionThresholdPct: generationKnobSchemas.compactionThresholdPct,
  compactionInstructions: z.string().optional(),

  sections: z.array(promptSectionSchema),

  namesBehavior: z.enum(NAMES_BEHAVIOR).optional(),
  continuePostfix: z.enum(CONTINUE_POSTFIX_TYPES).optional(),

  ppCollapseNewlines: z.boolean().optional(),
  ppTrimTrailingWhitespace: z.boolean().optional(),
  ppDropIncompleteSentence: z.boolean().optional(),
  ppSingleLine: z.boolean().optional(),

  continueNudgePrompt: z.string().optional(),
  wiFormat: z.string().optional(),

  guidedResponsePrompt: z.string().optional(),
  guidedResponseRole: z.enum(MESSAGE_ROLES).optional(),
  guidedSwipePrompt: z.string().optional(),
  guidedSwipeRole: z.enum(MESSAGE_ROLES).optional(),
  guidedImpersonatePrompt: z.string().optional(),
  guidedImpersonateRole: z.enum(MESSAGE_ROLES).optional(),
  guidedRewritePrompt: z.string().optional(),
  guidedRewriteRole: z.enum(MESSAGE_ROLES).optional(),
  guidedOpeningPrompt: z.string().optional(),
  guidedOpeningRole: z.enum(MESSAGE_ROLES).optional(),
  guidedContinuePrompt: z.string().optional(),
  guidedContinueRole: z.enum(MESSAGE_ROLES).optional(),
});

/** Copy the flat scalar generation knobs out of a UserIntent params blob into a form-values object
 *  (each only when present). Split out of `toPresetFormValues` to keep both under the complexity gate. */
function copyParamsToForm(params: UserIntent, out: PresetFormValues): void {
  assignIfDefined(out, "quality", params.quality);
  assignIfDefined(out, "effort", params.effort);
  assignIfDefined(out, "thinkingBudgetTokens", params.thinkingBudgetTokens);
  assignIfDefined(out, "thinkingDisplay", params.thinkingDisplay);
  assignIfDefined(out, "maxOutputTokens", params.maxOutputTokens);
  assignIfDefined(out, "maxBudgetUsd", params.maxBudgetUsd);
  assignIfDefined(out, "maxContextTokens", params.maxContextTokens);
  assignIfDefined(out, "temperature", params.temperature);
  assignIfDefined(out, "topP", params.topP);
  assignIfDefined(out, "topK", params.topK);
  assignIfDefined(out, "frequencyPenalty", params.frequencyPenalty);
  assignIfDefined(out, "presencePenalty", params.presencePenalty);
  assignIfDefined(out, "repetitionPenalty", params.repetitionPenalty);
  assignIfDefined(out, "seed", params.seed);
  if (params.compaction !== undefined) {
    assignIfDefined(out, "compactionMode", params.compaction.mode);
    assignIfDefined(out, "compactionThresholdPct", params.compaction.thresholdPct);
    assignIfDefined(out, "compactionInstructions", params.compaction.instructions);
  }
}

/** Flatten the 6 guided actions (× {prompt, role}) onto the form. The preset may omit guidedActions
 *  entirely (→ DEFAULT_GUIDED_ACTIONS at resolve time); when present every action is required, so we
 *  copy all 12 keys. */
function copyGuidedToForm(ga: GuidedActionsConfig, out: PresetFormValues): void {
  out.guidedResponsePrompt = ga.response.prompt;
  out.guidedResponseRole = ga.response.role;
  out.guidedSwipePrompt = ga.swipe.prompt;
  out.guidedSwipeRole = ga.swipe.role;
  out.guidedImpersonatePrompt = ga.impersonate.prompt;
  out.guidedImpersonateRole = ga.impersonate.role;
  out.guidedRewritePrompt = ga.rewrite.prompt;
  out.guidedRewriteRole = ga.rewrite.role;
  out.guidedOpeningPrompt = ga.opening.prompt;
  out.guidedOpeningRole = ga.opening.role;
  out.guidedContinuePrompt = ga.continue.prompt;
  out.guidedContinueRole = ga.continue.role;
}

/** server → form (on seed). Each UserIntent field is optional; only set when present. */
export function toPresetFormValues(config: PromptConfig): PresetFormValues {
  const fs = config.formatStrings ?? {};
  const ga = config.guidedActions;
  const pp = config.postProcess;

  const out: PresetFormValues = { sections: [...config.sections] };
  copyParamsToForm(config.params, out);

  assignIfDefined(out, "namesBehavior", config.namesBehavior);
  assignIfDefined(out, "continuePostfix", config.continuePostfix);

  // postProcess flattened (default false when the block is absent).
  out.ppCollapseNewlines = pp?.collapseNewlines ?? false;
  out.ppTrimTrailingWhitespace = pp?.trimTrailingWhitespace ?? false;
  out.ppDropIncompleteSentence = pp?.dropIncompleteSentence ?? false;
  out.ppSingleLine = pp?.singleLine ?? false;

  assignIfDefined(out, "continueNudgePrompt", fs.continueNudge);
  assignIfDefined(out, "wiFormat", fs.wiFormat);

  if (ga !== undefined) {
    copyGuidedToForm(ga, out);
  }

  return out;
}

/** Reconstruct the UserIntent params blob from the flat form (preserving server-only fields the form
 *  never edits: advanced / logitBias / stop). Split out to keep `toPromptConfig` under the gate. */
function formToParams(form: PresetFormValues, server: PromptConfig): UserIntent {
  const params: UserIntent = {};
  assignIfDefined(params, "quality", form.quality);
  assignIfDefined(params, "effort", form.effort);
  assignIfDefined(params, "thinkingBudgetTokens", form.thinkingBudgetTokens);
  assignIfDefined(params, "thinkingDisplay", form.thinkingDisplay);
  assignIfDefined(params, "maxOutputTokens", form.maxOutputTokens);
  assignIfDefined(params, "maxBudgetUsd", form.maxBudgetUsd);
  assignIfDefined(params, "maxContextTokens", form.maxContextTokens);
  assignIfDefined(params, "temperature", form.temperature);
  assignIfDefined(params, "topP", form.topP);
  assignIfDefined(params, "topK", form.topK);
  assignIfDefined(params, "frequencyPenalty", form.frequencyPenalty);
  assignIfDefined(params, "presencePenalty", form.presencePenalty);
  assignIfDefined(params, "repetitionPenalty", form.repetitionPenalty);
  assignIfDefined(params, "seed", form.seed);

  const serverParams = server.params;
  assignIfDefined(params, "advanced", serverParams.advanced);
  assignIfDefined(params, "logitBias", serverParams.logitBias);
  assignIfDefined(params, "stop", serverParams.stop);

  const compaction: NonNullable<UserIntent["compaction"]> = {};
  assignIfDefined(compaction, "mode", form.compactionMode);
  assignIfDefined(compaction, "thresholdPct", form.compactionThresholdPct);
  assignIfDefined(compaction, "instructions", form.compactionInstructions);
  if (Object.keys(compaction).length > 0) {
    params.compaction = compaction;
  }
  return params;
}

const guidedActionFrom = (prompt: string, role: MessageRole | undefined): GuidedActionConfig => ({
  prompt,
  role: role ?? "system",
});

/** Build the guidedActions blob ONLY when every CORE steer (response/swipe/impersonate/rewrite) has its
 *  prompt set; otherwise undefined → the reader falls back to DEFAULT_GUIDED_ACTIONS. Guided actions have
 *  ONE home — the preset; there is NO AppSettings.guidedActions (D33). `opening` and `continue` ride along
 *  with a default-fallback (not part of the gate, so 4-action presets aren't suddenly dropped to default). */
function formToGuidedActions(form: PresetFormValues): GuidedActionsConfig | undefined {
  if (
    form.guidedResponsePrompt === undefined ||
    form.guidedSwipePrompt === undefined ||
    form.guidedImpersonatePrompt === undefined ||
    form.guidedRewritePrompt === undefined
  ) {
    return;
  }
  return {
    response: guidedActionFrom(form.guidedResponsePrompt, form.guidedResponseRole),
    swipe: guidedActionFrom(form.guidedSwipePrompt, form.guidedSwipeRole),
    impersonate: guidedActionFrom(form.guidedImpersonatePrompt, form.guidedImpersonateRole),
    rewrite: guidedActionFrom(form.guidedRewritePrompt, form.guidedRewriteRole),
    opening: guidedActionFrom(
      form.guidedOpeningPrompt ?? DEFAULT_GUIDED_ACTIONS.opening.prompt,
      form.guidedOpeningRole,
    ),
    continue: guidedActionFrom(
      form.guidedContinuePrompt ?? DEFAULT_GUIDED_ACTIONS.continue.prompt,
      form.guidedContinueRole,
    ),
  };
}

/** form → server (on submit). MERGED onto the existing server config so the fields the form doesn't
 *  edit (schemaVersion / regexScripts / variables / customParameters) survive. Built field-by-field
 *  (no spread-then-delete — `delete` is banned: an absent form field round-trips to "unset"). */
export function toPromptConfig(form: PresetFormValues, server: PromptConfig): PromptConfig {
  const params = formToParams(form, server);

  const formatStrings: NonNullable<PromptConfig["formatStrings"]> = {};
  assignIfDefined(formatStrings, "continueNudge", form.continueNudgePrompt);
  assignIfDefined(formatStrings, "wiFormat", form.wiFormat);

  const guidedActions = formToGuidedActions(form);

  const postProcess = {
    collapseNewlines: form.ppCollapseNewlines ?? false,
    trimTrailingWhitespace: form.ppTrimTrailingWhitespace ?? false,
    dropIncompleteSentence: form.ppDropIncompleteSentence ?? false,
    singleLine: form.ppSingleLine ?? false,
  };
  const hasPostProcess = Object.values(postProcess).some((flag): boolean => flag);

  // Explicit construction (every PromptConfig field accounted for) — preserves the server-only fields
  // the form never edits, and omitting an absent top-level field is how "unset" round-trips.
  const next: PromptConfig = {
    schemaVersion: server.schemaVersion,
    sections: form.sections,
    params,
    regexScripts: server.regexScripts,
    variables: server.variables,
  };
  assignIfDefined(next, "customParameters", server.customParameters);
  assignIfDefined(next, "namesBehavior", form.namesBehavior);
  assignIfDefined(next, "continuePostfix", form.continuePostfix);
  if (Object.keys(formatStrings).length > 0) {
    next.formatStrings = formatStrings;
  }
  if (guidedActions !== undefined) {
    next.guidedActions = guidedActions;
  }
  if (hasPostProcess) {
    next.postProcess = postProcess;
  }
  return next;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PROMPT_MACROS — the canonical macro catalog (client autocomplete + future server linter + docs).
// When you add a macro to the assembler, add it HERE. The macro ENGINE is `@orb/kit/macro`.
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
// `parseNeoPresetFile` is STRICT (a broken file errors loudly); `parsePromptConfig` is LENIENT (a
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
const ST_TOP_A_DEFAULT = 1;
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
const OVERRIDABLE_MARKERS: ReadonlySet<MarkerType> = new Set<MarkerType>([
  "main_prompt",
  "post_history",
]);

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
    prompt_order: z
      .array(z.object({ character_id: z.number(), order: z.array(stOrderEntrySchema) }))
      .optional(),
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
  const valid = t.filter((v): v is GenerationType =>
    (GENERATION_TYPES as readonly string[]).includes(v),
  );
  return valid.length > 0 ? valid : undefined;
}

/** Absolute-depth injection (ST injection_position === ABSOLUTE) → `inject`. */
function injectOf(prompt: StPrompt): SectionInject | undefined {
  if (prompt.injection_position !== ST_INJECTION_ABSOLUTE) {
    return;
  }
  const depth = Number.isFinite(prompt.injection_depth)
    ? (prompt.injection_depth as number)
    : ST_DEFAULT_DEPTH;
  const order = prompt.injection_order;
  return order !== undefined && order !== ST_DEFAULT_ORDER ? { depth, order } : { depth };
}

/** The optional `inject`/`trigger` fields, present only when set (shared by both section branches). */
function injectTriggerFields(
  inject: SectionInject | undefined,
  trigger: GenerationType[] | undefined,
): { inject?: SectionInject; trigger?: GenerationType[] } {
  return {
    ...(inject !== undefined ? { inject } : {}),
    ...(trigger !== undefined ? { trigger } : {}),
  };
}

/** The override-block fields a templated marker carries when it's one of the two overridable slots. */
function overrideFields(
  prompt: StPrompt,
  marker: MarkerType,
): { template?: string; forbidCharacterOverride?: boolean } {
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
  return orders.reduce((best, o): StOrderGroup => (o.order.length > best.order.length ? o : best))
    .order;
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
const setNumAbove = (
  out: Record<string, unknown>,
  k: string,
  v: number | undefined,
  floor: number,
): void => {
  if (v !== undefined && v > floor) {
    out[k] = v;
  }
};

/** Map ST sampling/behavior scalars onto UserIntent, tracking what has no neo vocabulary. */
function mapParams(raw: Record<string, unknown>, dropped: StDroppedField[]): UserIntent {
  const out: Record<string, unknown> = {};
  setNum(out, "temperature", readNum(raw, "temperature"));
  setNum(out, "topP", readNum(raw, "top_p"));
  setNumAbove(out, "topK", readNum(raw, "top_k"), ST_DISABLED_NUMERIC); // ST 0 = disabled
  setNum(out, "frequencyPenalty", readNum(raw, "frequency_penalty"));
  setNum(out, "presencePenalty", readNum(raw, "presence_penalty"));
  setNum(out, "repetitionPenalty", readNum(raw, "repetition_penalty"));
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

  // Sampling knobs with no neo vocabulary.
  const topA = readNum(raw, "top_a");
  if (topA !== undefined && topA !== ST_TOP_A_DEFAULT) {
    dropped.push({ field: "top_a", reason: "no neo sampling vocab" });
  }
  const minP = readNum(raw, "min_p");
  if (minP !== undefined && minP !== ST_MIN_P_DEFAULT) {
    dropped.push({ field: "min_p", reason: "no neo sampling vocab" });
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
  { field: "impersonation_prompt", reason: "no impersonation-prompt slot" },
  { field: "group_nudge_prompt", reason: "no group chats" },
  { field: "new_chat_prompt", reason: "no new-chat injection slot" },
  { field: "new_group_chat_prompt", reason: "no group chats" },
  { field: "new_example_chat_prompt", reason: "no example-chat injection slot" },
  { field: "continue_nudge_prompt", reason: "neo uses formatStrings.continueNudge default" },
  { field: "bias_preset_selected", reason: "no logit-bias presets" },
  { field: "assistant_prefill", reason: "response prefill unsupported across providers" },
  { field: "assistant_impersonation", reason: "no impersonation prefill" },
  { field: "wrap_in_quotes", reason: "no quote-wrapping knob" },
  { field: "squash_system_messages", reason: "neo squashes system messages automatically" },
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
  return typeof raw === "string" && (NAMES_BEHAVIOR as readonly string[]).includes(raw)
    ? (raw as NamesBehavior)
    : undefined;
}

/** The authored walk: the prompt_order if present, else the prompts[] declaration order (all enabled). */
function buildWalk(
  order: StOrderGroup["order"],
  prompts: StPrompt[],
): { identifier: string; enabled: boolean }[] {
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
function buildSections(
  byId: Map<string, StPrompt>,
  walk: { identifier: string; enabled: boolean }[],
): PromptSection[] {
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

/** Import a SillyTavern Chat Completion preset (parsed JSON) into a validated PromptConfig. Throws when
 *  `raw` isn't a recognizable ST preset (no prompts AND no prompt_order). */
export function importStChatCompletionPreset(raw: unknown): StImportResult {
  const parsed = stPresetSchema.safeParse(raw);
  if (!(parsed.success && (parsed.data.prompts || parsed.data.prompt_order))) {
    throw new Error(
      "Not a SillyTavern Chat Completion preset (expected prompts[] + prompt_order).",
    );
  }
  const data = parsed.data;
  const rawObj: Record<string, unknown> =
    raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const prompts = data.prompts ?? [];
  const byId = new Map<string, StPrompt>(prompts.map((p): [string, StPrompt] => [p.identifier, p]));
  const walk = buildWalk(pickOrder(data.prompt_order ?? []), prompts);
  const sections = buildSections(byId, walk);

  const dropped: StDroppedField[] = [];
  const params = mapParams(rawObj, dropped);
  dropped.push(...collectDroppableFields(rawObj));

  const namesBehavior = namesBehaviorOf(rawObj["names_behavior"]);
  const rawPostfix = rawObj["continue_postfix"];
  const continuePostfix =
    typeof rawPostfix === "string" ? ST_CONTINUE_POSTFIX[rawPostfix] : undefined;

  // Construct + validate via the canonical (lenient) parser — fills defaults, runs the lift, drops
  // anything malformed to a safe shape so the importer can never emit an invalid PromptConfig.
  const config = parsePromptConfig({
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections,
    params,
    ...(namesBehavior !== undefined ? { namesBehavior } : {}),
    ...(continuePostfix !== undefined ? { continuePostfix } : {}),
  });

  return { config, dropped, sectionCount: sections.length };
}

// ── neo native preset file (the lossless full-preset export) ───────────────────────────────────────
export const NEO_PRESET_SCHEMA_KIND = "neo-tavern-preset";

export interface NeoPresetFile {
  schemaKind: typeof NEO_PRESET_SCHEMA_KIND;
  /** The PromptConfig schema version at export time (the parser lifts older files forward). */
  schemaVersion: number;
  name: string;
  config: PromptConfig;
}

/** Build the export payload for a preset (name + its full config). */
export function buildNeoPresetFile(name: string, config: PromptConfig): NeoPresetFile {
  return {
    schemaKind: NEO_PRESET_SCHEMA_KIND,
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    name,
    config,
  };
}

export type ParseNeoPresetResult =
  | { ok: true; name: string; config: PromptConfig }
  | { ok: false; error: string };

/** Parse a `neo-tavern-preset` file. Validates the envelope, then STRICTLY validates the config via
 *  `promptConfigSchema` directly: a structurally-wrong config is REJECTED (not degraded to DEFAULT) so
 *  a broken file errors loudly instead of silently importing as an empty preset — the deliberate
 *  contrast with `parsePromptConfig`'s lenient degrade-to-default. */
export function parseNeoPresetFile(raw: unknown): ParseNeoPresetResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Not a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  if (o["schemaKind"] !== NEO_PRESET_SCHEMA_KIND) {
    return { ok: false, error: `Not a ${NEO_PRESET_SCHEMA_KIND} file.` };
  }
  const result = promptConfigSchema.safeParse(o["config"]);
  if (!result.success) {
    return {
      ok: false,
      error: `The file's "config" isn't a valid prompt config: ${result.error.issues[0]?.message ?? "schema mismatch"}`,
    };
  }
  const rawName = o["name"];
  const name =
    typeof rawName === "string" && rawName.trim().length > 0 ? rawName : "Imported preset";
  return { ok: true, name, config: result.data };
}
