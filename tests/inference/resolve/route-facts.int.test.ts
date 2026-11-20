// @subject packages/inference/src/capability/floor.ts
// The controls a route alone decides are stamped onto the resolved descriptor, so the editor hides them where the
// route cannot carry them: OpenRouter's chat route compresses the chat on its side, and DeepSeek's prefix-flag
// continue carries a seeded chain of thought. A route that does neither states neither.
import type { GenerationCapability } from "@orb/contracts/inference";
import { statesKnob } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const PLAIN_MODEL = "vendor/plain-model";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

/** The provider's model list answers `rows` on its chat list and nothing on any side list. */
function listing(rows: readonly Record<string, unknown>[]): typeof fetch {
  return (input, init) => {
    const { pathname } = new URL(new Request(input, init).url);
    return Promise.resolve(Response.json({ object: "list", data: pathname.endsWith("/models") ? rows : [], models: [] }));
  };
}

async function generationOf(providerId: string, model: string): Promise<GenerationCapability> {
  await using root = await createRuntimeRoot({ providerFetch: listing([{ id: model }]) });
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: providerId, key: RUNTIME_KEY });
  const created = await root.services.connection.create({ principal, providerId, credentialId: credential.id, baseUrl: null, model });
  const { capability } = await root.services.connection.capabilities({ principal, connectionId: created.id, signal: new AbortController().signal });
  if (capability.kind !== "generation") {
    throw new Error(`${model} resolved as ${capability.kind}`);
  }
  return capability.generation;
}

test("OpenRouter's chat route offers provider-side compression and no reasoning seed", async () => {
  const generation = await generationOf("openrouter", PLAIN_MODEL);
  expect(generation.contextCompression).toBe(true);
  expect(statesKnob(generation, "providerContextCompression")).toBe(true);
  expect(generation.reasoning.seedable).toBeUndefined();
});

test("DeepSeek's prefix-flag continue carries a reasoning seed and offers no provider-side compression", async () => {
  const generation = await generationOf("deepseek", DEEPSEEK_MODEL);
  expect(generation.reasoning.seedable).toBe(true);
  expect(statesKnob(generation, "reasoningSeed")).toBe(true);
  expect(generation.contextCompression).toBeUndefined();
});

test("a plain hosted route states neither route control", async () => {
  const generation = await generationOf("nanogpt", PLAIN_MODEL);
  expect(statesKnob(generation, "providerContextCompression")).toBe(false);
  expect(statesKnob(generation, "reasoningSeed")).toBe(false);
});
