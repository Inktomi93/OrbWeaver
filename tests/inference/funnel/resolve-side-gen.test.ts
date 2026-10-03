// funnel/resolve-side-gen — the pure fold for a background task's sampling (D299): the role's preset params win
// per knob, the task posture fills only the knobs they leave unset, and only `ROLE_PRESET_FIELDS` ever cross.

import type { UserIntent } from "@orb/contracts/preset";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { resolveSideGenSampling } from "@orb/inference";
import { expect, test } from "../../support/fixtures.ts";

test("task defaults (no preset params) run the posture alone", () => {
  expect(resolveSideGenSampling(SIDE_GEN_POSTURES.theme_name)).toEqual({ temperature: 0.3, maxOutputTokens: 24 });
});

test("a preset knob wins; the posture fills only the knobs the preset leaves unset", () => {
  expect(resolveSideGenSampling(SIDE_GEN_POSTURES.refine_rewrite, { maxOutputTokens: 300 })).toEqual({ temperature: 0.7, maxOutputTokens: 300 });
  expect(resolveSideGenSampling(SIDE_GEN_POSTURES.refine_rewrite, { temperature: 1.1 })).toEqual({ temperature: 1.1, maxOutputTokens: 2048 });
});

test("every generation param a role takes reaches the task, not just temperature, topP and output cap", () => {
  const params: UserIntent = {
    topK: 40,
    minP: 0.05,
    topA: 0.2,
    repetitionPenalty: 1.1,
    dryMultiplier: 0.8,
    seed: 7,
    logitBias: { "50256": -100 },
    stop: ["\n\n"],
    samplerOrder: ["temperature", "topK"],
    adaptiveTarget: 0.6,
    minKeep: 2,
    bannedStrings: ["ministrations"],
    effort: "low",
    thinkingBudgetTokens: 2048,
  };
  expect(resolveSideGenSampling(SIDE_GEN_POSTURES.distill, params)).toEqual({ ...params, temperature: 0.2, maxOutputTokens: 512 });
});

test("a preset with chat-only intent leaves the task's sampling exactly as task defaults would", () => {
  const chatOnly: UserIntent = {
    compaction: { mode: "managed", thresholdPct: 80 },
    replyMedia: "text+image",
    carryReasoning: "conversation",
    thinkingDisplay: "summarized",
    verbosity: "high",
    maxContextTokens: 8000,
    providerContextCompression: true,
    quality: "deep",
    advanced: { squashSystemMessages: true, parallelToolCalls: false },
    banEos: true,
  };
  expect(resolveSideGenSampling(SIDE_GEN_POSTURES.memory_digest, chatOnly)).toEqual(resolveSideGenSampling(SIDE_GEN_POSTURES.memory_digest));
});

test("a knob absent from both sources is omitted, never emitted as undefined", () => {
  const out = resolveSideGenSampling({ temperature: 0.3 }, {});
  expect(out).toEqual({ temperature: 0.3 });
  expect("maxOutputTokens" in out).toBe(false);
});
