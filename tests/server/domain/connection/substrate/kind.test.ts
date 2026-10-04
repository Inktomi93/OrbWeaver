// The model KIND the connection domain reads (`runtime.modelKind`), shared by the list view, the bindings writer and
// the diagnostics so they cannot disagree about which slots a row may take. The precedence is the contract: the row's
// own `declared.kind` wins, then what the provider's catalog states, then the curated table, else `generation`.

import { createInferenceRuntime } from "@orb/inference";
import { fakeConnection, fakeDeps, memoryStores, newUserId } from "../../../../inference/_support.ts";
import { expect, test } from "../../../../support/fixtures.ts";

async function kindOf(row: Parameters<typeof fakeConnection>[0]): Promise<string> {
  const runtime = await createInferenceRuntime(fakeDeps({ stores: memoryStores() }));
  return await runtime.modelKind(fakeConnection(row), { cachedFacts: true });
}

test("the curated table answers a known model, and the row's own declaration wins over it", async () => {
  const ownerId = newUserId();
  expect(await kindOf({ ownerId, providerId: "local-light", model: "jinaai/jina-clip-v2" })).toBe("embedding");
  expect(await kindOf({ ownerId, providerId: "local-light", model: "jinaai/jina-clip-v2", declared: { kind: "rerank" } })).toBe("rerank");
});

test("the curated lookup is keyed on the provider too, and a model nothing describes reads as generation", async () => {
  const ownerId = newUserId();
  const elsewhere = { ownerId, providerId: "custom-openai", baseUrl: "http://127.0.0.1:18703/v1" } as const;
  expect(await kindOf({ ...elsewhere, model: "jinaai/jina-clip-v2" })).toBe("generation");
  expect(await kindOf({ ...elsewhere, model: "some-private-finetune" })).toBe("generation");
});
