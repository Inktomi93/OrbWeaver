// biome-ignore-all lint/style/useNamingConvention: SillyTavern wire field names (snake_case) — `min_p` etc.
// are exactly what an ST preset blob carries (the D68-A import mapping tests below).
import type { GuidedActionKind, PromptConfig } from "@orb/contracts/preset";
import {
  buildPresetFile,
  CONFIG_LIFTS,
  customParametersSchema,
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_PROMPT_CONFIG,
  GREETING_TRANSFORM_AXES,
  GREETING_TRANSFORMS,
  GUIDED_ACTION_KINDS,
  guidedActionsSchema,
  importStChatCompletionPreset,
  PRESET_SCHEMA_KIND,
  PROMPT_CONFIG_SCHEMA_VERSION,
  parsePresetFile,
  parsePromptConfig,
  promptConfigSchema,
  THINK_PREFIX_DEFAULT,
  THINK_SUFFIX_DEFAULT,
  userIntentSchema,
} from "@orb/contracts/preset";
import { expect, test } from "../../support/fixtures";

// Sample values named so the test isn't littered with bare magic numbers (noMagicNumbers).
const SAMPLE_TEMPERATURE = 0.7;
const OUT_OF_RANGE_TEMPERATURE = 3; // userIntentSchema caps temperature at 2
const GUIDED_ACTION_COUNT = 8;
const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;
const SCHEMA_VERSION_V4 = 4;

test("promptConfigSchema accepts DEFAULT_PROMPT_CONFIG and parsePromptConfig round-trips it", () => {
  expect(promptConfigSchema.parse(DEFAULT_PROMPT_CONFIG)).toEqual(DEFAULT_PROMPT_CONFIG);
  expect(parsePromptConfig(DEFAULT_PROMPT_CONFIG)).toEqual(DEFAULT_PROMPT_CONFIG);
});

test("parsePromptConfig degrades a non-object / malformed blob to DEFAULT_PROMPT_CONFIG (lenient)", () => {
  expect(parsePromptConfig(null)).toEqual(DEFAULT_PROMPT_CONFIG);
  expect(parsePromptConfig("not a config")).toEqual(DEFAULT_PROMPT_CONFIG);
});

// ── The CONFIG_LIFTS walk: the three v1→v2 transforms + the v2→v3 version stamp ─────────────────────

test("CONFIG_LIFTS v1→v2 applies all three transforms (main→marker, jailbreak fold, pivot insert)", () => {
  const liftV1 = CONFIG_LIFTS[SCHEMA_VERSION_V1];
  if (liftV1 === undefined) {
    throw new Error("CONFIG_LIFTS[1] is missing");
  }
  const lifted = liftV1({
    schemaVersion: SCHEMA_VERSION_V1,
    sections: [
      // (b) a literal "Main" → becomes a main_prompt marker carrying its content as the template.
      {
        type: "literal",
        id: "main",
        name: "Main",
        role: "system",
        content: "BE GOOD",
        enabled: true,
      },
      // standalone char_system → dropped entirely.
      { type: "marker", id: "cs", name: "Char system", marker: "char_system", enabled: true },
      // (a) jailbreak template content → folded into post_history's template; jailbreak removed.
      {
        type: "marker",
        id: "jb",
        name: "Jailbreak",
        marker: "jailbreak",
        template: "STAY ON TASK",
      },
      { type: "marker", id: "ph", name: "Post-history", marker: "post_history", enabled: true },
    ],
  });

  const sections = lifted["sections"] as Record<string, unknown>[];
  const markers = sections.map((s): unknown => s["marker"]);
  const mainSection = sections.find((s): boolean => s["marker"] === "main_prompt");
  const phSection = sections.find((s): boolean => s["marker"] === "post_history");

  // (b) the literal "main" is now a main_prompt marker with the literal's content as template.
  expect(mainSection?.["template"]).toBe("BE GOOD");
  // char_system + jailbreak are gone.
  expect(markers).not.toContain("char_system");
  expect(markers).not.toContain("jailbreak");
  // (a) the jailbreak content folded into post_history's template.
  expect(phSection?.["template"]).toBe("STAY ON TASK");
  // (c) a chat_history pivot was inserted (post_history existed, none was present).
  expect(markers).toContain("chat_history");
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V2);
});

