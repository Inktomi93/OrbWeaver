// The refinery editor's plan preview over a real resolved connection: the outcome is the structured planner's own,
// so a schema the planner sends on a tool is never reported as refused, and a refusal names its reason in the
// author's words.

import type { GenerationCapability } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { createPlanSchema } from "../../../../packages/server/src/entry/compose/refinery.ts";
import { makeCapability, makeGenerationCapability, makeResolved, TEST_OWNER_ID } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** A projected draft of `n` optional string fields: 30 is past Anthropic's 24-optional ceiling. */
function optionalFields(n: number): ReturnType<typeof projectJsonSchema> {
  return projectJsonSchema(z.object(Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${String(i)}`, z.string().optional()]))));
}

const CLAUDE_OUTPUT: GenerationCapability["output"] = {
  maxTokens: { min: 1, max: 8192 },
  structured: true,
  modalities: ["text"],
  structuredLimitsFrom: "anthropic-format",
};

function planOn(connection: Resolved | null): ReturnType<ReturnType<typeof createPlanSchema>> {
  const planSchema = createPlanSchema(() => Promise.resolve({ resolved: () => Promise.resolve(connection) }));
  return planSchema(TEST_OWNER_ID, optionalFields(30));
}

test("over Anthropic's ceilings on a model that takes tools, the plan rides a tool call and is not reported refused", async () => {
  const claude = makeResolved({
    providerId: "anthropic",
    capability: makeCapability(makeGenerationCapability({ output: CLAUDE_OUTPUT, tools: { parallel: true } })),
  });
  expect(await planOn(claude)).toEqual({ outcome: "sends", model: "test-model", carrier: "tool" });
});

test("with no tools to fall back on, the refusal names the reason in the author's words, never the planner's vocabulary", async () => {
  const claude = makeResolved({ providerId: "anthropic", capability: makeCapability(makeGenerationCapability({ output: CLAUDE_OUTPUT })) });
  const plan = await planOn(claude);
  expect(plan).toMatchObject({ outcome: "refused", model: "test-model" });
  const reasons = plan.outcome === "refused" ? plan.reasons : [];
  expect(reasons).toHaveLength(1);
  expect(reasons[0]).toMatch(/\b30\b.*\b24\b/u);
  expect(JSON.stringify(plan)).not.toMatch(/optional-props|anthropic-format|hosted-common/u);
});

test("a local target with no stated ceiling takes the shape natively; no bound connection says it depends on one", async () => {
  const local = makeResolved({
    capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } })),
  });
  expect(await planOn(local)).toEqual({ outcome: "sends", model: "test-model", carrier: "native" });
  expect(await planOn(null)).toEqual({ outcome: "unbound" });
});
