// The refinery editor's plan preview over a real resolved connection: the outcome is the structured planner's own,
// so a schema the planner sends on a tool is never reported as refused, and a refusal names its reason in the
// author's words.

import type { GenerationCapability } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import { createInferenceRuntime } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { createPlanSchema, createResolveStructuredBinding } from "../../../../packages/server/src/entry/compose/refinery.ts";
import { FROZEN_NOW, fakeConnection, fakeDeps, memoryStores, newUserId } from "../../../inference/_support.ts";
import { principal } from "../../../support/factories/principal.ts";
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
  const planSchema = createPlanSchema(() => Promise.resolve(connection));
  return planSchema(TEST_OWNER_ID, optionalFields(30));
}

/** A bound `structured` row that allows background work, as every refinery run needs. */
function bound(overrides: Parameters<typeof makeResolved>[0]): Resolved {
  return makeResolved({ allowBackground: true, ...overrides });
}

test("over Anthropic's ceilings on a model that takes tools, the plan rides a tool call and is not reported refused", async () => {
  const claude = bound({
    providerId: "anthropic",
    capability: makeCapability(makeGenerationCapability({ output: CLAUDE_OUTPUT, tools: { parallel: true } })),
  });
  expect(await planOn(claude)).toEqual({ outcome: "sends", model: "test-model", carrier: "tool" });
});

test("with no tools to fall back on, the refusal names the reason in the author's words, never the planner's vocabulary", async () => {
  const claude = bound({ providerId: "anthropic", capability: makeCapability(makeGenerationCapability({ output: CLAUDE_OUTPUT })) });
  const plan = await planOn(claude);
  expect(plan).toMatchObject({ outcome: "refused", model: "test-model" });
  const reasons = plan.outcome === "refused" ? plan.reasons : [];
  expect(reasons).toHaveLength(1);
  expect(reasons[0]).toMatch(/\b30\b.*\b24\b/u);
  expect(JSON.stringify(plan)).not.toMatch(/optional-props|anthropic-format|hosted-common/u);
});

test("a local target with no stated ceiling takes the shape natively; no bound connection says it depends on one", async () => {
  const local = bound({
    capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } })),
  });
  expect(await planOn(local)).toEqual({ outcome: "sends", model: "test-model", carrier: "native" });
  expect(await planOn(null)).toEqual({ outcome: "unbound" });
});

test("the plan preview reads only the facts already cached, so a dead endpoint is never re-dialed per keystroke", async () => {
  const stores = memoryStores();
  const ownerId = newUserId();
  const row = fakeConnection({ ownerId, providerId: "custom-openai", model: "local-model", baseUrl: "http://127.0.0.1:1", allowBackground: true });
  stores.connections.rows.set(row.id, row);
  // `structured` rides the Utility (`summarize`) binding.
  stores.bindings.bind({ actorKind: "user", actorId: ownerId, task: "summarize", connectionId: row.id });
  let clock = FROZEN_NOW;
  let dials = 0;
  const deadServer: typeof fetch = () => {
    dials += 1;
    return Promise.reject(new TypeError("fetch failed: connect ECONNREFUSED 127.0.0.1:1"));
  };
  const runtime = await createInferenceRuntime({ ...fakeDeps({ stores, fetch: deadServer }), now: () => clock });
  const resolveStructuredBinding = createResolveStructuredBinding(runtime, (userId) => Promise.resolve(principal(userId)));

  for (let ask = 0; ask < 4; ask += 1) {
    expect(await resolveStructuredBinding(ownerId)).toMatchObject({ model: "local-model" });
    // Past the mirror's failed-warm hold, so a dialing resolve would dial again.
    clock += 11_000;
  }
  expect(dials).toBe(0);
});

test("a bound model whose connection withholds background work is named as such, not as unbound", async () => {
  const local = bound({
    allowBackground: false,
    capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } })),
  });
  expect(await planOn(local)).toEqual({ outcome: "background-refused", model: "test-model" });
});
