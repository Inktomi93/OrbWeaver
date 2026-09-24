// are exactly what an ST preset blob carries (the D68-A import mapping tests below).

import { BELT_OWNED_BODY_KEYS, isBeltOwnedBodyKey } from "@orb/contracts/inference";
import type { GuidedActionKind, PromptConfig, TemplateDef } from "@orb/contracts/preset";
import {
  ASSEMBLE_POST_PROCESS_ORDER,
  buildPresetFile,
  CONFIG_LIFTS,
  DEFAULT_FORMAT_STRINGS,
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_MARKER_TEMPLATES,
  DEFAULT_PROMPT_CONFIG,
  GREETING_TRANSFORM_AXES,
  GREETING_TRANSFORM_IDS,
  GREETING_TRANSFORMS,
  GUIDED_ACTION_KINDS,
  guidedActionConfigSchema,
  guidedActionsSchema,
  HOST_OWNED_CLAUDE_ENV_KEYS,
  importStChatCompletionPreset,
  MAX_INJECTION_TEMPLATE_LENGTH,
  NARRATOR_MAIN_PROMPT_TEMPLATE,
  PRESET_FORMAT_SLOT_IDS,
  PRESET_SCHEMA_KIND,
  PROMPT_CONFIG_SCHEMA_VERSION,
  PROMPT_LANE_STEPS,
  parsePresetFile,
  parsePromptConfig,
  pipelineStepKey,
  promptConfigSchema,
  promptConfigWriteSchema,
  QUALITY_LEVELS,
  RECEIVE_POST_PROCESS_ORDER,
  REPLY_LANE_STEPS,
  REWRITE_TOGGLE_IDS,
  REWRITE_TOGGLES,
  SIDE_GEN_POSTURES,
  TEMPLATE_CLUSTERS,
  TEMPLATE_DEF_BY_ID,
  TEMPLATE_DEFS,
  TEMPLATE_KINDS,
  THINK_PREFIX_DEFAULT,
  THINK_SUFFIX_DEFAULT,
  tryImportStChatCompletionPreset,
  userIntentSchema,
  userMacroSchema,
  userMacroValuesSchema,
} from "@orb/contracts/preset";
import { PRESET_PROSE_SLOT_IDS, PROSE_SLOTS } from "@orb/contracts/prose";
// The cap is read from its ONE home (`@orb/kit/injection`), never re-spelled as a literal here.
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import { expect, test } from "../../support/fixtures.ts";

// Sample values named so the test isn't littered with bare magic numbers (noMagicNumbers).
const SAMPLE_TEMPERATURE = 0.7;
const OUT_OF_RANGE_TEMPERATURE = 3; // userIntentSchema caps temperature at 2
const GUIDED_ACTION_COUNT = 8;
const SCHEMA_VERSION_V1 = 1;
const SCHEMA_VERSION_V2 = 2;
const SCHEMA_VERSION_V3 = 3;
const SCHEMA_VERSION_V4 = 4;
const SCHEMA_VERSION_V5 = 5;
const SCHEMA_VERSION_V6 = 6;
const SCHEMA_VERSION_V7 = 7;

/** Code-unit order — the DEFAULT `toSorted()` ordering, spelled explicitly because `useArraySortCompare`
 *  (rightly) refuses a comparator-less sort on an annotated array. Both sides of a set-equality assertion
 *  sort through it, so the ordering only has to be TOTAL and identical, never locale-aware. */
