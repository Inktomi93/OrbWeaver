// @subject packages/inference/src/capability/floor.ts
// A hosted route keeps the fail-closed text-only input for a model nothing describes, and marks it assumed, so the
// editor and the add step can tell it from a model whose list or row states text only. An endpoint row's own server
// posture is unchanged: an undescribed model there opens to image and video, also marked.
import type { GenerationCapability } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot, RUNTIME_ENDPOINT, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const PLAIN_MODEL = "vendor/plain-model";

/** The provider's model list answers `rows` on its chat list and nothing on any side list. */
function listing(rows: readonly Record<string, unknown>[]): typeof fetch {
  return (input, init) => {
    const { pathname } = new URL(new Request(input, init).url);
    return Promise.resolve(Response.json({ object: "list", data: pathname.endsWith("/models") ? rows : [], models: [] }));
  };
}

type InputFacts = Pick<GenerationCapability, "input" | "modalitiesEstimated">;

async function inputOf(providerId: string, model: string, rows: readonly Record<string, unknown>[] = []): Promise<InputFacts> {
  await using root = await createRuntimeRoot({ providerFetch: listing(rows) });
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: providerId, key: RUNTIME_KEY });
  const baseUrl = providerId === "vllm" ? RUNTIME_ENDPOINT : null;
  const created = await root.services.connection.create({ principal, providerId, credentialId: credential.id, baseUrl, model });
  const { capability } = await root.services.connection.capabilities({ principal, connectionId: created.id, signal: new AbortController().signal });
  if (capability.kind !== "generation") {
    throw new Error(`${model} resolved as ${capability.kind}`);
  }
  return { input: capability.generation.input, modalitiesEstimated: capability.generation.modalitiesEstimated };
}

test("a hosted model nothing describes reads as text only, marked assumed", async () => {
  expect(await inputOf("nanogpt", PLAIN_MODEL)).toEqual({ input: ["text"], modalitiesEstimated: true });
});

test("a hosted model whose list states text only carries no mark", async () => {
  const stated = { id: PLAIN_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] } };
  expect(await inputOf("nanogpt", PLAIN_MODEL, [stated])).toEqual({ input: ["text"], modalitiesEstimated: undefined });
});

test("a model a hosted catalog states as text only carries no mark", async () => {
  const stated = { id: PLAIN_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] }, ["supported_parameters"]: [] };
  expect(await inputOf("openrouter", PLAIN_MODEL, [stated])).toEqual({ input: ["text"], modalitiesEstimated: undefined });
});

test("a hosted model a curated row describes carries no mark", async () => {
  expect(await inputOf("google", "gemini-2.5-flash")).toEqual({ input: ["text", "image", "video", "audio", "file"], modalitiesEstimated: undefined });
});

test("an undescribed model on the user's own server still opens to image and video, marked", async () => {
  expect(await inputOf("vllm", PLAIN_MODEL)).toEqual({ input: ["text", "image", "video"], modalitiesEstimated: true });
});
