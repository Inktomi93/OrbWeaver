// @orb/contracts/preset — generation config: the `PromptConfig` blob, its lift chain, user-intent
// generation knobs, guided-actions config, custom parameters, the macro catalog, and ST/neo preset serde.
// preset = GENERATION config, NOT the connection (`{api, source, model}` is `contracts/connection`'s axis).

import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { z } from "zod";
import type { EffortLevel as ModelEffortLevel } from "#connection";
import { EFFORT_LEVELS as MODEL_EFFORT_LEVELS, roleHandlingSchema, VERBOSITY_LEVELS } from "#connection";
import { regexScriptSchema } from "#regex";
import { defineVersionedConfig } from "#versioned-config";

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

// The user-INTENT effort vocabulary (adds `none` = thinking-disabled) — derived from connection's
// `EffortLevel` set (never redeclared) so the two can't diverge.
export const EFFORT_LEVELS = ["none", ...MODEL_EFFORT_LEVELS] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
export const effortLevelSchema = z.enum(EFFORT_LEVELS);

export const THINKING_DISPLAYS = ["summarized", "omitted"] as const;
export type ThinkingDisplay = (typeof THINKING_DISPLAYS)[number];

export const COMPACTION_MODES = ["auto", "managed", "off"] as const;
export type CompactionMode = (typeof COMPACTION_MODES)[number];

const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;
const TOP_P_MIN = 0;
const TOP_P_MAX = 1;
const MIN_P_MIN = 0;
const MIN_P_MAX = 1;
const PENALTY_MIN = -2;
const PENALTY_MAX = 2;
const REPETITION_PENALTY_MIN = 0;
const REPETITION_PENALTY_MAX = 2;
const COMPACTION_THRESHOLD_MIN = 0.5;
const COMPACTION_THRESHOLD_MAX = 0.99;

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
  frequencyPenalty: z.number().min(PENALTY_MIN).max(PENALTY_MAX).optional(),
  presencePenalty: z.number().min(PENALTY_MIN).max(PENALTY_MAX).optional(),
  repetitionPenalty: z.number().min(REPETITION_PENALTY_MIN).max(REPETITION_PENALTY_MAX).optional(),
  seed: z.number().int().optional(),
  compactionThresholdPct: z.number().min(COMPACTION_THRESHOLD_MIN).max(COMPACTION_THRESHOLD_MAX).optional(),
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
      })
      .optional(),
  })
  .strict();
export type UserIntent = z.infer<typeof userIntentSchema>;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Guided actions — the config half (the resolver + ZWSP neutralization live in `@orb/kit/guided`).
// ══════════════════════════════════════════════════════════════════════════════════════════════════

export const GUIDED_ACTION_KINDS = ["response", "swipe", "impersonate", "rewrite", "opening", "continue"] as const satisfies readonly string[];
export type GuidedActionKind = (typeof GUIDED_ACTION_KINDS)[number];

// The `impersonate` action's `{{person}}` word — spliced verbatim into "{{person}}-person perspective"
// templates. ONE importable union so the composer picker and the domain steer field can't drift apart.
export const GUIDED_IMPERSONATE_PERSONS = ["first", "second", "third"] as const satisfies readonly string[];
export type GuidedImpersonatePerson = (typeof GUIDED_IMPERSONATE_PERSONS)[number];
export const guidedActionKindSchema = z.enum(GUIDED_ACTION_KINDS);

const OPENING_DEFAULT_PROMPT =
  "[Open the scene: write your first message to me, in character — set the scene and greet me as {{char}} would. Stay fully in character. {{input}}]";
const CONTINUE_DEFAULT_PROMPT = "[Take the following into special consideration while continuing your previous message: {{input}}]";
const RESPONSE_DEFAULT_PROMPT = "[Take the following into special consideration for your next message: {{input}}]";
const IMPERSONATE_DEFAULT_PROMPT =
  "[Forget all other previous instructions. For this turn only, write in the {{person}}-person perspective AS {{user}} (not {{char}}). Limit yourself strictly to {{user}}'s voice and actions; do NOT narrate {{char}}'s reaction or the surrounding scene. Guidance: {{input}}]";
const REWRITE_DEFAULT_PROMPT =
  "[OOC: Answer me out of character. Don't continue the RP. Instead, rewrite {{char}}'s last response to reflect the following: {{input}}. Don't make any other changes besides this.]";

const GUIDED_DEFAULT_ROLE: MessageRole = "system";

export const guidedActionConfigSchema = z.object({
  /** The injection template; `{{input}}` = the user's steering text. Missing/empty falls back to `{{input}}` alone. */
  prompt: z.string(),
  /** Conversation role the resolved text is delivered with; `system` renders in the cacheable system
   *  prompt, `user`/`assistant` push as an in-chat depth-0 injection. */
  role: z.enum(MESSAGE_ROLES).default(GUIDED_DEFAULT_ROLE),
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
  /** Custom framing template (macros allowed). Omit ⇒ `DEFAULT_MARKER_TEMPLATES[marker]`. Empty = render nothing. */
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

/** Current blob shape. Bump + add a lift below when the shape changes (NO DB migration needed). */
export const PROMPT_CONFIG_SCHEMA_VERSION = 3;
const SCHEMA_VERSION_V1 = 1; // walk floor — a versionless/garbage blob probes as v1
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;

export const promptConfigSchema = z.object({
  schemaVersion: z.number().int().positive().default(PROMPT_CONFIG_SCHEMA_VERSION),
  sections: z.array(promptSectionSchema).max(MAX_SECTIONS),
  // `.catch({})` bounds a malformed params blob to JUST this field — `userIntentSchema` is `.strict()`,
  // so without this a single unknown nested key would degrade the WHOLE preset to DEFAULT_PROMPT_CONFIG.
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
};

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

/** Map ST sampling/behavior scalars onto UserIntent, tracking what has no neo vocabulary. */
function mapParams(raw: Record<string, unknown>, dropped: StDroppedField[]): UserIntent {
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

  const topA = readNum(raw, "top_a");
  if (topA !== undefined && topA !== ST_TOP_A_DEFAULT) {
    dropped.push({ field: "top_a", reason: "no neo sampling vocab" });
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
  { field: "group_nudge_prompt", reason: "group nudge is room-owned, not preset-owned" },
  { field: "new_chat_prompt", reason: "no new-chat injection slot" },
  { field: "new_group_chat_prompt", reason: "no group chats" },
  { field: "new_example_chat_prompt", reason: "no example-chat injection slot" },
  { field: "continue_nudge_prompt", reason: "neo uses formatStrings.continueNudge default" },
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
  const params = mapParams(rawObj, dropped);
  dropped.push(...collectDroppableFields(rawObj));

  const namesBehavior = namesBehaviorOf(rawObj["names_behavior"]);
  const rawPostfix = rawObj["continue_postfix"];
  const continuePostfix = typeof rawPostfix === "string" ? ST_CONTINUE_POSTFIX[rawPostfix] : undefined;

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