function byCodeUnit(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

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

test("the two main_prompt defaults differ ONLY in the perspective framing — the address clause is verbatim in both", () => {
  // The narrator sibling is a second TEXT, never a second rule: the vocative defect the address clause fixes
  // (a default persona's name is a LABEL, so "Goodnight, You.") is a property of `{{user}}`, not of the
  // turn's mode, and the clause is owner-ruled (2026-08-02). WHICH text a turn gets is decided once, in
  // `assembly/assemble.ts` templateFor — nothing here re-derives it.
  const addressClause = "Address {{user}} in the second person; use their name only when it is one they have chosen for themselves.";
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).toContain(addressClause);
  expect(NARRATOR_MAIN_PROMPT_TEMPLATE).toContain(addressClause);
  // The narrator text carries the joined cast as its VOICES, never as one perspective to write.
  expect(NARRATOR_MAIN_PROMPT_TEMPLATE).toContain("{{char}}");
  expect(NARRATOR_MAIN_PROMPT_TEMPLATE).not.toContain("perspective only");
  // Owner ruling: the per-speaker text names no single perspective either — the round cue names the speaker.
  expect(DEFAULT_MARKER_TEMPLATES.main_prompt).not.toContain("perspective only");
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

// v5→v6 (owner ruling 2026-08-02, resolving D6): `params.maxBudgetUsd` is DELETED — it had no editor on any
// surface, so nobody could set, read or clear it. The LIFT is the load-bearing half: `userIntentSchema` is
// `.strict()` and `promptConfigSchema` `.catch({})`s the whole params blob on failure, so a silent field
// removal would make ONE stored budget key wipe every other knob on that preset.
test("CONFIG_LIFTS v5→v6 strips the retired maxBudgetUsd knob and leaves every sibling knob intact", () => {
  const liftV5 = CONFIG_LIFTS[SCHEMA_VERSION_V5];
  if (liftV5 === undefined) {
    throw new Error("CONFIG_LIFTS[5] is missing");
  }
  const lifted = liftV5({
    schemaVersion: SCHEMA_VERSION_V5,
    params: { maxBudgetUsd: 5, temperature: SAMPLE_TEMPERATURE, quality: "deep" },
  });
  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V6);
  expect(lifted["params"]).toEqual({ temperature: SAMPLE_TEMPERATURE, quality: "deep" });

  // A blob that never carried it passes through untouched (by reference — the shape every lift here uses).
  const params = { temperature: SAMPLE_TEMPERATURE };
  expect(liftV5({ schemaVersion: SCHEMA_VERSION_V5, params })["params"]).toBe(params);
});

test("a stored preset carrying maxBudgetUsd parses forward WITHOUT losing its other params (the .catch({}) trap)", () => {
  // Without the lift this whole blob's params degrade to `{}` — the strict schema rejects the unknown key
  // and the catch swallows the entire object. That is the regression this test exists to make loud.
  const parsed = parsePromptConfig({
    ...DEFAULT_PROMPT_CONFIG,
    schemaVersion: SCHEMA_VERSION_V5,
    params: { maxBudgetUsd: 12.5, temperature: SAMPLE_TEMPERATURE, quality: "deep" },
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(parsed.params).toEqual({ temperature: SAMPLE_TEMPERATURE, quality: "deep" });
  expect("maxBudgetUsd" in parsed.params).toBe(false);
});

// v6→v7 (issue #80): the `databank` marker + its default section. STAMP-ONLY — the shipped arrangement
// gained a section, but a STORED one is an author's document and is never rewritten (the warning chip is
// what covers a preset that names no slot). The bump exists so the boot seeder reseeds the OWNERLESS rows.
test("CONFIG_LIFTS v6→v7 stamps the version and rewrites NOTHING of a user-owned config", () => {
  const liftV6 = CONFIG_LIFTS[SCHEMA_VERSION_V6];
  if (liftV6 === undefined) {
    throw new Error("CONFIG_LIFTS[6] is missing");
  }
  const stored = {
    schemaVersion: SCHEMA_VERSION_V6,
    // A hand-built arrangement that names no databank slot — exactly the config the chip warns about, and
    // exactly the config a lift must not "helpfully" repair.
    sections: [{ type: "marker", id: "main", name: "Mine", marker: "main_prompt", role: "system", enabled: true, template: "MY FRAMING" }],
    params: { temperature: SAMPLE_TEMPERATURE },
    variables: [{ name: "pov", question: "POV?", options: [{ label: "first", value: "first" }] }],
    prose: { "preset.guided.opening": { text: "mine", baseVersion: 1 } },
  };
  const before = JSON.stringify(stored);
  const lifted = liftV6(stored);

  expect(lifted["schemaVersion"]).toBe(SCHEMA_VERSION_V7);
  // Every other key is the SAME VALUE BY REFERENCE — nothing was rebuilt, reordered or defaulted.
  expect(lifted["sections"]).toBe(stored.sections);
  expect(lifted["params"]).toBe(stored.params);
  expect(lifted["variables"]).toBe(stored.variables);
  expect(lifted["prose"]).toBe(stored.prose);
  // …and the lift did not mutate the input blob it was handed.
  expect(JSON.stringify(stored)).toBe(before);
});

test("a v6 user preset parses forward slotless — the databank section is NOT injected into stored configs", () => {
  const parsed = parsePromptConfig({
    schemaVersion: SCHEMA_VERSION_V6,
    sections: [{ type: "marker", id: "main", name: "Mine", marker: "main_prompt", role: "system", enabled: true, template: "MY FRAMING" }],
    params: { temperature: SAMPLE_TEMPERATURE },
    prose: {},
  });
  expect(parsed.schemaVersion).toBe(PROMPT_CONFIG_SCHEMA_VERSION);
  expect(parsed.sections.map((section) => section.id)).toEqual(["main"]);
});

// The other half of the bump: the SHIPPED arrangement must actually carry the slot, or issue #80 is only
// half-fixed — the gather retrieves and the prompt still never names the value.
test("the built-in default arrangement places the databank slot, in the dynamic half after memory", () => {
  const ids = DEFAULT_PROMPT_CONFIG.sections.map((section) => section.id);
  expect(ids).toContain("databank");
  expect(ids.indexOf("databank")).toBe(ids.indexOf("memory") + 1);
  const databank = DEFAULT_PROMPT_CONFIG.sections.find((section) => section.id === "databank");
  expect(databank).toMatchObject({ type: "marker", marker: "databank", enabled: true });
  // The section ships UNSET, so the framing is the marker default (the F-03 rule) — and that default is
  // where the ST `file_template_db` wrapper prose lives, never in databank's value.
  expect(databank).not.toHaveProperty("template");
  expect(DEFAULT_MARKER_TEMPLATES.databank).toContain("{{databank}}");
  expect(DEFAULT_MARKER_TEMPLATES.databank).toContain("Related information:");
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

test("userIntentSchema admits only the Claude runtime knob namespace into claudeEnv (allowlist, not a deny set)", () => {
  for (const key of [
    // Loader / search / interpreter injection (the original deny set — still refused).
    "NODE_OPTIONS",
    "node_path",
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
    "BASH_ENV",
    "PYTHONPATH",
    "RUBYOPT",
    "PERL5OPT",
    "HTTP_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    // #1472: process-critical variables the deny set never named. PATH picks the child's BINARY and HOME
    // picks where it reads config + credentials, so a preset that could set them owned the spawn.
    "HOME",
    "PATH",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "USER",
    "LOGNAME",
    // …and the next names nobody would have enumerated either.
    "LD_AUDIT",
    "GIT_SSH_COMMAND",
    "JAVA_TOOL_OPTIONS",
    "PYTHONSTARTUP",
    // Auth/routing is runner-owned: the ANTHROPIC namespace is not a preset's to set.
    "ANTHROPIC_MODEL",
    // Env keys are case-sensitive — a lowercase spelling is a different key, and not an admitted one.
    "claude_code_custom_knob",
  ]) {
    const parsed = userIntentSchema.safeParse({ advanced: { claudeEnv: { [key]: "attacker-controlled" } } });
    expect(parsed.success, `${key} must be rejected at the write schema`).toBe(false);
  }
});

// #1536: the `CLAUDE_*` namespace also holds the app's OWN deploy pins (isolation + the ./CLAUDE.md
// suppression). Those are host decisions, not generation knobs, so the write schema refuses them by name —
// the builder's `RESERVED_CLAUDE_ENV_KEYS` drop is the second belt, not the only one.
test("userIntentSchema refuses the host-owned isolation pins even though they are in the CLAUDE namespace", () => {
  for (const key of HOST_OWNED_CLAUDE_ENV_KEYS) {
    const set = userIntentSchema.safeParse({ advanced: { claudeEnv: { [key]: "0" } } });
    expect(set.success, `${key} must be rejected at the write schema`).toBe(false);
    const unset = userIntentSchema.safeParse({ advanced: { claudeEnv: { [key]: null } } });
    expect(unset.success, `${key} must not be UNSETTABLE at the write schema either`).toBe(false);
  }
});

// POSITIVE CONTROL for the allowlist — a schema that rejected everything would pass the test above.
test("userIntentSchema accepts a CLAUDE-namespace knob and the two non-prefixed runtime knobs", () => {
  for (const key of ["CLAUDE_CODE_CUSTOM_KNOB", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "MAX_THINKING_TOKENS", "DISABLE_AUTO_COMPACT"]) {
    const parsed = userIntentSchema.safeParse({ advanced: { claudeEnv: { [key]: "1" } } });
    expect(parsed.success, `${key} must be accepted at the write schema`).toBe(true);
  }
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
    // The DELETED field is deliberate: the point is that a legacy blob carrying it still parses.
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
  expect(SIDE_GEN_POSTURES.rule_analysis).toEqual({ temperature: 0.3, maxOutputTokens: 1024 });
  expect(SIDE_GEN_POSTURES.caption).toEqual({ temperature: 0.2, maxOutputTokens: 512 });
  expect(SIDE_GEN_POSTURES.theme_name).toEqual({ temperature: 0.3, maxOutputTokens: 24 });
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

// ── The one-click steer catalogs (census 53-73) — registry-as-data the client renders chips from blind,
// whose FRAGMENT BYTES are prose slots since the templating fork's ARM B (owner 2026-08-09). These pin the
// catalog↔slot join both seams walk: a row pointing at a missing/blank/macro-carrying slot would compose a
// broken steer, and neither the wire enum nor the registry coverage test can see that.

test("GREETING_TRANSFORMS has stable unique ids and every axis is a declared GREETING_TRANSFORM_AXES member", () => {
  const ids = GREETING_TRANSFORMS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length); // no dup ids
  expect(ids).toStrictEqual([...GREETING_TRANSFORM_IDS]); // the wire vocabulary IS the catalog, in order
  for (const t of GREETING_TRANSFORMS) {
    expect(GREETING_TRANSFORM_AXES).toContain(t.axis);
    expect(t.label.length).toBeGreaterThan(0);
  }
});

test("GREETING_TRANSFORMS covers all four axes (perspective/tense/style/gender)", () => {
  for (const axis of GREETING_TRANSFORM_AXES) {
    expect(GREETING_TRANSFORMS.some((t) => t.axis === axis)).toBe(true);
  }
});

test("REWRITE_TOGGLES has stable unique ids matching the wire vocabulary, in order", () => {
  const ids = REWRITE_TOGGLES.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toStrictEqual([...REWRITE_TOGGLE_IDS]);
  for (const t of REWRITE_TOGGLES) {
    expect(t.label.length).toBeGreaterThan(0);
  }
});

test("every one-click steer row points at a REAL preset-homed slot with authored, macro-free bytes", () => {
  // The composed steer becomes the template's {{input}}, which is macro-neutralized — a {{…}} in a fragment
  // would render as literal braces. The catalogs spell "the user"/"the character" in plain words instead.
  // (`macros:"none"` states the same fact in the type; this asserts the BYTES actually obey it.)
  for (const row of [...REWRITE_TOGGLES, ...GREETING_TRANSFORMS]) {
    const slot = PROSE_SLOTS[row.slot];
    expect(slot, row.slot).toBeDefined();
    expect(slot.home, row.slot).toBe("preset");
    expect(slot.macros, row.slot).toBe("none");
    expect(slot.text.length, row.slot).toBeGreaterThan(0);
    expect(slot.text, row.slot).not.toContain("{{");
    // Host-editable: preset-homed and NOT legacy-adapted, so it is in the `promptConfig.prose` editable set
    // (which is what gives it a Templates-tab row — the two-sided coverage lives in tests/contracts/prose/).
    expect(PRESET_PROSE_SLOT_IDS, row.slot).toContain(row.slot);
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

test("the belt denylist is EXACTLY the eight body keys the wire owns (D143a, re-homed beside EndpointFeatures — §8.1) — both readers ask this one list", () => {
  // The vllm surface drops these before the merge and the preset editor warns on them at authoring time; a
  // member added or removed here silently changes BOTH the wire and what the editor promises.
  // The last two joined with the 2026-08-19 assistant-prefill flip: the surface decides the continuation pair
  // from the capability + the assembled tail, and on the (common) no-prefill arm it emits NEITHER key — so
  // precedence has nothing to win the collision with and a preset value would ride unopposed.
  expect([...BELT_OWNED_BODY_KEYS]).toEqual([
    "truncate_prompt_tokens",
    "truncation_side",
    "stream",
    "stream_options",
    "model",
    "messages",
    "continue_final_message",
    "add_generation_prompt",
  ]);
  expect(BELT_OWNED_BODY_KEYS.every((key) => isBeltOwnedBodyKey(key))).toBe(true);
  // A sampler that RIDES the escape hatch is not belt-owned — the whole point of the list being narrow.
  expect(isBeltOwnedBodyKey("dry_multiplier")).toBe(false);
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
  // The MANDATORY per-entity structural guarantee: the build + parse
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
// the mappers. The client preset editor now binds the nested
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

/** The imported depth of the first section (a custom ST prompt maps to a LITERAL section). */
function firstInjectDepth(config: PromptConfig): number | undefined {
  const section = config.sections[0];
  return section?.type === "literal" ? section.inject?.depth : undefined;
}

/** A minimal ST preset carrying ONE absolute-depth prompt — the shape the injection bounds ride on. */
function stInjectedPreset(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    prompts: [{ identifier: "a", name: "A", content: "You are helpful.", role: "system", injection_position: 1, enabled: true, ...fields }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "a", enabled: true }] }],
  };
}

// #1363 — one out-of-range foreign value used to replace the WHOLE imported preset with
// DEFAULT_PROMPT_CONFIG while every success signal lied: no throw, `dropped` empty, and `sectionCount`
// reporting the sections the importer BUILT (2) rather than the default's (13). Per-value clamp, recorded.
test("importStChatCompletionPreset (#1363): an out-of-range injection_depth clamps ONE field, never the config", () => {
  const atCap = importStChatCompletionPreset(stInjectedPreset({ injection_depth: MAX_INJECTION_DEPTH }));
  expect(atCap.config).not.toEqual(DEFAULT_PROMPT_CONFIG);
  expect(atCap.dropped).toEqual([]);
  expect(firstInjectDepth(atCap.config)).toBe(MAX_INJECTION_DEPTH);

  const overCap = importStChatCompletionPreset(stInjectedPreset({ injection_depth: MAX_INJECTION_DEPTH + 1 }));
  expect(overCap.config).not.toEqual(DEFAULT_PROMPT_CONFIG);
  expect(overCap.config.sections).toHaveLength(1);
  expect(firstInjectDepth(overCap.config)).toBe(MAX_INJECTION_DEPTH);
  // The clamp is REPORTED — `dropped` is the list whose whole job is telling the user what was lost.
  expect(overCap.dropped).toHaveLength(1);
  expect(overCap.dropped[0]?.field).toBe("prompts.a.injection_depth");
});

test("importStChatCompletionPreset (#1363): sectionCount describes the RETURNED config", () => {
  const result = importStChatCompletionPreset(stInjectedPreset({ injection_depth: -5 }));
  expect(result.sectionCount).toBe(result.config.sections.length);
  expect(firstInjectDepth(result.config)).toBe(0);
  expect(result.dropped[0]?.field).toBe("prompts.a.injection_depth");
});

// #1462 — `plainMarkerSection` carried no `trigger`, so `sectionFromPrompt` DROPPED an imported
// `injection_trigger` for the three plain markers (World Info before/after, Chat History) while carrying it
// for every other prompt. ST sets that field on every prompt-manager entry, and the parity oracle is a FLOOR,
// so this is a gap, not a boundary. `injection_position`/`injection_depth` stay dropped for a plain marker on
// purpose: `assembly/assemble::injectionDepthFor` refuses those three a depth, so orb has no reader for them.
test("importStChatCompletionPreset (#1462): a PLAIN marker's injection_trigger survives the import", () => {
  const result = importStChatCompletionPreset({
    prompts: [
      { identifier: "worldInfoBefore", name: "World Info (before)", marker: true, injection_trigger: ["swipe", "continue"] },
      { identifier: "chatHistory", name: "Chat History", marker: true, injection_trigger: ["normal"] },
    ],
    prompt_order: [
      {
        character_id: 100_001,
        order: [
          { identifier: "worldInfoBefore", enabled: true },
          { identifier: "chatHistory", enabled: true },
        ],
      },
    ],
  });

  const anchor = result.config.sections.find((section) => section.type === "marker" && section.marker === "world_info_before");
  const pivot = result.config.sections.find((section) => section.type === "marker" && section.marker === "chat_history");
  expect(anchor === undefined || !("trigger" in anchor) ? undefined : anchor.trigger).toEqual(["swipe", "continue"]);
  expect(pivot === undefined || !("trigger" in pivot) ? undefined : pivot.trigger).toEqual(["normal"]);
  // A plain marker still stores no placement — there is nothing in orb that could honour one.
  expect(anchor === undefined ? true : "inject" in anchor).toBe(false);
});

test("importStChatCompletionPreset (#1462): a plain marker with NO injection_trigger stays unset, not empty", () => {
  const result = importStChatCompletionPreset({
    prompts: [{ identifier: "worldInfoBefore", name: "World Info (before)", marker: true }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "worldInfoBefore", enabled: true }] }],
  });

  const anchor = result.config.sections[0];
  expect(anchor === undefined ? true : "trigger" in anchor).toBe(false);
});

test("a plain marker's trigger SURVIVES the preset file round-trip (buildPresetFile → parsePresetFile)", () => {
  const imported = importStChatCompletionPreset({
    prompts: [{ identifier: "worldInfoAfter", name: "World Info (after)", marker: true, injection_trigger: ["quiet"] }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "worldInfoAfter", enabled: true }] }],
  }).config;
  const parsed = parsePresetFile(buildPresetFile("round-trip", imported));

  expect(parsed.ok).toBe(true);
  expect(parsed.ok ? parsed.config.sections : []).toEqual(imported.sections);
});

// #1580 — the reader's TWO refusals were one bare Error, so the import door could only say "the reader
// stopped" for a file the reader had RECOGNISED and then refused. The typed outcome carries the difference;
// the throwing wrapper keeps both messages byte-for-byte, so no caller's copy moved.
/** A RECOGNISED ST preset (prompts + prompt_order) whose literal section blows the schema's content bound —
 *  #1363's intact-parse belt refuses it AFTER recognition. */
function stRefusedPreset(): Record<string, unknown> {
  return {
    prompts: [{ identifier: "lore-dump", name: "Lore dump", content: "x".repeat(100_001) }],
    prompt_order: [{ character_id: 100_001, order: [{ identifier: "lore-dump", enabled: true }] }],
  };
}

test("tryImportStChatCompletionPreset (#1580): a RECOGNISED preset refused by the intact belt answers recognised:true", () => {
  const outcome = tryImportStChatCompletionPreset(stRefusedPreset());
  expect(outcome.ok).toBe(false);
  // The discriminant is the whole point: this file IS a SillyTavern preset, and the door must be able to say so.
  expect(outcome).toMatchObject({ ok: false, recognised: true });
  expect(outcome.ok ? "" : outcome.reason).toContain("This SillyTavern preset mapped to a config orb cannot store");
  expect(outcome.ok ? "" : outcome.reason).toContain("(schema-rejected)");
  // #1592 — the belt now NAMES which prompt and which field blew the bound, so the operator can tell which
  // prompt to shrink instead of reading the bare failure word.
  expect(outcome.ok ? "" : outcome.reason).toContain('the ST prompt "lore-dump" `content`: Too big: expected string to have <=100000 characters');
});

test("tryImportStChatCompletionPreset (#1580): an object the reader never claims answers recognised:false", () => {
  const outcome = tryImportStChatCompletionPreset({ note: "some other tool's export", items: [1, 2, 3] });
  expect(outcome).toMatchObject({ ok: false, recognised: false });
  expect(outcome.ok ? "" : outcome.reason).toBe("Not a SillyTavern Chat Completion preset (expected prompts[] + prompt_order).");
});

test("tryImportStChatCompletionPreset (#1580): a good preset answers ok:true with the wrapper's EXACT result", () => {
  const outcome = tryImportStChatCompletionPreset(stInjectedPreset({ injection_depth: 3 }));
  expect(outcome.ok).toBe(true);
  // One mapper, one result — the wrapper adds a throw and nothing else.
  expect(outcome.ok ? outcome.result : null).toEqual(importStChatCompletionPreset(stInjectedPreset({ injection_depth: 3 })));
});

test("importStChatCompletionPreset (#1580): the throwing wrapper still throws BOTH refusals, verbatim", () => {
  expect(() => importStChatCompletionPreset({ note: "not st" })).toThrow("Not a SillyTavern Chat Completion preset (expected prompts[] + prompt_order).");
  expect(() => importStChatCompletionPreset(stRefusedPreset())).toThrow(/^This SillyTavern preset mapped to a config orb cannot store/u);
});

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

test("importStChatCompletionPreset: new_chat_prompt maps onto formatStrings.newChatMarker (2026-08-15 re-judgment)", () => {
  // The seat postdates the old "no new-chat injection slot" drop row: `newChatMarker` is the history-START
  // boundary the assembler actually reads (`assembly/context.ts` newChatMarkerCandidate / G9).
  const result = importStChatCompletionPreset(stBlob({ new_chat_prompt: "[Start a new Chat]" }));
  expect(result.config.formatStrings?.newChatMarker).toBe("[Start a new Chat]");
  expect(result.dropped.some((d) => d.field === "new_chat_prompt")).toBe(false);
});

test("importStChatCompletionPreset: new_group_chat_prompt still drops — orb's ONE boundary is room-agnostic", () => {
  // ST fires this string only in GROUP chats; orb's `newChatMarker` fires in every room. Mapping a
  // group-only boundary onto the room-agnostic key would inject group framing into every SOLO chat —
  // a behavior change, not a translation — so the drop stays, with the truthful reason.
  const result = importStChatCompletionPreset(stBlob({ new_group_chat_prompt: "a fresh group scene" }));
  const drop = result.dropped.find((d) => d.field === "new_group_chat_prompt");
  expect(drop?.reason).toBe(
    "orb's one history-START boundary (newChatMarker) is room-agnostic and maps from new_chat_prompt; a group-only boundary has no conditional seat",
  );
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
  // Three arms since the 2026-08-07 ruling (the turn-wire FRAMINGS joined the tab): guided kinds · the
  // ACTION-shaped format strings · `PRESET_PROSE_SLOT_IDS`. The framings' own two-sided coverage lives in
  // `tests/contracts/prose` (it needs `home`, which is `#prose` data); what THIS row still owns is the
  // no-extra / no-duplicate half over the whole table.
  const expected = [...GUIDED_ACTION_KINDS, ...Object.keys(DEFAULT_FORMAT_STRINGS).filter((key) => key !== "wiFormat"), ...PRESET_PROSE_SLOT_IDS];
  expect(covered.toSorted(byCodeUnit)).toStrictEqual(expected.toSorted(byCodeUnit));
  expect(new Set(covered).size).toBe(covered.length);
  // `wiFormat` frames world-info ENTRIES and is edited in the WI marker's body — a row here would mint the
  // second home the §6.5 census exists to prevent.
  expect(covered).not.toContain("wiFormat");
});

test("every TemplateDef points at a REAL prose slot, and its kind is a declared TEMPLATE_KIND", () => {
  // A typo'd slot id would ghost nothing in that template's drill-in, silently. `defaultSlot` widened to the
  // whole `ProseSlotId` union with the framing rows, so the resolution target is the COMPOSED registry — a
  // guided row still points into `PRESET_PROSE_SLOTS`, a framing row into its own `chat.*` table row.
  const unresolvedSlots = TEMPLATE_DEFS.filter((def) => def.defaultSlot !== undefined && PROSE_SLOTS[def.defaultSlot] === undefined);
  expect(unresolvedSlots).toStrictEqual([]);
  // Every def ghosts real bytes: a slot-less def would be a default nobody can see.
  expect(TEMPLATE_DEF_BY_ID.newChatMarker.defaultSlot).toBe("preset.format.newChatMarker");
  expect(TEMPLATE_DEFS.filter((def) => !TEMPLATE_KINDS.includes(def.kind))).toStrictEqual([]);
  expect(TEMPLATE_DEFS.filter((def) => def.label.length === 0 || def.fires.length === 0)).toStrictEqual([]);
});

test("the by-id lookup is total over the registry (the client renders a row without a fallback)", () => {
  for (const def of TEMPLATE_DEFS) {
    expect(TEMPLATE_DEF_BY_ID[def.id]).toBe(def);
  }
});

test("clusters pair with the banded kind TWO-SIDEDLY: every extract row declares one, nothing else does", () => {
  // The Actions-tab IA: `extract` renders as
  // collapsed disclosure bands, so an extract row WITHOUT a cluster would render mis-filed above the bands —
  // and a clustered row of an un-banded kind would declare a band no renderer draws. The type system cannot
  // state the pairing (kind and cluster are independent fields), so this census is the enforcement.
  // Widened to the INTERFACE: the tuple's literal members omit the absent optional key entirely, so a
  // `.cluster` read on the raw union is a TS2339 rather than `undefined`.
  const defs: readonly TemplateDef[] = TEMPLATE_DEFS;
  expect(defs.filter((def) => def.kind === "extract" && def.cluster === undefined).map((def) => def.id)).toStrictEqual([]);
  expect(defs.filter((def) => def.kind !== "extract" && def.cluster !== undefined).map((def) => def.id)).toStrictEqual([]);
  // …and every declared cluster is DRAWN: no `TEMPLATE_CLUSTERS` member may be empty, or the tuple carries a
  // band label the list never renders (the vocabulary and the data drifting apart).
  for (const cluster of TEMPLATE_CLUSTERS) {
    expect(
      defs.some((def) => def.cluster === cluster),
      `cluster "${cluster}" has no rows`,
    ).toBe(true);
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

// ── G9: newChatMarker ships ON as SillyTavern's `new_chat_prompt` text (owner ruling) ─────────────────────
test("G9: newChatMarker's shipped default is `[Start a new chat]`, read from its PROSE-1 slot", () => {
  expect(DEFAULT_FORMAT_STRINGS.newChatMarker).toBe("[Start a new chat]");
  expect(DEFAULT_PROMPT_CONFIG.formatStrings?.newChatMarker).toBe("[Start a new chat]");
  expect(PRESET_FORMAT_SLOT_IDS.newChatMarker).toBe("preset.format.newChatMarker");
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

// ── THE SECOND CARRIER ENUMERATION (owner ruling 2026-08-08, option C of) ──
// `{{note}}` carries the injection's ENTIRE payload: `spliceProseTokens` is a replace, so a frame override
// that dropped it ships `[Note from user: ]` with the author's note gone — the `{{entry}}` failure exactly.
// The frames store in `promptConfig.prose`, not `formatStrings`, which is why they need their own list and
// why the divergence survived unnoticed: the enforcement split tracked storage plumbing, not the failure.
const NOTE_CARRIER_SLOTS = ["chat.injection.userNote"] as const;
/** A stored override as the write schema takes it — `baseVersion` is the slot version it was authored at. */
const CARRIER_BASE_VERSION = 1;
function withProse(slotId: string, text: string): Record<string, unknown> {
  return { ...DEFAULT_PROMPT_CONFIG, prose: { [slotId]: { text, baseVersion: CARRIER_BASE_VERSION } } };
}

test("the write boundary REFUSES a note frame that dropped {{note}}, naming the token", () => {
  for (const slotId of NOTE_CARRIER_SLOTS) {
    const result = promptConfigWriteSchema.safeParse(withProse(slotId, "[A note from the operator.]"));
    expect(result.success, slotId).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.path, slotId).toStrictEqual(["prose", slotId, "text"]);
    expect(issue?.message, slotId).toContain("{{note}}");
  }
});

test("blank-means-default survives the note guard, and the SPLICE's own spellings are accepted", () => {
  for (const slotId of NOTE_CARRIER_SLOTS) {
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "")).success, slotId).toBe(true);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "   ")).success, slotId).toBe(true);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "<<{{note}}>>")).success, slotId).toBe(true);
    // The refusal may never be STRICTER than the renderer: `spliceProseTokens`' regex is whitespace-tolerant
    // and case-insensitive, so both of these really do get filled and neither may bounce.
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "<<{{ note }}>>")).success, slotId).toBe(true);
    expect(promptConfigWriteSchema.safeParse(withProse(slotId, "<<{{NOTE}}>>")).success, slotId).toBe(true);
  }
  expect(promptConfigWriteSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, prose: {} }).success).toBe(true);
});

