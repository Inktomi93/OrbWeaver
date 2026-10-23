import { planStructuredFor } from "@orb/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { z } from "zod";
import { createRuntimeRoot, generationCapability, wireConnection } from "../roles/runtime.fixtures.ts";

test("real resolved connections plan text-only and native-format turns without inventing or losing selection", async () => {
  await using root = await createRuntimeRoot();
  const connection = await wireConnection(root, {
    task: "chat",
    providerId: "custom-openai",
    model: "plan-presence-model",
    capability: generationCapability(),
    declaredFeatures: { structuredMode: "strict-compatible", strictJson: "default-on" },
  });
  const text = planStructuredFor(connection, {});
  expect(text).toMatchObject({ ok: true });
  expect(text).not.toHaveProperty("shape");
  expect(text).not.toHaveProperty("responseFormat");
  const selected = planStructuredFor(connection, {
    formats: [{ name: "answer", schema: projectJsonSchema(z.strictObject({ answer: z.string() })) }],
    tools: [{ name: "lookup", description: "Look up a fact", parameters: { type: "object", properties: {}, additionalProperties: false } }],
  });
  expect(selected).toMatchObject({ ok: true, shape: 0, responseFormat: { name: "answer", vehicle: "response-format" }, tools: [{ name: "lookup" }] });
});
