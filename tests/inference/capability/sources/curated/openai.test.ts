import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { detectModelFamily } from "../../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function openaiRows(model: string): ReturnType<typeof curatedRows> {
  return curatedRows({
    model,
    providerId: castId<ProviderId>(model.startsWith("openai/") ? "openrouter" : "openai"),
    wire: "openai-compat",
    api: "chat-completions",
  });
}

function generation(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", detectModelFamily(model), { curated: openaiRows(model) });
  if (out.capability.kind !== "generation") {
    throw new Error("expected a generation capability");
  }
  return out.capability.generation;
}

test("o3-mini and o4-mini clamp disabled reasoning before a request is built", () => {
  for (const model of ["o3-mini", "o4-mini-2025-04-16", "openai/o4-mini"]) {
    const capability = generation(model);
    expect(capability.reasoning, model).toMatchObject({
      mode: "effort",
      enabled: true,
      effortLevels: ["low", "medium", "high"],
      mandatory: true,
    });

    const resolved = resolveChat({ effort: "none" }, capability);
    expect(resolved.reasoning, model).toMatchObject({ mode: "effort", enabled: true, effort: "low" });
    expect(
      resolved.warnings.map((warning) => [warning.code, warning.appliedEffort]),
      model,
    ).toEqual([["reasoning_mandatory_clamp", "low"]]);
    expect(resolveChat({ effort: "high" }, capability).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }

  // Controls: a model whose page lists `none`, and an id no row anchors.
  expect(generation("gpt-5.1").reasoning.mandatory).toBeUndefined();
  expect(generation("openai/o4-mini-preview").reasoning.mandatory).toBeUndefined();
});

// A non-reasoning GPT id must not inherit the reasoning ids' effort and verbosity: it would show a reasoning
// control and send knobs a model with no reasoning step does not take.
test("the non-reasoning GPT ids carry no reasoning and no verbosity; the reasoning ids keep their documented levels", () => {
  for (const model of ["gpt-4.1-mini", "gpt-4.1-mini-2025-04-14", "gpt-4.1", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini"]) {
    const capability = generation(model);
    expect(capability.reasoning, model).toEqual({ mode: "none", enabled: false });
    expect(capability.verbosity, model).toBeUndefined();
    const resolved = resolveChat({ effort: "high", verbosity: "low" }, capability);
    expect(resolved.reasoning, model).toMatchObject({ enabled: false });
    expect(resolved.verbosity, model).toBeUndefined();
  }

  for (const [model, effortLevels] of [
    ["gpt-5-mini", ["minimal", "low", "medium", "high"]],
    ["gpt-5.1", ["low", "medium", "high"]],
    ["gpt-5.4-mini", ["low", "medium", "high", "xhigh"]],
    ["gpt-5.6-terra", ["low", "medium", "high", "xhigh", "max"]],
    ["gpt-6-sol", ["low", "medium", "high", "xhigh", "max"]],
    ["o3", ["low", "medium", "high"]],
  ] as const) {
    const capability = generation(model);
    expect(capability.reasoning, model).toMatchObject({ mode: "effort", enabled: true, effortLevels });
    expect(resolveChat({ effort: "high" }, capability).reasoning, model).toMatchObject({ enabled: true, effort: "high" });
  }
  expect(generation("gpt-5-mini").verbosity).toEqual(["low", "medium", "high"]);
  expect(generation("o3").verbosity).toBeUndefined();

  // GPT-6 Astra alone 400s `none`, so its explicit off clamps up; its siblings take `none`.
  expect(generation("gpt-6-astra").reasoning).toMatchObject({ mandatory: true, effortLevels: ["low", "medium", "high", "xhigh", "max"] });
  expect(generation("gpt-6-sol").reasoning.mandatory).toBeUndefined();
});

// Every OpenAI id openrouter.ai/api/v1/models lists with `reasoning` in `supported_parameters`, snapshotted from the
// live catalog. A new reasoning variant (a -pro, -codex or -image id, a `:batch` twin) must keep its replay cell.
const OPENROUTER_REASONING_IDS = [
  "openai/gpt-5",
  "openai/gpt-5-image",
  "openai/gpt-5-image-mini",
  "openai/gpt-5-mini",
  "openai/gpt-5-mini:batch",
  "openai/gpt-5-nano",
  "openai/gpt-5-nano:batch",
  "openai/gpt-5-pro",
  "openai/gpt-5-pro:batch",
  "openai/gpt-5.1",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-5.1:batch",
  "openai/gpt-5.2",
  "openai/gpt-5.2-codex",
  "openai/gpt-5.2-pro",
  "openai/gpt-5.2-pro:batch",
  "openai/gpt-5.2:batch",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.4",
  "openai/gpt-5.4-image-2",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-mini:batch",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.4-nano:batch",
  "openai/gpt-5.4-pro",
  "openai/gpt-5.4-pro:batch",
  "openai/gpt-5.4:batch",
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
  "openai/gpt-5.5-pro:batch",
  "openai/gpt-5.5:batch",
  "openai/gpt-5.6-luna",
  "openai/gpt-5.6-luna-pro",
  "openai/gpt-5.6-luna-pro:batch",
  "openai/gpt-5.6-luna:batch",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-sol-pro",
  "openai/gpt-5.6-sol-pro:batch",
  "openai/gpt-5.6-sol:batch",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-terra-pro",
  "openai/gpt-5.6-terra-pro:batch",
  "openai/gpt-5.6-terra:batch",
  "openai/gpt-5:batch",
  "openai/gpt-6-astra",
  "openai/gpt-6-astra-pro",
  "openai/gpt-6-astra-pro:batch",
  "openai/gpt-6-astra:batch",
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-pro",
  "openai/gpt-6-luna-pro:batch",
  "openai/gpt-6-luna:batch",
  "openai/gpt-6-sol",
  "openai/gpt-6-sol-pro",
  "openai/gpt-6-sol-pro:batch",
  "openai/gpt-6-sol:batch",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-120b:batch",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-20b:batch",
  "openai/gpt-oss-safeguard-20b",
  "openai/o1",
  "openai/o1-pro",
  "openai/o3",
  "openai/o3-mini",
  "openai/o3-mini-high",
  "openai/o3-mini:batch",
  "openai/o3-pro",
  "openai/o3:batch",
  "openai/o4-mini",
  "openai/o4-mini-high",
  "openai/o4-mini:batch",
] as const;

// gpt-oss is open-weight and OpenRouter serves it from third-party hosts, not OpenAI's Responses API, so it has no
// encrypted reasoning to replay signed.
const OPEN_WEIGHT = /^openai\/gpt-oss/;

function cells(model: string): { readonly sampling: boolean; readonly replay: string | undefined } {
  return {
    sampling: openaiRows(model).some((row) => row.generation?.sampling !== undefined),
    replay: generation(model).reasoning.replay,
  };
}

// The stated-empty sampling set and signed replay belong to the reasoning ids alone. The kind floor already states
// no sampling, so the curated cell is read off the matched rows; replay is read off the synthesized capability.
test("every OpenAI reasoning id OpenRouter lists carries the empty sampling set and signed replay, gpt-oss aside", () => {
  for (const model of OPENROUTER_REASONING_IDS) {
    expect(cells(model), model).toEqual(OPEN_WEIGHT.test(model) ? { sampling: false, replay: undefined } : { sampling: true, replay: "signed" });
  }
  for (const model of ["gpt-6-astra", "gpt-6-luna-2026-09-22", "gpt-5.1-codex-max", "o3-pro"]) {
    expect(cells(model), model).toEqual({ sampling: true, replay: "signed" });
  }
});

test("the non-reasoning chat snapshots and pre-GPT-5 ids take neither cell", () => {
  for (const model of [
    "gpt-5-chat-latest",
    "openai/gpt-5-chat-latest",
    "openai/gpt-5.2-chat",
    "gpt-5.2-chat-latest",
    "openai/gpt-chat-latest",
    "gpt-4.1",
    "gpt-4o-mini",
  ]) {
    expect(cells(model), model).toEqual({ sampling: false, replay: undefined });
  }
});

// Off reaches the wire as `reasoning_effort: "none"`, so a model whose page lists no `none` must read mandatory:
// its off then clamps to the lowest documented level instead of sending a word the model refuses.
test("a reasoning model whose documented efforts omit none is mandatory, and one that lists none is not", () => {
  for (const model of ["gpt-5", "gpt-5-mini", "gpt-5-nano-2025-08-07", "gpt-5.3-codex", "o1", "o3", "gpt-oss-120b", "gpt-6-astra"]) {
    expect(generation(model).reasoning.mandatory, model).toBe(true);
  }
  for (const model of ["gpt-5.1", "gpt-5.2", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-terra", "gpt-6-sol", "gpt-6-luna"]) {
    expect(generation(model).reasoning.mandatory, model).toBeUndefined();
  }
  expect(resolveChat({ effort: "none" }, generation("gpt-5")).reasoning).toMatchObject({ enabled: true, effort: "minimal" });
});
