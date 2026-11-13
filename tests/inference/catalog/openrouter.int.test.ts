// @subject packages/inference/src/catalog/openrouter.ts
import type { ModelListing } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot } from "../roles/runtime.fixtures.ts";

const OPENROUTER = BUILTIN_PROVIDERS.find((provider) => provider.dialect === "openrouter");
const CHAT_MODEL = "vendor/chat-model";
const EMBEDDING_MODEL = "vendor/embedding-model";
const RERANK_MODEL = "vendor/rerank-model";
const KIND_QUERY_KEY = "output_modalities";

const LIST_NAMES = ["chat", "embeddings", "rerank"] as const;
type ListName = (typeof LIST_NAMES)[number];

const ROWS: Record<ListName, Record<string, unknown>> = {
  chat: { id: CHAT_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] } },
  embeddings: { id: EMBEDDING_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["embeddings"] } },
  rerank: { id: RERANK_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["rerank"] } },
};

function listNameOf(url: URL): ListName {
  const kind = url.searchParams.get(KIND_QUERY_KEY);
  return LIST_NAMES.find((name) => name === kind) ?? "chat";
}

/** OpenRouter's keyless catalog host: each list answers its one row, except the lists named in `down`, whose dial fails. */
function catalogHost(down: readonly ListName[]): typeof fetch {
  return (input, init) => {
    const list = listNameOf(new URL(new Request(input, init).url));
    if (down.includes(list)) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    return Promise.resolve(Response.json({ data: [ROWS[list]] }));
  };
}

/** The add dialog's model-list read for OpenRouter, through the production connection verb. */
async function listOpenRouter(down: readonly ListName[]): Promise<ModelListing> {
  await using root = await createRuntimeRoot({ providerFetch: catalogHost(down) });
  return await root.services.connection.draftCatalogModels({ principal: await root.principalFor(root.ownerId), providerId: OPENROUTER?.id ?? "" });
}

function listedIds(listing: ModelListing): readonly string[] {
  return listing.listed ? listing.models.map((model) => model.id) : [];
}

test("the chat model list loads when only the embeddings sub-catalog fails", async () => {
  expect(listedIds(await listOpenRouter(["embeddings"]))).toEqual([CHAT_MODEL, RERANK_MODEL]);
});

test("every sub-catalog answering lists all three kinds", async () => {
  expect(listedIds(await listOpenRouter([]))).toEqual([CHAT_MODEL, EMBEDDING_MODEL, RERANK_MODEL]);
});

test("a failed chat catalog names the provider, never the request path or query", async () => {
  const listing = await listOpenRouter(["chat"]);
  expect(listing.listed).toBe(false);
  const reason = listing.listed ? "" : listing.reason;
  expect(reason).toContain(OPENROUTER?.label);
  expect(reason).not.toContain(KIND_QUERY_KEY);
  expect(reason).not.toMatch(/[?/]/u);
});