test("CONFIG_LIFTS v1→v2 inserts NO pivot when there is no post_history (the post-history guard)", () => {
  const liftV1 = CONFIG_LIFTS[SCHEMA_VERSION_V1];
  if (liftV1 === undefined) {
    throw new Error("CONFIG_LIFTS[1] is missing");
  }
  const lifted = liftV1({
    schemaVersion: SCHEMA_VERSION_V1,
    sections: [{ type: "marker", id: "d", name: "Description", marker: "char_description", enabled: true }],
  });
  const sections = lifted["sections"] as Record<string, unknown>[];
  const markers = sections.map((s): unknown => s["marker"]);
  expect(markers).not.toContain("chat_history");
});

test("a full v1 blob parsed through parsePromptConfig is lifted to the current version", () => {
  const parsed = parsePromptConfig({
    schemaVersion: SCHEMA_VERSION_V1,
    sections: [
      { type: "literal", id: "main", name: "Main", role: "system", content: "X", enabled: true },
      { type: "marker", id: "ph", name: "Post-history", marker: "post_history", enabled: true },
    ],
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  const markers = parsed.sections.map((s): unknown => (s.type === "marker" ? s.marker : null));
  expect(markers).toContain("main_prompt");
  expect(markers).toContain("chat_history");
});

// v3→v4: `compaction.mode:"off"` is retired (owner ruling — compaction is a safety property). A stored "off"
// lifts to "managed" so an existing preset never validation-fails on the removed member.
test("CONFIG_LIFTS v3→v4 maps a stored compaction.mode:'off' to 'managed'", () => {
  const liftV3 = CONFIG_LIFTS[SCHEMA_VERSION_V3];
  if (liftV3 === undefined) {
    throw new Error("CONFIG_LIFTS[3] is missing");
  }
  const lifted = liftV3({ schemaVersion: SCHEMA_VERSION_V3, params: { compaction: { mode: "off", thresholdPct: 0.7 } } });
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V4);
  const params = lifted["params"] as { compaction: { mode: string; thresholdPct: number } };
  expect(params.compaction.mode).toBe("managed"); // "off" retired → managed
  expect(params.compaction.thresholdPct).toBe(0.7); // the rest is untouched
});

test("a stored preset with compaction.mode:'off' parses (lifted to managed) rather than rejecting", () => {
  const parsed = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    schemaVersion: SCHEMA_VERSION_V3,
    params: { ...DEFAULT_PROMPT_CONFIG.params, compaction: { mode: "off" } },
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(parsed.params.compaction?.mode).toBe("managed");
});

// ── `params: userIntentSchema.catch({})` damage-bounding ────────────────────────────────────────────

test("an unknown params key degrades ONLY params to {} — sections survive", () => {
  const blob = {
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections: DEFAULT_PROMPT_CONFIG.sections,
    // userIntentSchema is `.strict()`, so this unknown key fails the params parse; `.catch({})` bounds
    // the damage to params alone instead of degrading the WHOLE config to DEFAULT.
    params: { thisFieldDoesNotExist: SCHEMA_VERSION_V1, temperature: SAMPLE_TEMPERATURE },
    regexScripts: [],
    variables: [],
  };
  const parsed = promptConfigSchema.parse(blob);
  expect(parsed.params).toEqual({});
  // The rest of the config is preserved (NOT degraded to DEFAULT).
  expect(parsed.sections).toEqual(DEFAULT_PROMPT_CONFIG.sections);
});

test("a clean params blob parses through unchanged (the catch only fires on failure)", () => {
  const parsed = promptConfigSchema.parse({
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections: DEFAULT_PROMPT_CONFIG.sections,
    params: { temperature: SAMPLE_TEMPERATURE, quality: "deep" },
  });
  expect(parsed.params).toEqual({ temperature: SAMPLE_TEMPERATURE, quality: "deep" });
});

test("userIntentSchema rejects an out-of-bounds knob (the shared numeric bounds hold)", () => {
  expect(userIntentSchema.safeParse({ temperature: OUT_OF_RANGE_TEMPERATURE }).success).toBe(false);
});

// --- D68 slots: minP + verbosity on UserIntent (no consumer until W2) ---------

test("userIntentSchema accepts minP within [0,1] (D68-A slot)", () => {
  expect(userIntentSchema.parse({ minP: 0.05 })).toEqual({ minP: 0.05 });
  expect(userIntentSchema.safeParse({ minP: 1.5 }).success).toBe(false);
  expect(userIntentSchema.safeParse({ minP: -0.1 }).success).toBe(false);
});

test("userIntentSchema accepts a verbosity member (D68-B slot; vocab from connection)", () => {
  expect(userIntentSchema.parse({ verbosity: "low" })).toEqual({ verbosity: "low" });
  expect(userIntentSchema.parse({ verbosity: "high" })).toEqual({ verbosity: "high" });
  expect(userIntentSchema.safeParse({ verbosity: "verbose" }).success).toBe(false);
});

test("guidedActionsSchema round-trips DEFAULT_GUIDED_ACTIONS over all six actions", () => {
  const parsed = guidedActionsSchema.parse(DEFAULT_GUIDED_ACTIONS);
  expect(parsed).toEqual(DEFAULT_GUIDED_ACTIONS);
  for (const kind of GUIDED_ACTION_KINDS) {
    expect(parsed[kind]).toBeDefined();
  }
});

test("guidedActionsSchema fills opening + continue + greeting defaults for a blob predating them (back-compat)", () => {
  const legacy = {
    response: { prompt: "r", role: "system" },
    swipe: { prompt: "s", role: "system" },
    impersonate: { prompt: "i", role: "system" },
    rewrite: { prompt: "w", role: "system" },
  };
  const parsed = guidedActionsSchema.parse(legacy);
  expect(parsed.opening).toEqual(DEFAULT_GUIDED_ACTIONS.opening);
  expect(parsed.continue).toEqual(DEFAULT_GUIDED_ACTIONS.continue);
  // Greeting-studio kinds (audit §3) — defaulted like opening/continue so a stored blob predating them parses.
  expect(parsed.greeting_rewrite).toEqual(DEFAULT_GUIDED_ACTIONS.greeting_rewrite);
  expect(parsed.greeting_new).toEqual(DEFAULT_GUIDED_ACTIONS.greeting_new);
});

test("greeting_rewrite default carries the {{base}} token; greeting_new does not (audit §3)", () => {
  expect(DEFAULT_GUIDED_ACTIONS.greeting_rewrite.prompt).toContain("{{base}}");
  expect(DEFAULT_GUIDED_ACTIONS.greeting_rewrite.prompt).toContain("{{input}}");
  expect(DEFAULT_GUIDED_ACTIONS.greeting_new.prompt).not.toContain("{{base}}");
  expect(DEFAULT_GUIDED_ACTIONS.greeting_new.prompt).toContain("{{input}}");
});

test("GuidedActionKind is the canonical KIND name (the §7.5 axis), not neo's GuidedAction", () => {
  // Type-level pin: a value typed as `GuidedActionKind` is assignable from a tuple member.
  const kind: GuidedActionKind = "impersonate";
  expect(GUIDED_ACTION_KINDS).toContain(kind);
  expect(GUIDED_ACTION_KINDS.length).toBe(GUIDED_ACTION_COUNT);
});

// ── GREETING_TRANSFORMS catalog (audit §3) — the registry-as-data the client renders chips from blind ──

test("GREETING_TRANSFORMS has stable unique ids and every axis is a declared GREETING_TRANSFORM_AXES member", () => {
  const ids = GREETING_TRANSFORMS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length); // no dup ids
  for (const t of GREETING_TRANSFORMS) {
    expect(GREETING_TRANSFORM_AXES).toContain(t.axis);
    expect(t.label.length).toBeGreaterThan(0);
    expect(t.fragment.length).toBeGreaterThan(0);
  }
});

