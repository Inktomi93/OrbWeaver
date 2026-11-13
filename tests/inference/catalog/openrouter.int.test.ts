// @subject packages/inference/src/catalog/openrouter.ts
// The OpenRouter catalog is three lists. A failed embeddings or rerank list still lets the add dialog list the chat
// models, and never reaches the catalog mirror, whose stored snapshot the resolve path reads kinds from.
import type { ModelListing } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, TASK_DEFS } from "@orb/contracts/inference";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createRuntimeRoot, RUNTIME_KEY } from "../roles/runtime.fixtures.ts";

const OPENROUTER = BUILTIN_PROVIDERS.find((provider) => provider.dialect === "openrouter");
const CHAT_MODEL = "vendor/chat-model";
const EMBEDDING_MODEL = "vendor/embedding-model";
const RERANK_MODEL = "vendor/rerank-model";
const KIND_QUERY_KEY = "output_modalities";

const LIST_NAMES = ["chat", "embeddings", "rerank"] as const;
type ListName = (typeof LIST_NAMES)[number];
type KindList = Exclude<ListName, "chat">;
const KIND_LISTS = ["embeddings", "rerank"] as const satisfies readonly KindList[];

const ROWS: Record<ListName, Record<string, unknown>> = {
  chat: { id: CHAT_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] } },
  embeddings: { id: EMBEDDING_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["embeddings"] } },
  rerank: { id: RERANK_MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["rerank"] } },
};

function openRouter(): NonNullable<typeof OPENROUTER> {
  if (OPENROUTER === undefined) {
    throw new Error("the built-in providers carry no OpenRouter row");
  }
  return OPENROUTER;
}

function listNameOf(url: URL): ListName {
  const kind = url.searchParams.get(KIND_QUERY_KEY);
  return LIST_NAMES.find((name) => name === kind) ?? "chat";
}

/** OpenRouter's keyless catalog host: each list answers its one row, except the lists in `down`, whose dial fails. */
function catalogHost(down: ReadonlySet<ListName>): typeof fetch {
  return (input, init) => {
    const list = listNameOf(new URL(new Request(input, init).url));
    if (down.has(list)) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    return Promise.resolve(Response.json({ data: [ROWS[list]] }));
  };
}

/** The add dialog's model-list read for OpenRouter, through the production connection verb. */
async function draftList(root: ServerTestHarness): Promise<ModelListing> {
  return await root.services.connection.draftCatalogModels({ principal: await root.principalFor(root.ownerId), providerId: openRouter().id });
}

function listedIds(listing: ModelListing): readonly string[] {
  return listing.listed ? listing.models.map((model) => model.id) : [];
}

test("every list answering lists all three kinds", async () => {
  await using root = await createRuntimeRoot({ providerFetch: catalogHost(new Set<ListName>()) });
  expect(listedIds(await draftList(root))).toEqual([CHAT_MODEL, EMBEDDING_MODEL, RERANK_MODEL]);
});

test.for(KIND_LISTS)("the add dialog lists the chat models when only the %s list fails", async (failed) => {
  await using root = await createRuntimeRoot({ providerFetch: catalogHost(new Set([failed])) });
  const answered = LIST_NAMES.filter((name) => name !== failed).map((name) => ROWS[name]["id"]);
  expect(listedIds(await draftList(root))).toEqual(answered);
});

test("a failed chat list names the provider and the failure class, never the request path or query", async () => {
  await using root = await createRuntimeRoot({ providerFetch: catalogHost(new Set<ListName>(["chat"])) });
  const listing = await draftList(root);
  expect(listing.listed).toBe(false);
  const reason = listing.listed ? "" : listing.reason;
  expect(reason).toContain(openRouter().label);
  expect(reason).not.toContain(KIND_QUERY_KEY);
  expect(reason).not.toMatch(/[?/=]/u);
});

test("a refresh that loses the embeddings list keeps the stored catalog an embedding connection reads its kind from", async () => {
  const down = new Set<ListName>();
  await using root = await createRuntimeRoot({ providerFetch: catalogHost(down) });
  const principal = await root.principalFor(root.ownerId);
  const provider = openRouter();
  // A full catalog is fetched and stored first.
  expect(listedIds(await draftList(root))).toContain(EMBEDDING_MODEL);
  const credential = await root.services.credentials.add({ principal, provider: provider.id, key: RUNTIME_KEY });
  const row = await root.services.connection.create({
    principal,
    providerId: provider.id,
    credentialId: credential.id,
    baseUrl: null,
    model: EMBEDDING_MODEL,
  });
  // Positive control: the stored catalog makes the row an embedder.
  expect(nonEmpty(row.tasks).every((task) => TASK_DEFS[task].kind === "embedding")).toBe(true);

  down.add("embeddings");
  await root.services.connection.refreshCatalog({ providerId: provider.id });
  // The read that asked during the outage still lists the chat models.
  expect(listedIds(await draftList(root))).toEqual([CHAT_MODEL, RERANK_MODEL]);
  // The partial catalog reached neither the held copy nor the snapshot, so the row is still read as an embedder.
  const after = await root.services.connection.get({ principal, connectionId: row.id });
  expect(after.tasks).toEqual(row.tasks);
});
