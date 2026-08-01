// resolveEffective — the funnel PROJECTED for the editor (redesign §4.3). The load-bearing property is
// PARITY: every value the verb reports must be the value a real turn would send, so the first test drives
// `resolveChat` — the exact function both sealed chat runners call once per turn — over the same
// (params × capability) and asserts the projection equals it field for field. A re-derivation inside the
// verb (the F9 client-mirror failure, one tier down) breaks that test and nothing else would.
//
// The rest pin the LABEL half the parity test cannot see: which rung produced each value (explicit /
// quality / modelDefault / clamped / floor) and the stored-but-unhonored (staleness) list.

import type { ModelCapability } from "@orb/contracts/connection";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG, QUALITY_SAMPLING } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { EffectivePreset } from "@orb/server/domain/preset";
import { createPresetService, PresetNotFoundError } from "@orb/server/domain/preset";
import { resolveChat } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeModelCapability, makeResolvedChatCapability } from "../../../../support/factories/index.ts";
import { principal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, seedPreset, seedUser } from "../_support.ts";

const PRESET_ID = castId<PresetId>("preset_effective");

/** A model that honors the sampling knobs this suite drives (the shared fixture descriptor advertises an
 *  EMPTY sampling map — that is the capability-drops arm, exercised on its own below). */
const SAMPLING_CAPABLE: Partial<ModelCapability> = {
  sampling: {
    temperature: { min: 0, max: 1.2 },
    topP: { min: 0, max: 1 },
    topK: { min: 0, max: 100 },
  },
};

function configWith(params: UserIntent): PromptConfig {
  return { ...DEFAULT_PROMPT_CONFIG, params };
}

/** Seed one owned preset carrying `params` and resolve it against `capability`. */
async function resolveWith(params: UserIntent, capability: ModelCapability): Promise<EffectivePreset> {
  const db = await freshDb();
  const svc = createPresetService(makeHarness(db, { capability: makeResolvedChatCapability({ capability }) }).ctx);
  const owner = await seedUser(db);
  await seedPreset(db, { id: PRESET_ID, ownerId: owner, config: configWith(params) });
  return await svc.resolveEffective({ principal: principal(owner), id: PRESET_ID });
}

describe("resolveEffective — parity with the turn pipeline's own funnel", () => {
  test("every projected value equals what `resolveChat` computes for the same inputs", async () => {
    const capability = makeModelCapability({
      ...SAMPLING_CAPABLE,
      reasoning: { mode: "effort", enabled: true, effortLevels: ["low", "medium", "high"] },
      verbosity: ["low", "high"],
    });
    // A params blob touching every rung at once: an explicit knob, a quality-fed knob, an out-of-range knob
    // the capability clamps, and knobs the model must default.
    // (`temperature: 1.9` is INSIDE the schema's 0..2 bound and OUTSIDE the model's 0..1.2 range — the
    // capability clamp is what moves it. A schema-illegal value would instead make `params` degrade whole.)
    const params: UserIntent = { quality: "deep", topP: 0.9, temperature: 1.9, maxOutputTokens: 999, effort: "high", verbosity: "low" };

    const effective = await resolveWith(params, capability);
    const turn = resolveChat(params, capability);

    expect(effective.knobs.temperature?.value).toBe(turn.sampling.temperature);
    expect(effective.knobs.topP?.value).toBe(turn.sampling.topP);
    expect(effective.knobs.maxOutputTokens?.value).toBe(turn.maxOutputTokens);
    expect(effective.knobs.effort?.value).toBe(turn.reasoning.effort);
    expect(effective.knobs.verbosity?.value).toBe(turn.verbosity);
    // …and the clamp is REAL, not a pass-through: 1.9 cannot survive a max of 1.2.
    expect(turn.sampling.temperature).toBe(1.2);
  });

  test("an unset sampling knob reports the QUALITY dial's value, from the funnel", async () => {
    const capability = makeModelCapability(SAMPLING_CAPABLE);
    const effective = await resolveWith({ quality: "balanced" }, capability);
    expect(effective.knobs.temperature).toStrictEqual({ value: QUALITY_SAMPLING.balanced.temperature, provenance: "quality" });
  });
});

