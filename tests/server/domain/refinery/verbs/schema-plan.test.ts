// @subject packages/server/src/domain/refinery/verbs/schema-plan.ts

import { NoConnectionError } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { createPlanSchema, createResolveStructuredBinding } from "@orb/server/domain/refinery";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { makeResolved, TEST_OWNER_ID } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { z } from "zod";

const SCHEMA = projectJsonSchema(z.object({ answer: z.string() }));

test("cached resolution carries the row-derived Principal and only NoConnection degrades to unbound", async () => {
  const actor = principal(TEST_OWNER_ID, { role: "user" });
  const resolved = makeResolved({ task: "structured", allowBackground: false });
  const resolve = vi.fn<Parameters<typeof createResolveStructuredBinding>[0]["resolve"]>().mockResolvedValue({ resolved, warnings: [] });
  const principalOf = vi.fn(async () => actor);
  const binding = createResolveStructuredBinding({ resolve, principalOf });
  expect(await binding(TEST_OWNER_ID)).toBe(resolved);
  expect(principalOf).toHaveBeenCalledWith(TEST_OWNER_ID);
  expect(resolve).toHaveBeenLastCalledWith({ task: "structured", principal: actor, cachedFacts: true });
  resolve.mockRejectedValueOnce(new NoConnectionError("no binding"));
  expect(await binding(TEST_OWNER_ID)).toBeNull();
  const failure = new Error("stored resolver failed");
  resolve.mockRejectedValueOnce(failure);
  await expect(binding(TEST_OWNER_ID)).rejects.toBe(failure);
});

test("unbound and background refusal precede preset reads, while a funded vehicle-less model remains a model refusal", async () => {
  const params = vi.fn<Parameters<typeof createPlanSchema>[0]["resolveUtilityPresetParams"]>().mockResolvedValue(undefined);
  const resolveStructuredBinding = vi.fn<Parameters<typeof createPlanSchema>[0]["resolveStructuredBinding"]>().mockResolvedValue(null);
  const plan = createPlanSchema({ resolveStructuredBinding, resolveUtilityPresetParams: params });
  expect(await plan(TEST_OWNER_ID, SCHEMA)).toEqual({ outcome: "unbound" });
  const connection = makeResolved({ task: "structured", allowBackground: false });
  resolveStructuredBinding.mockResolvedValue(connection);
  expect(await plan(TEST_OWNER_ID, SCHEMA)).toEqual({ outcome: "background-refused", model: connection.model });
  expect(params).not.toHaveBeenCalled();
  resolveStructuredBinding.mockResolvedValue(makeResolved({ task: "structured", allowBackground: true }));
  expect(await plan(TEST_OWNER_ID, SCHEMA)).toEqual({ outcome: "no-structured", model: connection.model });
  expect(params).toHaveBeenCalledWith(TEST_OWNER_ID);
  resolveStructuredBinding.mockResolvedValue(
    makeResolved({
      task: "structured",
      allowBackground: true,
      generation: { output: { maxTokens: { min: 1, max: 8192 }, structured: true, modalities: ["text"] } },
    }),
  );
  expect(await plan(TEST_OWNER_ID, SCHEMA)).toEqual({ outcome: "sends", model: connection.model, carrier: "native" });
});
