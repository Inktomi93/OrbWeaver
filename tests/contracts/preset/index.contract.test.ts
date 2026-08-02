// biome-ignore-all lint/style/useNamingConvention: SillyTavern wire field names (snake_case) — `min_p` etc.
// are exactly what an ST preset blob carries (the D68-A import mapping tests below).
import type { GuidedActionKind, PromptConfig } from "@orb/contracts/preset";
import {
  buildPresetFile,
  CONFIG_LIFTS,
  customParametersSchema,
  DEFAULT_FORMAT_STRINGS,
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_MARKER_TEMPLATES,
  DEFAULT_PROMPT_CONFIG,
  GREETING_TRANSFORM_AXES,
  GREETING_TRANSFORMS,
  GUIDED_ACTION_KINDS,
  guidedActionConfigSchema,
  guidedActionsSchema,
  importStChatCompletionPreset,
  PRESET_PROSE_SLOTS,
  PRESET_SCHEMA_KIND,
  PROMPT_CONFIG_SCHEMA_VERSION,
  parsePresetFile,
  parsePromptConfig,
  promptConfigSchema,
  promptConfigWriteSchema,
  QUALITY_LEVELS,
  SIDE_GEN_POSTURES,
  TEMPLATE_DEF_BY_ID,
  TEMPLATE_DEFS,
  TEMPLATE_KINDS,
  THINK_PREFIX_DEFAULT,
  THINK_SUFFIX_DEFAULT,
  userIntentSchema,
  userMacroSchema,
  userMacroValuesSchema,
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
const SCHEMA_VERSION_V5 = 5;

test("promptConfigSchema accepts DEFAULT_PROMPT_CONFIG and parsePromptConfig round-trips it", () => {
  expect(promptConfigSchema.parse(DEFAULT_PROMPT_CONFIG)).toEqual(DEFAULT_PROMPT_CONFIG);
  expect(parsePromptConfig(DEFAULT_PROMPT_CONFIG)).toEqual(DEFAULT_PROMPT_CONFIG);
});

test("the starter arrangement stores NO section templates — the built-in opens fully ghosted (side-eye F-03)", () => {
  // The `custom` cue and the full-weight body derive from `template !== undefined`, so a starter that
  // MATERIALIZES a default as a stored value makes the untouched built-in — the first preset every user
  // meets — open looking edited. The starter framing lives in `DEFAULT_MARKER_TEMPLATES` instead, which is
  // where every other marker's default already lived.
  const stored = DEFAULT_PROMPT_CONFIG.sections.filter((section) => "template" in section && section.template !== undefined);
  expect(stored).toStrictEqual([]);

  // …and the WIRE is unchanged: the assembler resolves `section.template ?? DEFAULT_MARKER_TEMPLATES[marker]`,
  // so the same bytes still go out for the main prompt.
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).toContain("{{char}}");
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).toContain("{{user}}");
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

// v4→v5 (redesign G8): the Default/Custom/SILENT tri-state is retired. Silent's stored form was
// `template: ""` ("render nothing"), which is the ENABLE mechanism wearing a second face — so an empty
// template lifts to `{ template: undefined, enabled: false }`. This is what makes "clear the field = the
// built-in default rides" true for EVERY section rather than only the ones nobody had silenced.
test("CONFIG_LIFTS v4→v5 turns a silenced (template:'') marker into a DISABLED one with no template", () => {
  const liftV4 = CONFIG_LIFTS[SCHEMA_VERSION_V4];
  if (liftV4 === undefined) {
    throw new Error("CONFIG_LIFTS[4] is missing");
  }
  const lifted = liftV4({
    schemaVersion: SCHEMA_VERSION_V4,
    sections: [
      { type: "marker", id: "silent", name: "Scenario", marker: "scenario", role: "system", enabled: true, template: "" },
      { type: "marker", id: "custom", name: "Main", marker: "main_prompt", role: "system", enabled: true, template: "keep me" },
      { type: "literal", id: "lit", name: "Note", role: "system", content: "", enabled: true },
    ],
  });
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V5);
  const sections = lifted["sections"] as Record<string, unknown>[];
  // The silenced marker: the template is GONE (not emptied) and the section is off.
  expect(sections[0]).not.toHaveProperty("template");
  expect(sections[0]?.["enabled"]).toBe(false);
  // A real custom template and a literal with empty CONTENT (a different field) are untouched.
  expect(sections[1]?.["template"]).toBe("keep me");
  expect(sections[1]?.["enabled"]).toBe(true);
  expect(sections[2]?.["enabled"]).toBe(true);
});

