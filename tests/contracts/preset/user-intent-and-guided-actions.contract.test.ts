// @orb/contracts/preset — the params damage bound, the user-intent knobs, guided actions and the steer catalogs.

import type { GuidedActionKind } from "@orb/contracts/preset";
import {
  DEFAULT_GUIDED_ACTIONS,
  DEFAULT_PROMPT_CONFIG,
  GREETING_TRANSFORM_AXES,
  GREETING_TRANSFORM_IDS,
  GREETING_TRANSFORMS,
  GUIDED_ACTION_KINDS,
  guidedActionsSchema,
  HOST_OWNED_CLAUDE_ENV_KEYS,
  PROMPT_CONFIG_SCHEMA_VERSION,
  promptConfigSchema,
  QUALITY_LEVELS,
  REWRITE_TOGGLE_IDS,
  REWRITE_TOGGLES,
  SIDE_GEN_POSTURES,
  userIntentSchema,
} from "@orb/contracts/preset";
import { PRESET_PROSE_SLOT_IDS, PROSE_SLOTS } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { GUIDED_ACTION_COUNT, OUT_OF_RANGE_TEMPERATURE, SAMPLE_TEMPERATURE, SCHEMA_VERSION_V1 } from "./_support.ts";

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

test("userIntentSchema refuses the local-server shapes a server would reject the whole request for", () => {
  // llama.cpp errors on an empty breaker list or an empty breaker; a repeated stage has no order to mean.
  expect(userIntentSchema.safeParse({ drySequenceBreakers: [] }).success).toBe(false);
  expect(userIntentSchema.safeParse({ drySequenceBreakers: [""] }).success).toBe(false);
  expect(userIntentSchema.safeParse({ samplerOrder: ["topK", "topK"] }).success).toBe(false);
  expect(userIntentSchema.safeParse({ mirostatMode: 3 }).success).toBe(false);
  expect(userIntentSchema.safeParse({ dryBase: 0.5 }).success).toBe(false);
  expect(userIntentSchema.safeParse({ drySequenceBreakers: ["\n"], samplerOrder: ["temperature", "topK"], mirostatMode: 2, dryBase: 1.75 }).success).toBe(true);
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
  expect(SIDE_GEN_POSTURES.quiet_generate).toEqual({ temperature: 0.3, maxOutputTokens: 1024 });
  expect(SIDE_GEN_POSTURES.extract_quiet).toEqual({ temperature: 0.4, maxOutputTokens: 320, effort: "none" });
  expect(SIDE_GEN_POSTURES.compaction).toEqual({ temperature: 0.3 });
  expect(SIDE_GEN_POSTURES.distill).toEqual({ temperature: 0.2, maxOutputTokens: 512, effort: "none" });
  expect(SIDE_GEN_POSTURES.analyze).toEqual({ temperature: 0.3, maxOutputTokens: 400, effort: "none" });
  expect(SIDE_GEN_POSTURES.greeting_studio).toEqual({ temperature: 0.3, maxOutputTokens: 1024 });
  expect(SIDE_GEN_POSTURES.autobg).toEqual({ temperature: 0.2, maxOutputTokens: 32, effort: "none" });
  expect(SIDE_GEN_POSTURES.rule_analysis).toEqual({ temperature: 0.3, maxOutputTokens: 1024 });
  expect(SIDE_GEN_POSTURES.caption).toEqual({ temperature: 0.2, maxOutputTokens: 512, effort: "none" });
  expect(SIDE_GEN_POSTURES.theme_name).toEqual({ temperature: 0.3, maxOutputTokens: 24, effort: "none" });
});

test("the arbiter posture leaves room for one name plus a margin and switches thinking off, so no model returns empty (#492)", () => {
  expect(SIDE_GEN_POSTURES.arbiter).toEqual({ temperature: 0.2, maxOutputTokens: 128, effort: "none" });
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
