// capability/sources/curated/anthropic — the table pins over the Claude cells on the DIRECT wire, folded exactly
// as `resolve-task.ts` folds an `anthropic` row (curated rows → `synthesizeCapability`, no OR advertisement).
// The SDK's own capability table is the direct wire's truth (`@ai-sdk/anthropic/dist/index.js:5943-5963` —
// it strips before sending), and A8 was measured live (`req_011CfEBkabcoxXWyouHdYDxY`: fable + thinking disabled
// → 400). A6: the structured-output VEHICLE is `resolveVehicle` (role-clients.ts) — `auto` picks the enforcing
// `response-format` iff `output.structured === true`, else the forced tool Fable rejects; the input to that
// decision is what these cells must state.

import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const DIRECT = { providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" } as const;

function direct(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", "anthropic", { curated: curatedRows({ model, ...DIRECT }) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

/** The ids the SDK table marks `rejectsSamplingParameters: true` (+ `supportsAdaptiveThinking`, `supportsXhighEffort`). */
const REJECTS_SAMPLING = ["claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1", "claude-fable-5", "claude-mythos-5", "claude-sonnet-5"];

test("B3 (direct): every SDK-table id states an EMPTY sampling set on the direct wire; a preset knob drops loudly", () => {
  for (const model of REJECTS_SAMPLING) {
    const gen = direct(model);
    // The `exclusive` pair is a RESTRICTION with no ranges — the stated set carries no knob at all.
    expect(gen.sampling.temperature, model).toBeUndefined();
    expect(gen.sampling.topP, model).toBeUndefined();
    expect(
      resolveChat({ temperature: 0.7 }, gen).warnings.map((w) => w.code),
      model,
    ).toContain("sampling_knob_dropped");
  }
});

test("opus-5 has a curated cell now: adaptive reasoning with the full effort ladder (it resolved as non-reasoning before 2026-09-20)", () => {
  const gen = direct("claude-opus-5");
  expect(gen.reasoning).toMatchObject({ mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] });
  expect(gen.reasoning.mandatory).toBeUndefined();
  expect(gen.context).toMatchObject({ window: 200_000, supports1M: true });
  // PLANTED CONTROL for the regex: `opus-5` must not swallow the 4.x opus ids (their cells differ).
  expect(direct("claude-opus-4-5-20251101").reasoning.mode).toBe("effort");
  expect(direct("claude-opus-4-8").reasoning.mode).toBe("adaptive");
});

test("A8: fable / mythos are MANDATORY — effort `none` or absent resolves enabled at the lowest level with reasoning_mandatory_clamp", () => {
  for (const model of ["claude-fable-5-1", "claude-fable-5", "claude-mythos-5"]) {
    const gen = direct(model);
    expect(gen.reasoning.mandatory, model).toBe(true);
    const off = resolveChat({ effort: "none" }, gen);
    expect(off.reasoning, model).toMatchObject({ mode: "adaptive", enabled: true, effort: "low" });
    expect(
      off.warnings.map((w) => [w.code, w.appliedEffort]),
      model,
    ).toEqual([["reasoning_mandatory_clamp", "low"]]);
    const unset = resolveChat({}, gen);
    expect(unset.reasoning.enabled, model).toBe(true);
    // An explicit level is honoured untouched.
    expect(resolveChat({ effort: "high" }, gen).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }
  // PLANTED CONTROL: a non-mandatory adaptive cell still turns thinking OFF for effort `none`.
  expect(resolveChat({ effort: "none" }, direct("claude-opus-5")).reasoning.enabled).toBe(false);
});

test("A6: every SDK-table id (and the 4.5 generation) states output.structured — the vehicle input that keeps Fable off the forced tool", () => {
  for (const model of [...REJECTS_SAMPLING, "claude-opus-4-5-20251101", "claude-haiku-4-5"]) {
    expect(direct(model).output.structured, model).toBe(true);
  }
});

test("sonnet 4.5 / 4.6 keep the shared sonnet reasoning cell without the sonnet-5 empty-sampling row (the SDK table accepts sampling there)", () => {
  const rows46 = curatedRows({ model: "claude-sonnet-4-6", ...DIRECT });
  expect(rows46.some((row) => row.match?.model === "^(anthropic/)?claude[-/].*sonnet-5")).toBe(false);
  expect(curatedRows({ model: "claude-sonnet-5", ...DIRECT }).some((row) => row.match?.model === "^(anthropic/)?claude[-/].*sonnet-5")).toBe(true);
  expect(direct("claude-sonnet-4-6").reasoning.mode).toBe("effort");
});
