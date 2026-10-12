// @orb/contracts/preset — the custom-parameter belt, the strict preset file serde and the reasoning-parse config.

import { BELT_OWNED_BODY_KEYS, isBeltOwnedBodyKey } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import {
  buildPresetFile,
  DEFAULT_PROMPT_CONFIG,
  PRESET_SCHEMA_KIND,
  PROMPT_CONFIG_SCHEMA_VERSION,
  parsePresetFile,
  parsePromptConfig,
  promptConfigSchema,
  THINK_PREFIX_DEFAULT,
  THINK_SUFFIX_DEFAULT,
} from "@orb/contracts/preset";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

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
// own merge-on-submit round-trip test (tests/legacy/client/features/preset/lib/preset-editor-model.test.ts).
