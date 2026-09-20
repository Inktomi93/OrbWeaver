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