describe("resolveEffective — provenance", () => {
  test("an explicit in-range knob reads `explicit`; the same knob out of range reads `clamped`", async () => {
    const capability = makeModelCapability(SAMPLING_CAPABLE);
    expect(await resolveWith({ temperature: 0.73 }, capability).then((e) => e.knobs.temperature)).toStrictEqual({ value: 0.73, provenance: "explicit" });
    expect(await resolveWith({ temperature: 1.9 }, capability).then((e) => e.knobs.temperature)).toStrictEqual({ value: 1.2, provenance: "clamped" });
  });

  test("a quality-fed knob the capability clamps reads `clamped`, not `quality`", async () => {
    // `deep` maps temperature to 1.0; a model capped at 0.5 moves it — the dial did not get what it asked.
    const capability = makeModelCapability({ sampling: { temperature: { min: 0, max: 0.5 } } });
    const effective = await resolveWith({ quality: "deep" }, capability);
    expect(effective.knobs.temperature).toStrictEqual({ value: 0.5, provenance: "clamped" });
  });

  test("a model-supplied reasoning budget reads `modelDefault`", async () => {
    const capability = makeModelCapability({
      reasoning: { mode: "budget", enabled: true, defaultEffort: "medium", budgetRange: { min: 1024, max: 4096 } },
    });
    const effective = await resolveWith({}, capability);
    expect(effective.knobs.thinkingBudgetTokens).toStrictEqual({ value: 4096, provenance: "modelDefault" });
  });

  test("an unset output cap reads the ENGINE FLOOR the wire actually falls back to", async () => {
    const effective = await resolveWith({}, makeModelCapability());
    expect(effective.knobs.maxOutputTokens).toStrictEqual({ value: DEFAULT_MAX_OUTPUT_TOKENS, provenance: "floor" });
  });

  test("reasoning switched off is the effective effort `none` — not an absent knob and not staleness", async () => {
    const effective = await resolveWith({ effort: "none" }, makeModelCapability({ reasoning: { mode: "effort", enabled: true, effortLevels: ["low"] } }));
    expect(effective.knobs.effort).toStrictEqual({ value: "none", provenance: "explicit" });
    expect(effective.stale).toStrictEqual([]);
  });
});

describe("resolveEffective — the staleness list (F7)", () => {
  test("a stored knob this model does not honor is reported stale and renders no value", async () => {
    // The default fixture descriptor advertises NO sampling ranges: every stored sampling knob drops.
    const effective = await resolveWith({ minP: 0.05, topA: 0.2, temperature: 0.7 }, makeModelCapability());
    expect(effective.stale).toStrictEqual([
      { knob: "temperature", value: 0.7 },
      { knob: "minP", value: 0.05 },
      { knob: "topA", value: 0.2 },
    ]);
    expect(effective.knobs.minP).toBeUndefined();
  });

  test("nothing stored, nothing stale", async () => {
    expect((await resolveWith({}, makeModelCapability(SAMPLING_CAPABLE))).stale).toStrictEqual([]);
  });
});

describe("resolveEffective — scope", () => {
  test("names the model it resolved against", async () => {
    const effective = await resolveWith({}, makeModelCapability());
    expect(effective.model).toBe(makeResolvedChatCapability().model);
  });

  test("throws PresetNotFoundError for a preset the caller cannot read", async () => {
    const db = await freshDb();
    const svc = createPresetService(makeHarness(db).ctx);
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const owned = await seedPreset(db, { id: castId<PresetId>("preset_b_eff"), ownerId: b });
    await expect(svc.resolveEffective({ principal: principal(a), id: owned })).rejects.toThrow(PresetNotFoundError);
  });
});