test("GREETING_TRANSFORMS covers all four axes (perspective/tense/style/gender)", () => {
  for (const axis of GREETING_TRANSFORM_AXES) {
    expect(GREETING_TRANSFORMS.some((t) => t.axis === axis)).toBe(true);
  }
});

test("GREETING_TRANSFORMS fragments carry NO macros (they are ZWSP-neutralized as {{input}} downstream)", () => {
  // The composed steer becomes the template's {{input}}, which is macro-neutralized — a {{…}} in a fragment
  // would render as literal braces. The catalog spells "the user"/"the character" in plain words instead.
  for (const t of GREETING_TRANSFORMS) {
    expect(t.fragment).not.toContain("{{");
  }
});

test("a guided action role rejects a value outside the MessageRole axis (D32)", () => {
  // "developer" is not a member of the canonical system|user|assistant axis.
  expect(
    guidedActionsSchema.safeParse({
      ...DEFAULT_GUIDED_ACTIONS,
      response: { prompt: "r", role: "developer" },
    }).success,
  ).toBe(false);
});

// ── Custom parameters (Layer-1 prototype-pollution guard) ───────────────────────────────────────────

test("customParametersSchema strips __proto__ (Zod) and accepts a clean overlay", () => {
  // `__proto__` as a JSON own-property is silently stripped by Zod core (absent from the output).
  const parsed = customParametersSchema.parse(JSON.parse('{"transforms":["middle-out"],"__proto__":{"polluted":true}}'));
  expect(parsed).toEqual({ transforms: ["middle-out"] });
  expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
});

