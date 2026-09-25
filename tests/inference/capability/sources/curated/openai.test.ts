import type { GenerationCapability, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { detectModelFamily } from "../../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import { resolveChat } from "../../../../../packages/inference/src/funnel/resolve-chat.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function generation(model: string): GenerationCapability {
  const out = synthesizeCapability("generation", detectModelFamily(model), {
    curated: curatedRows({
      model,
      providerId: castId<ProviderId>(model.startsWith("openai/") ? "openrouter" : "openai"),
      wire: "openai-compat",
      api: "chat-completions",
    }),
  });
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

  expect(generation("o3").reasoning.mandatory).toBeUndefined();
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
