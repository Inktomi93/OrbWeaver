import type { GuidedActionKind, PromptConfig } from "@orb/contracts/preset";
import {
  CONFIG_LIFTS,
  customParametersSchema,
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_PROMPT_CONFIG,
  GUIDED_ACTION_KINDS,
  guidedActionsSchema,
  NEO_PRESET_SCHEMA_KIND,
  PROMPT_CONFIG_SCHEMA_VERSION,
  parseNeoPresetFile,
  parsePromptConfig,
  promptConfigSchema,
  THINK_PREFIX_DEFAULT,
  THINK_SUFFIX_DEFAULT,
  toPresetFormValues,
  toPromptConfig,
  userIntentSchema,
} from "@orb/contracts/preset";
import { expect, test } from "../../support/fixtures";

// Sample values named so the test isn't littered with bare magic numbers (noMagicNumbers).
const SAMPLE_TEMPERATURE = 0.7;
const OUT_OF_RANGE_TEMPERATURE = 3; // userIntentSchema caps temperature at 2
const GUIDED_ACTION_COUNT = 6;
const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;

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
    sections: [
      { type: "marker", id: "d", name: "Description", marker: "char_description", enabled: true },
    ],
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

test("guidedActionsSchema round-trips DEFAULT_GUIDED_ACTIONS over all six actions", () => {
  const parsed = guidedActionsSchema.parse(DEFAULT_GUIDED_ACTIONS);
  expect(parsed).toEqual(DEFAULT_GUIDED_ACTIONS);
  for (const kind of GUIDED_ACTION_KINDS) {
    expect(parsed[kind]).toBeDefined();
  }
});

test("guidedActionsSchema fills opening + continue defaults for a blob predating them (back-compat)", () => {
  const legacy = {
    response: { prompt: "r", role: "system" },
    swipe: { prompt: "s", role: "system" },
    impersonate: { prompt: "i", role: "system" },
    rewrite: { prompt: "w", role: "system" },
  };
  const parsed = guidedActionsSchema.parse(legacy);
  expect(parsed.opening).toEqual(DEFAULT_GUIDED_ACTIONS.opening);
  expect(parsed.continue).toEqual(DEFAULT_GUIDED_ACTIONS.continue);
});

test("GuidedActionKind is the canonical KIND name (the §7.5 axis), not neo's GuidedAction", () => {
  // Type-level pin: a value typed as `GuidedActionKind` is assignable from a tuple member.
  const kind: GuidedActionKind = "impersonate";
  expect(GUIDED_ACTION_KINDS).toContain(kind);
  expect(GUIDED_ACTION_KINDS.length).toBe(GUIDED_ACTION_COUNT);
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
  const parsed = customParametersSchema.parse(
    JSON.parse('{"transforms":["middle-out"],"__proto__":{"polluted":true}}'),
  );
  expect(parsed).toEqual({ transforms: ["middle-out"] });
  expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
});

test("customParametersSchema rejects a `constructor` key (top level and nested)", () => {
  expect(customParametersSchema.safeParse({ constructor: { evil: true } }).success).toBe(false);
  expect(customParametersSchema.safeParse({ nested: { prototype: { evil: true } } }).success).toBe(
    false,
  );
});

// ── Serde: parseNeoPresetFile (STRICT) vs parsePromptConfig (LENIENT) ───────────────────────────────

test("parseNeoPresetFile accepts a well-formed envelope and returns the parsed config", () => {
  const result = parseNeoPresetFile({
    schemaKind: NEO_PRESET_SCHEMA_KIND,
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

test("parseNeoPresetFile is STRICT: a structurally-broken config is REJECTED (errors, not degraded)", () => {
  // `sections` must be an array — a string is invalid. parsePromptConfig would LENIENTLY degrade to
  // DEFAULT; parseNeoPresetFile rejects loudly. This is the load-bearing strict-vs-lenient distinction.
  const brokenConfig: unknown = {
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    sections: "not-an-array",
  };
  const strict = parseNeoPresetFile({
    schemaKind: NEO_PRESET_SCHEMA_KIND,
    schemaVersion: PROMPT_CONFIG_SCHEMA_VERSION,
    name: "Broken",
    config: brokenConfig,
  });
  expect(strict.ok).toBe(false);

  // The SAME broken blob, fed to the lenient parser, degrades to DEFAULT rather than erroring.
  const lenient: PromptConfig = parsePromptConfig(brokenConfig);
  expect(lenient).toEqual(DEFAULT_PROMPT_CONFIG);
});

test("parseNeoPresetFile rejects a non-object and a wrong schemaKind", () => {
  expect(parseNeoPresetFile(null).ok).toBe(false);
  expect(parseNeoPresetFile({ schemaKind: "something-else", config: {} }).ok).toBe(false);
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

test("reasoningParse round-trips through the flat form mappers (server → form → server)", () => {
  const config = toPromptConfig(
    {
      sections: DEFAULT_PROMPT_CONFIG.sections,
      reasoningAutoParse: true,
      reasoningPrefix: "<reason>",
      reasoningSuffix: "</reason>",
    },
    DEFAULT_PROMPT_CONFIG,
  );
  expect(config.reasoningParse).toEqual({
    autoParse: true,
    prefix: "<reason>",
    suffix: "</reason>",
  });
  const form = toPresetFormValues(config);
  expect(form.reasoningAutoParse).toBe(true);
  expect(form.reasoningPrefix).toBe("<reason>");
  expect(form.reasoningSuffix).toBe("</reason>");
});

test("an unengaged reasoningParse (all-default form) is omitted — round-trips to unset", () => {
  const config = toPromptConfig(
    { sections: DEFAULT_PROMPT_CONFIG.sections },
    DEFAULT_PROMPT_CONFIG,
  );
  expect(config.reasoningParse).toBeUndefined();
});