test("the note guard is a WRITE boundary only — a stored broken frame still LOADS (the {{entry}} precedent)", () => {
  const stored = withProse("chat.injection.userNote", "[broken]");
  const parsed = parsePromptConfig(stored);
  expect(parsed.prose["chat.injection.userNote"]?.text).toBe("[broken]");
  expect(parsed.sections).toHaveLength(DEFAULT_PROMPT_CONFIG.sections.length);
});

test("the guard did NOT widen to PROSE-1's requiredMacros: another slot's missing macro still saves", () => {
  // `chat.group.characterHeading` carries `{{name}}` in `requiredMacros` — VOICE guidance whose absence weakens
  // prose rather than deleting payload. Its posture is the unchanged ruling: a lint in the editor, never a
  // block. (Since the F4 re-home it is a PRESET-homed group framing with its own Templates-tab row, so this
  // is a real `promptConfig.prose` write target — proving the note guard reads the two carrier slots and
  // nothing else, not even another preset-homed framing that drops its own required token.)
  const result = promptConfigWriteSchema.safeParse(withProse("chat.group.characterHeading", "A character is present."));
  expect(result.success).toBe(true);
});

test("every declared note carrier really is a carrier: the token rides its slot's default AND requiredMacros", () => {
  // The carrier list spells the token beside the guard; the SLOT spells it in `text`/`requiredMacros`. Nothing
  // in the type system pairs them (contracts/preset cannot import chat's prose table — it would close the
  // `#prose → #preset → #prose` cycle the prose-slot split exists to prevent), so this census is the pairing.
  for (const slotId of NOTE_CARRIER_SLOTS) {
    expect(PROSE_SLOTS[slotId].text, slotId).toContain("{{note}}");
    expect(PROSE_SLOTS[slotId].requiredMacros, slotId).toContain("{{note}}");
  }
});