test("a stored preset carrying a silenced marker parses forward to a disabled, default-templated one", () => {
  const parsed = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    schemaVersion: SCHEMA_VERSION_V4,
    sections: [{ type: "marker", id: "silent", name: "Scenario", marker: "scenario", role: "system", enabled: true, template: "" }],
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  const section = parsed.sections[0];
  // The key is GONE, not emptied — which is what makes "omit ⇒ the built-in default" the only reading.
  expect(section === undefined ? true : "template" in section).toBe(false);
  expect(section?.enabled).toBe(false);
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

test("the QUALITY dial's OFF arm is the ABSENCE — the enum stays three-membered (owner ruling O-18)", () => {
  // The editor's "Don't use quality" option is a REAL arm, stored as no `quality` key at all: the funnel
  // feeds nothing when the field is absent, and DEFAULT_PROMPT_CONFIG.params ships `{}`. Pinning it here is
  // what stops a later lane from "fixing" the dropdown by adding a fourth `QUALITY_LEVELS` member — which
  // would force an `off` row into QUALITY_EFFORT/QUALITY_SAMPLING and thereby MATERIALIZE a mapping for
  // "no mapping" (the exact shape the G8 tri-state retirement ruled out).
  expect(QUALITY_LEVELS).toEqual(["fast", "balanced", "deep"]);
  expect(userIntentSchema.parse({})).toEqual({});
  expect(userIntentSchema.parse({ quality: undefined }).quality).toBeUndefined();
  expect(userIntentSchema.safeParse({ quality: "off" }).success).toBe(false);
  expect(DEFAULT_PROMPT_CONFIG.params.quality).toBeUndefined();
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

test("guidedActionConfigSchema: a stored per-template `sampling` override is STRIPPED (owner ruling 2026-08-01)", () => {
  // Per-template sampling was DELETED — a guided generation runs at the preset's normal params. A preset blob
  // saved BEFORE the deletion still parses (the non-strict object strips the unknown key rather than degrading
  // the whole preset to defaults), and the parsed action carries prompt + role only.
  const parsed = guidedActionsSchema.parse({
    ...DEFAULT_GUIDED_ACTIONS,
    // FABRICATION-OK: the DELETED field — the point of the test is that a legacy blob carrying it still parses.
    greeting_new: { prompt: "g", role: "system", sampling: { temperature: 1.2, maxOutputTokens: 700 } },
  });
  expect(parsed.greeting_new).toEqual({ prompt: "g", role: "system" });
  for (const kind of GUIDED_ACTION_KINDS) {
    expect(Object.keys(parsed[kind]).toSorted()).toEqual(["prompt", "role"]);
  }
});

test("SIDE_GEN_POSTURES: every kind carries today's exact floor values (byte-identical default encoding)", () => {
  // The floor catalog IS the byte-identical encoding of the OLD hardcoded consts — a user with no preset params
  // gets exactly these values. Caption's EMPTY posture is the honest encoding of a call
  // that historically passed nothing.
  expect(SIDE_GEN_POSTURES.arbiter).toEqual({ temperature: 0.2, maxOutputTokens: 24 });
  expect(SIDE_GEN_POSTURES.quiet_generate).toEqual({ temperature: 0.3, maxOutputTokens: 1024 });
  expect(SIDE_GEN_POSTURES.extract_quiet).toEqual({ temperature: 0.4, maxOutputTokens: 320 });
  expect(SIDE_GEN_POSTURES.compaction).toEqual({ temperature: 0.3 });
  expect(SIDE_GEN_POSTURES.distill).toEqual({ temperature: 0.2, maxOutputTokens: 512 });
  expect(SIDE_GEN_POSTURES.analyze).toEqual({ temperature: 0.3, maxOutputTokens: 400 });
  expect(SIDE_GEN_POSTURES.greeting_studio).toEqual({ temperature: 0.3, maxOutputTokens: 1024 });
  expect(SIDE_GEN_POSTURES.autobg).toEqual({ temperature: 0.2, maxOutputTokens: 32 });
  expect(SIDE_GEN_POSTURES.caption).toEqual({});
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

// G1 (redesign §10): `top_a` was DROPPED with "no neo sampling vocab" while `userIntentSchema.topA` sat two
// hundred lines up — the two halves contradicted, and the drop won. It now maps exactly like `min_p`, and
// ST's own default (0 = off, `SillyTavern/public/scripts/openai.js:418`) is the sentinel NOT carried.
test("importStChatCompletionPreset (G1): a non-default top_a maps onto params.topA and is no longer dropped", () => {
  const result = importStChatCompletionPreset(stBlob({ top_a: 0.2 }));
  expect(result.config.params.topA).toBe(0.2);
  expect(result.dropped.some((d) => d.field === "top_a")).toBe(false);
});

test("importStChatCompletionPreset (G1): ST's default top_a (0 = off) is NOT carried", () => {
  const result = importStChatCompletionPreset(stBlob({ top_a: 0 }));
  expect(result.config.params.topA).toBeUndefined();
  expect(result.dropped.some((d) => d.field === "top_a")).toBe(false);
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

test("importStChatCompletionPreset: impersonation_prompt maps onto formatStrings.impersonateNudge (no longer dropped)", () => {
  const result = importStChatCompletionPreset(stBlob({ impersonation_prompt: "speak as the user" }));
  expect(result.config.formatStrings?.impersonateNudge).toBe("speak as the user");
  expect(result.dropped.some((d) => d.field === "impersonation_prompt")).toBe(false);
});

test("importStChatCompletionPreset: continue_nudge_prompt maps onto formatStrings.continueNudge (no longer dropped)", () => {
  const result = importStChatCompletionPreset(stBlob({ continue_nudge_prompt: "keep going" }));
  expect(result.config.formatStrings?.continueNudge).toBe("keep going");
  expect(result.dropped.some((d) => d.field === "continue_nudge_prompt")).toBe(false);
});

test("importStChatCompletionPreset: a blank prompt slot is omitted (falls back to the built-in default)", () => {
  const result = importStChatCompletionPreset(stBlob({ impersonation_prompt: "   ", continue_nudge_prompt: "" }));
  expect(result.config.formatStrings?.impersonateNudge).toBeUndefined();
  expect(result.config.formatStrings?.continueNudge).toBeUndefined();
});

// ── WAVE MU: user-macro definitions (strict-schema authoring pins) ─────────────────────────────────

test("userMacroSchema fills defaults for a bare {name, body} definition (strict-schema authoring law)", () => {
  const parsed = userMacroSchema.parse({ name: "greet", body: "Hi {{who}}" });
  expect(parsed).toEqual({ name: "greet", description: "", args: [], inputs: [], body: "Hi {{who}}", strict: false });
});

test("userMacroSchema rejects an unparseable macro name (the parser could never tokenize it)", () => {
  expect(userMacroSchema.safeParse({ name: "2bad", body: "x" }).success).toBe(false);
  expect(userMacroSchema.safeParse({ name: "has space", body: "x" }).success).toBe(false);
  expect(userMacroSchema.safeParse({ name: "ok-name_1", body: "x" }).success).toBe(true);
});

test("userMacroSchema rejects optional args that are NOT a contiguous suffix (the arity model's rule)", () => {
  const bad = userMacroSchema.safeParse({
    name: "m",
    body: "x",
    args: [
      { name: "a", type: "string", optional: true },
      { name: "b", type: "string", optional: false },
    ],
  });
  expect(bad.success).toBe(false);
  const ok = userMacroSchema.safeParse({
    name: "m",
    body: "x",
    args: [
      { name: "a", type: "string", optional: false },
      { name: "b", type: "string", optional: true },
    ],
  });
  expect(ok.success).toBe(true);
});

test("userMacroSchema fills every typed-input knob default (a def predating a knob self-heals)", () => {
  const parsed = userMacroSchema.parse({ name: "m", body: "{{x}}", inputs: [{ kind: "random-pick", name: "x" }] });
  expect(parsed.inputs[0]).toEqual({
    kind: "random-pick",
    name: "x",
    label: "",
    options: [],
    separator: ", ",
    onValue: "true",
    offValue: "",
    defaultValue: "",
  });
});

test("promptConfig.userMacros defaults to [] (a pre-MU blob parses — additive, no version bump)", () => {
  const parsed = parsePromptConfig({ schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION, sections: [] });
  expect(parsed.userMacros).toEqual([]);
});

test("userMacroValuesSchema accepts the string | boolean | string[] value union (the #24 wire bag)", () => {
  const parsed = userMacroValuesSchema.parse({ m: { pov: "first", grim: true, themes: ["war", "loss"] } });
  expect(parsed).toEqual({ m: { pov: "first", grim: true, themes: ["war", "loss"] } });
  expect(userMacroValuesSchema.safeParse({ m: { bad: { nested: 1 } } }).success).toBe(false);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// PRESET-1 — the template registry (§6.6 / G11), the G9/G10 additions, and the carrier-token write guard.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test("TEMPLATE_DEFS covers every guided kind + every ACTION-shaped format string (wiFormat excluded by §6.6)", () => {
  const covered: string[] = TEMPLATE_DEFS.map((def) => def.id);
  // The module's tsc guard proves NOTHING IS MISSING; this proves nothing EXTRA and nothing DOUBLED — a
  // duplicate row would silently render two Actions rows for one slot.
  const expected = [...GUIDED_ACTION_KINDS, ...Object.keys(DEFAULT_FORMAT_STRINGS).filter((key) => key !== "wiFormat")];
  expect([...covered].sort()).toStrictEqual([...expected].sort());
  expect(new Set(covered).size).toBe(covered.length);
  // `wiFormat` frames world-info ENTRIES and is edited in the WI marker's body — a row here would mint the
  // second home the §6.5 census exists to prevent.
  expect(covered).not.toContain("wiFormat");
});

test("every TemplateDef points at a REAL prose slot, and its kind is a declared TEMPLATE_KIND", () => {
  // A typo'd slot id would ghost nothing in that template's drill-in, silently.
  const unresolvedSlots = TEMPLATE_DEFS.filter((def) => def.defaultSlot !== undefined && PRESET_PROSE_SLOTS[def.defaultSlot] === undefined);
  expect(unresolvedSlots).toStrictEqual([]);
  // `newChatMarker` is the ONE def allowed to carry no slot: it ships blank, and a PROSE-1 slot is authored
  // bytes. Any other slot-less def would be a default nobody can see.
  expect(TEMPLATE_DEFS.filter((def) => def.defaultSlot === undefined).map((def) => def.id)).toStrictEqual(["newChatMarker"]);
  expect(TEMPLATE_DEFS.filter((def) => !TEMPLATE_KINDS.includes(def.kind))).toStrictEqual([]);
  expect(TEMPLATE_DEFS.filter((def) => def.label.length === 0 || def.fires.length === 0)).toStrictEqual([]);
});

test("the by-id lookup is total over the registry (the client renders a row without a fallback)", () => {
  for (const def of TEMPLATE_DEFS) {
    expect(TEMPLATE_DEF_BY_ID[def.id]).toBe(def);
  }
});

test("a guided template declares role + depth; a nudge declares neither (text-only BY DERIVATION)", () => {
  expect(TEMPLATE_DEF_BY_ID.response.caps.map((cap) => cap.kind)).toStrictEqual(["role", "depth", "tokens"]);
  expect(TEMPLATE_DEF_BY_ID.continueNudge.caps).toStrictEqual([]);
  expect(TEMPLATE_DEF_BY_ID.newChatMarker.caps).toStrictEqual([]);
});

// ── G10: the guided-action `depth` is byte-compatible with every stored blob ───────────────────────
test("G10: an absent guided `depth` stays ABSENT after parse (today's fixed tail becomes the default)", () => {
  const parsed = guidedActionsSchema.parse(DEFAULT_GUIDED_ACTIONS);
  expect("depth" in parsed.response).toBe(false);
  // The whole DEFAULT config round-trips to the SAME bytes it had before the field existed.
  expect(JSON.stringify(parsePromptConfig(DEFAULT_PROMPT_CONFIG).guidedActions)).toBe(JSON.stringify(DEFAULT_GUIDED_ACTIONS));
});

test("G10: an explicit guided `depth` survives the parse and is bounded", () => {
  const parsed = guidedActionsSchema.parse({ ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "x", role: "user", depth: 3 } });
  expect(parsed.response.depth).toBe(3);
  expect(guidedActionConfigSchema.safeParse({ prompt: "x", depth: -1 }).success).toBe(false);
});

// ── G9: newChatMarker ships BLANK, so nothing changes until a preset sets it ───────────────────────
test("G9: newChatMarker's shipped default is blank (byte-identical to the pre-G9 assembler behavior)", () => {
  expect(DEFAULT_FORMAT_STRINGS.newChatMarker).toBe("");
  expect(DEFAULT_PROMPT_CONFIG.formatStrings?.newChatMarker).toBe("");
});

test("G9: a stored blob predating the key parses, and the key stays absent (never invented on read)", () => {
  const parsed = parsePromptConfig({
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections: [],
    formatStrings: { wiFormat: "{{entry}}" },
  });
  expect(parsed.formatStrings?.newChatMarker).toBeUndefined();
});

// ── The OWNER GUARD (2026-08-02): a carrier format string may not silently drop its payload ────────
test("the write boundary REFUSES a wiFormat that dropped {{entry}}, naming the token", () => {
  const result = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    formatStrings: { wiFormat: "Lore: (nothing here)" },
  });
  expect(result.success).toBe(false);
  const issue = result.error?.issues[0];
  expect(issue?.path).toStrictEqual(["formatStrings", "wiFormat"]);
  expect(issue?.message).toContain("{{entry}}");
});

test("blank-means-default survives the guard: an empty (or absent) wiFormat is accepted", () => {
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "" } }).success).toBe(true);
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "   " } }).success).toBe(true);
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: {} }).success).toBe(true);
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "Lore: {{entry}}" } }).success).toBe(true);
});

test("the guard is a WRITE boundary only — a stored broken wrapper still LOADS (never degraded to default)", () => {
  // PROSE-1's `requiredMacros` posture stays a lint, and a read-side refusal would nuke the WHOLE preset
  // (parsePromptConfig degrades a failed parse to DEFAULT_PROMPT_CONFIG) over one bad field.
  const stored = { ...DEFAULT_PROMPT_CONFIG, formatStrings: { wiFormat: "broken" } };
  const parsed = parsePromptConfig(stored);
  expect(parsed.formatStrings?.wiFormat).toBe("broken");
  expect(parsed.sections).toHaveLength(DEFAULT_PROMPT_CONFIG.sections.length);
});

test("a NUDGE missing its recommended macros is NOT refused (a lint, never a block — PROSE-1 §6.3)", () => {
  const result = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    formatStrings: { impersonateNudge: "Write as me." },
  });
  expect(result.success).toBe(true);
});