test("customParametersSchema rejects a `constructor` key (top level and nested)", () => {
  expect(customParametersSchema.safeParse({ constructor: { evil: true } }).success).toBe(false);
  expect(customParametersSchema.safeParse({ nested: { prototype: { evil: true } } }).success).toBe(false);
});

// ── Serde: parsePresetFile (STRICT) vs parsePromptConfig (LENIENT) ───────────────────────────────

test("buildPresetFile writes the orb.preset schemaKind (not the legacy neo kind)", () => {
  const file = buildPresetFile("My preset", DEFAULT_PROMPT_CONFIG);
  expect(file.schemaKind).toBe(PRESET_SCHEMA_KIND);
  expect(PRESET_SCHEMA_KIND).toBe("orb.preset");
});

test("parsePresetFile accepts a well-formed orb.preset envelope and returns the parsed config", () => {
  const result = parsePresetFile({
    schemaKind: PRESET_SCHEMA_KIND,
    schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
    name: "My preset",
    config: DEFAULT_PROMPT_CONFIG,
  });
  if (!result.ok) {
    throw new Error(`expected a valid parse, got: ${result.error}`);
  }
  expect(result.name).toBe("My preset");
  expect(result.config).toEqual(DEFAULT_PROMPT_CONFIG);
});

test("round-trip pin: build(parse(build(x))) === build(x) over a full preset config", () => {
  // The MANDATORY per-entity structural guarantee (export-import-portability.md §1): the build + parse
  // halves can't drift. `x` is a normalized full config (a fixed point of the schema) so the equality holds
  // by the codec's own idempotence, not by luck of the fixture.
  const config: PromptConfig = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    params: { temperature: 0.85 },
  });
  const built = buildPresetFile("Round trip", config);
  const reparsed = parsePresetFile(built);
  if (!reparsed.ok) {
    throw new Error(`expected build output to re-parse, got: ${reparsed.error}`);
  }
  expect(buildPresetFile(reparsed.name, reparsed.config)).toEqual(built);
});

test("parsePresetFile is STRICT: a structurally-broken config is REJECTED (errors, not degraded)", () => {
  // `sections` must be an array — a string is invalid. parsePromptConfig would LENIENTLY degrade to
  // DEFAULT; parsePresetFile rejects loudly. This is the load-bearing strict-vs-lenient distinction.
  const brokenConfig: unknown = {
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections: "not-an-array",
  };
  const strict = parsePresetFile({
    schemaKind: PRESET_SCHEMA_KIND,
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    name: "Broken",
    config: brokenConfig,
  });
  expect(strict.ok).toBe(false);

  // The SAME broken blob, fed to the lenient parser, degrades to DEFAULT rather than erroring.
  const lenient: PromptConfig = parsePromptConfig(brokenConfig);
  expect(lenient).toEqual(DEFAULT_PROMPT_CONFIG);
});