// ── C8: THE SHARED INJECTION-TEMPLATE CAP (owner ruling 2026-08-08, option 2 of parked-options §2) ─────
// `guidedActions.*.prompt` was the one authored text field in this contract with no ceiling, reaching both
// the preset row and the model's system block unbounded. It now wears the SAME number its functional sibling
// `formatStrings` always did — one constant, one class.
const AT_CAP_PROMPT = "x".repeat(MAX_INJECTION_TEMPLATE_LENGTH);
const OVER_CAP_PROMPT = `${AT_CAP_PROMPT}x`;

test("C8: the guided prompt is capped at the SHARED constant, which is the format strings' cap too", () => {
  expect(guidedActionConfigSchema.safeParse({ prompt: OVER_CAP_PROMPT }).success).toBe(false);
  expect(guidedActionConfigSchema.safeParse({ prompt: AT_CAP_PROMPT }).success).toBe(true);
  // The SAME number bounds `formatStrings` — a second constant here would be the drift the shared one prevents.
  expect(promptConfigSchema.safeParse({ ...DEFAULT_PROMPT_CONFIG, formatStrings: { continueNudge: OVER_CAP_PROMPT } }).success).toBe(false);
});

test("C8: the write boundary REFUSES an over-cap guided prompt and accepts one exactly at the cap", () => {
  const over = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: OVER_CAP_PROMPT, role: "system" } },
  });
  expect(over.success).toBe(false);
  expect(over.error?.issues[0]?.path).toStrictEqual(["guidedActions", "response", "prompt"]);
  const at = promptConfigWriteSchema.safeParse({
    ...DEFAULT_PROMPT_CONFIG,
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: AT_CAP_PROMPT, role: "system" } },
  });
  expect(at.success).toBe(true);
});

