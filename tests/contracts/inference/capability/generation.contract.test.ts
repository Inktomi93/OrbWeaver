// contracts/inference/capability/generation — what a chat model honours. Two FAIL-CLOSED rungs live here and
// both are pinned by value, because softening either one is invisible at the type level and expensive at the
// wire: `REASONING_REPLAY_FLOOR` is `none` (a wire nobody measured must never be sent a prior thinking block
// it may reject or bill for), and `TURNS_FLOOR` is the all-false / `strict` cell (a model nobody measured
// must not be assumed to accept a trailing assistant prefill — a template engine renders it as a completed
// turn and an Anthropic wire hard-400s). The third is vocabulary: `EFFORT_LEVELS` deliberately excludes
// `none`, because on/off is `reasoning.enabled` and a `none` level would give the funnel two ways to say off.

import {
  CACHE_MIN_FLOOR,
  EFFORT_LEVELS,
  effortLevelSchema,
  GENERATION_FLOOR,
  generationCapabilitySchema,
  REASONING_MODES,
  REASONING_REPLAY_FLOOR,
  reasoningReplayModeSchema,
  TURNS_FLOOR,
  turnsCapabilitySchema,
} from "@orb/contracts/inference";
import { expect, test } from "../../../support/fixtures.ts";

test("the generation floor parses, declares its window a guess, and carries the turns floor", () => {
  expect(generationCapabilitySchema.parse(GENERATION_FLOOR)).toEqual(GENERATION_FLOOR);
  expect(GENERATION_FLOOR.context.windowEstimated).toBe(true);
  expect(GENERATION_FLOOR.turns).toEqual(TURNS_FLOOR);
  expect(GENERATION_FLOOR.input).toEqual(["text"]);
  expect(GENERATION_FLOOR.output.modalities).toEqual(["text"]);
});

test("`TURNS_FLOOR` is the FAIL-CLOSED cell — no prefill, no mid-conversation system, strict roles", () => {
  expect(turnsCapabilitySchema.parse(TURNS_FLOOR)).toEqual(TURNS_FLOOR);
  expect(TURNS_FLOOR).toEqual({
    assistantPrefill: false,
    midConversationSystem: false,
    historySystemRows: false,
    roleHandlingFloor: "strict",
    explicitPromptCache: false,
  });
});

test("`REASONING_REPLAY_FLOOR` is `none` — an unmeasured wire is sent no prior thinking", () => {
  expect(REASONING_REPLAY_FLOOR).toBe("none");
  expect(reasoningReplayModeSchema.parse(REASONING_REPLAY_FLOOR)).toBe("none");
  expect(reasoningReplayModeSchema.safeParse("verbatim").success).toBe(false);
});

test("`EFFORT_LEVELS` excludes `none` — on/off is `reasoning.enabled`, not an effort level", () => {
  expect([...EFFORT_LEVELS]).not.toContain("none");
  expect(effortLevelSchema.safeParse("none").success).toBe(false);
  for (const level of EFFORT_LEVELS) {
    expect(effortLevelSchema.parse(level)).toBe(level);
  }
  expect(REASONING_MODES, "`none` IS a reasoning MODE — the two vocabularies are deliberately different").toContain("none");
});

test("a knob the model does not list is ABSENT, never a silent no-op zero", () => {
  expect(GENERATION_FLOOR.sampling).toEqual({});
  expect(GENERATION_FLOOR.tools, "the floor claims no tool support at all").toBeUndefined();
  const withRange = generationCapabilitySchema.parse({ ...GENERATION_FLOOR, sampling: { temperature: { min: 0, max: 2 } } });
  expect(withRange.sampling.temperature).toEqual({ min: 0, max: 2 });
  expect(generationCapabilitySchema.safeParse({ ...GENERATION_FLOOR, sampling: { temperature: 0.7 } }).success, "a knob is a RANGE, not a value").toBe(false);
});

test("the cache floor is a real prefix length, and `cacheMinTokens` must be a positive integer", () => {
  expect(CACHE_MIN_FLOOR).toBeGreaterThan(0);
  expect(turnsCapabilitySchema.safeParse({ ...TURNS_FLOOR, cacheMinTokens: 0 }).success).toBe(false);
  expect(turnsCapabilitySchema.parse({ ...TURNS_FLOOR, cacheMinTokens: 2048 }).cacheMinTokens).toBe(2048);
});