test("parsePresetFile LIFTS a v1-era file forward before strict validation (older files import)", () => {
  // The format IS the predecessor app's export shape — a v1 config (literal `main` section + `jailbreak`
  // marker, the shapes CONFIG_LIFTS[1] migrates) must import, not be rejected as "invalid prompt config".
  const v1Config: unknown = {
    schemaVersion: 1,
    sections: [
      {
        type: "literal",
        id: "main",
        name: "Main",
        role: "system",
        content: "You are {{char}}.",
        enabled: true,
      },
      {
        type: "marker",
        id: "jb",
        name: "Jailbreak",
        marker: "jailbreak",
        role: "system",
        enabled: true,
        template: "stay in character",
      },
      {
        type: "marker",
        id: "ph",
        name: "Post-history",
        marker: "post_history",
        role: "system",
        enabled: true,
      },
    ],
    params: {},
  };
  const result = parsePresetFile({
    schemaKind: PRESET_SCHEMA_KIND,
    schemaVersion: 1,
    name: "legacy",
    config: v1Config,
  });
  if (!result.ok) {
    throw new Error(`expected the v1 file to lift + import, got: ${result.error}`);
  }
  expect(result.name).toBe("legacy");
  // Lifted to the current version, and the v1 literal `main` became the `main_prompt` marker.
  expect(result.config.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(result.config.sections.map((s) => ("marker" in s ? s.marker : s.id))).toEqual(["main_prompt", "chat_history", "post_history"]);
});

test("parsePresetFile rejects a non-object and a wrong schemaKind", () => {
  expect(parsePresetFile(null).ok).toBe(false);
  expect(parsePresetFile({ schemaKind: "something-else", config: {} }).ok).toBe(false);
});

// ── reasoningParse (D47 #3 / D53) — the inline <think> fallback config ──────────────────────────────

test("reasoningParse defaults: autoParse OFF + the <think> tag pair", () => {
  const parsed = promptConfigSchema.parse({ ...DEFAULT_PROMPT_CONFIG, reasoningParse: {} });
  expect(parsed.reasoningParse).toEqual({
    autoParse: false,
    prefix: THINK_PREFIX_DEFAULT,
    suffix: THINK_SUFFIX_DEFAULT,
  });
});

// NOTE: the flat-form-mapper round-trip tests (`toPromptConfig`/`toPresetFormValues`) were REMOVED with
// the mappers (D66 W10 — preset-form-mapper-elimination.md). The client preset editor now binds the nested
// `PromptConfig` directly via TanStack Form; the reasoningParse default + absent-round-trips-to-unset
// invariants are exercised by `promptConfigSchema.parse` (the default test above) and the client editor's
// own merge-on-submit round-trip test (tests/client/features/preset/lib/preset-editor-model.test.ts).

// The SillyTavern chat-completions preset importer's sampling mapping (D68-A). `min_p` (was DROPPED with "no
// neo sampling vocab") now maps → params.minP; ST's 0-default = "off" is NOT carried (the top_a/top_k
// sentinel discipline). Quoted keys keep the ST wire snake_case off the naming lint. The importer throws
// unless the blob is a recognizable ST preset (prompts[]/prompt_order) — the empty `prompts` isolates sampling.
function stBlob(fields: Record<string, unknown>): Record<string, unknown> {
  return { prompts: [], ...fields };
}

test("importStChatCompletionPreset (D68-A): a non-default min_p maps onto params.minP", () => {
  const result = importStChatCompletionPreset(stBlob({ min_p: 0.07 }));
  expect(result.config.params.minP).toBe(0.07);
  expect(result.dropped.some((d) => d.field === "min_p")).toBe(false);
});

test("importStChatCompletionPreset (D68-A): ST's default min_p (0 = off) is NOT carried", () => {
  const result = importStChatCompletionPreset(stBlob({ min_p: 0 }));
  expect(result.config.params.minP).toBeUndefined();
  expect(result.dropped.some((d) => d.field === "min_p")).toBe(false);
});

test("importStChatCompletionPreset (D68-A): an absent min_p produces no minP field", () => {
  const result = importStChatCompletionPreset(stBlob({ temperature: 0.8 }));
  expect(result.config.params.minP).toBeUndefined();
  expect(result.config.params.temperature).toBe(0.8);
});

// D66-C (W6 REVERSED): ST `squash_system_messages` maps onto `params.advanced.squashSystemMessages` (the
// preset now owns the knob) instead of being dropped. `group_nudge_prompt` STAYS dropped (room-owned, not
// preset-owned) but its reason string was corrected off the stale "no group chats".
test("importStChatCompletionPreset: squash_system_messages:true maps onto params.advanced.squashSystemMessages", () => {
  const result = importStChatCompletionPreset(stBlob({ squash_system_messages: true }));
  expect(result.config.params.advanced?.squashSystemMessages).toBe(true);
  expect(result.dropped.some((d) => d.field === "squash_system_messages")).toBe(false);
});

test("importStChatCompletionPreset: squash_system_messages:false is NOT carried (ST default = off)", () => {
  const result = importStChatCompletionPreset(stBlob({ squash_system_messages: false }));
  expect(result.config.params.advanced?.squashSystemMessages).toBeUndefined();
  expect(result.dropped.some((d) => d.field === "squash_system_messages")).toBe(false);
});

test("importStChatCompletionPreset: group_nudge_prompt still drops, with the corrected room-owned reason", () => {
  const result = importStChatCompletionPreset(stBlob({ group_nudge_prompt: "poke the group" }));
  const drop = result.dropped.find((d) => d.field === "group_nudge_prompt");
  expect(drop?.reason).toBe("group nudge is room-owned, not preset-owned");
});