// ── THE PIPELINE ORDER DECLARATION ────────────────────────────────────────────────────────────────
// The order is declared ONCE (here in contracts) and consumed twice: the server's post-process executors
// iterate the flag tuples, and the preset editor's Transforms readout renders the lanes. These pin the two
// ways the declaration can go wrong on its OWN terms; that it matches the ENGINE's interleaving is pinned
// where the engine runs (`tests/server/domain/chat/engine/pipeline.test.ts` — the RECEIVE ORDER test).

test("the two lane tuples PARTITION postProcess: every switch is declared on exactly one lane", () => {
  const declared = [...RECEIVE_POST_PROCESS_ORDER, ...ASSEMBLE_POST_PROCESS_ORDER];
  // The schema's own key set, read off the shape — a switch added to `postProcess` and to neither tuple
  // would run NOWHERE while its readout row went missing, and nothing else in the tree would notice.
  const flags = Object.keys(promptConfigSchema.shape.postProcess.unwrap().shape);
  expect(declared.toSorted()).toEqual(flags.toSorted());
});

test("no step appears twice in a lane, and the two lanes share no step", () => {
  const prompt = PROMPT_LANE_STEPS.map(pipelineStepKey);
  const reply = REPLY_LANE_STEPS.map(pipelineStepKey);
  expect(new Set(prompt).size).toBe(prompt.length);
  expect(new Set(reply).size).toBe(reply.length);
  expect(prompt.filter((key) => reply.includes(key))).toEqual([]);
});

test("collapseNewlines is on the ASSEMBLE lane and NOT on the reply lane (it never runs on a reply)", () => {
  // The exact untruth the hand-numbered readout printed: an assemble transform listed as reply step 5.
  expect(PROMPT_LANE_STEPS.map(pipelineStepKey)).toContain("post-process:collapseNewlines");
  expect(REPLY_LANE_STEPS.map(pipelineStepKey)).not.toContain("post-process:collapseNewlines");
});

test("the REASONING leg is declared AFTER the whole post-process block, and DISPLAY last", () => {
  const reply = REPLY_LANE_STEPS.map(pipelineStepKey);
  const reasoningAt = reply.indexOf("regex:REASONING");
  for (const flag of RECEIVE_POST_PROCESS_ORDER) {
    expect(reply.indexOf(`post-process:${flag}`)).toBeLessThan(reasoningAt);
  }
  // …and the AI_OUTPUT pass before it — the pair the readout had inverted before this one.
  expect(reply.indexOf("regex:AI_OUTPUT")).toBeLessThan(reasoningAt);
  // DISPLAY is LAST: it changes what you read and never touches the wire.
  expect(reply.at(-1)).toBe("regex:DISPLAY");
});
