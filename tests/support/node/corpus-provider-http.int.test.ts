// @subject tests/support/node/corpus-provider.ts
// The population case creates the 144-card regression population and indexes it through a real workload: intrinsic producer work, slow tag.
import { createCharacterSchema } from "@orb/contracts/character";
import { characterEmbeddings, characters, embeddingCalls } from "@orb/db";
import { seedCorpusConnections } from "./corpus-actors.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_BODY_LIMIT_BYTES,
  createCorpusProviderExecution,
  createCorpusProviderServer,
} from "./corpus-provider.ts";
import { createCorpusProviderTransport, createCorpusRecipeExecution } from "./corpus-recipe.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native corpus provider serves the existing script and retires its socket", async () => {
  await using provider = await createCorpusProviderServer(async (baseUrl) =>
    createCorpusProviderExecution({
      baseUrl,
      modelIds: [CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "",
      structuredReplies: new Map(),
      images: [],
    }),
  );
  const endpoint = `${provider.baseUrl}/embeddings`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ model: CORPUS_EMBED_MODEL, input: ["native corpus witness", "second witness"] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      model: CORPUS_EMBED_MODEL,
      data: [
        { index: 0, embedding: [...CORPUS_EMBEDDING_VECTOR] },
        { index: 1, embedding: [...CORPUS_EMBEDDING_VECTOR] },
      ],
    });
    const rejected = await fetch(endpoint, { method: "POST", body: "private-malformed-input" });
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).not.toContain("private-malformed-input");
    const unknown = await fetch(`${provider.baseUrl}/unscripted`, { method: "POST", body: JSON.stringify({ model: CORPUS_EMBED_MODEL }) });
    expect(unknown.status).toBe(400);
    await unknown.text();
    const oversized = await fetch(endpoint, { method: "POST", body: "x".repeat(CORPUS_PROVIDER_BODY_LIMIT_BYTES + 1) });
    expect(oversized.status).toBe(413);
    await oversized.text();
    expect(provider.requests).toEqual(["POST /v1/embeddings", "POST /v1/embeddings", "POST /v1/unscripted"]);
  } finally {
    await provider[Symbol.asyncDispose]();
  }
  await expect(fetch(endpoint, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
  await provider[Symbol.asyncDispose]();
});

test("native corpus provider releases its listener when script construction fails", async () => {
  let endpoint = "";
  await expect(
    createCorpusProviderServer((baseUrl) => {
      endpoint = baseUrl;
      return Promise.reject(new Error("script unavailable"));
    }),
  ).rejects.toThrow("script unavailable");
  await expect(fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(1000) })).rejects.toThrow();
});

test("request-sensitive corpus embeddings preserve real near-duplicates without collapsing a nonempty native workload population", {
  tags: "slow",
}, async () => {
  const population = 144;
  await using provider = await createCorpusProviderServer(async (baseUrl) => (await createCorpusRecipeExecution(baseUrl)).execution);
  const transport = createCorpusProviderTransport(provider.baseUrl);
  await using root = await createServerHarness({ logLevel: "error", startJobs: false, providerFetch: transport.fetch, networkExecution: transport });
  const principal = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({
    principal,
    partial: { corpusAutoindex: false, privateEndpointAllowlist: [new URL(provider.baseUrl).hostname] },
  });
  const connections = await seedCorpusConnections(root, principal);
  await root.services.connection.update({ principal, connectionId: connections.embed.id, patch: { baseUrl: provider.baseUrl } });
  const cards: Awaited<ReturnType<typeof root.services.character.create>>[] = [];
  for (let index = 0; index < population - 2; index += 1) {
    cards.push(
      await root.services.character.create({
        principal,
        input: createCharacterSchema.parse({
          handle: `physical-card-${index}`,
          name: `Unrelated witness ${index}`,
          description: `Inventory entry ${index} records its distinct controlled physical input.`,
        }),
      }),
    );
  }
  const pair: typeof cards = [];
  for (const [index, text] of ["Harbor copper lantern", "HARBOR   COPPER LANTERN"].entries()) {
    const card = await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: `physical-near-${index}`, name: index === 0 ? "Boundary witness" : "BOUNDARY WITNESS", description: text }),
    });
    cards.push(card);
    pair.push(card);
  }
  const caller = await root.internalCallerFor(root.ownerId);
  await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ mode: "singular", input: { kind: "index", params: { source: "text", force: true } } }),
  ]);
  const vectors = await root.db.select().from(characterEmbeddings);
  expect(vectors).toHaveLength(population);
  expect(vectors.every((row) => cards.some((card) => card.id === row.characterId) && row.dim === CORPUS_EMBEDDING_VECTOR.length)).toBe(true);
  expect(new Set(vectors.filter((row) => pair.some((card) => card.id === row.characterId)).map((row) => row.contentHash)).size).toBe(2);
  const [job] = await settleCorpusWorkloads(root, caller, [await caller.workloads.start({ mode: "singular", input: { kind: "find-duplicates", params: {} } })]);
  expect(job).toMatchObject({ status: "succeeded", result: { scanned: population, written: 1 } });
  const duplicates = await caller.discovery.duplicateCharacters();
  expect(duplicates).toHaveLength(1);
  expect(new Set([duplicates[0]?.characterIdA, duplicates[0]?.characterIdB])).toEqual(new Set(pair.map((card) => card.id)));
  expect(duplicates[0]?.similarity).toBeCloseTo(1);
  expect(duplicates.some((row) => row.characterIdA === cards[0]?.id || row.characterIdB === cards[0]?.id)).toBe(false);
  const [first, second] = pair;
  if (first === undefined || second === undefined) {
    throw new Error("native near-duplicate controls were not created");
  }
  const query = await root.services.character.loadCardText(first.id);
  if (query === null) {
    throw new Error("native near-duplicate control has no embeddable text");
  }
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const document = await caller.databank.createFromText({
    name: "Physical encoder witness",
    text: "A controlled native document completes its encoder generation.",
  });
  const ingested = await root.app.databankIngest.ingestDocument({ documentId: document.document.id, signal: new AbortController().signal });
  expect(ingested.failed).toEqual([]);
  expect(ingested.chunksUpserted).toBeGreaterThan(0);
  await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ mode: "singular", input: { kind: "memory-backfill", params: {} } }),
    await caller.workloads.start({ mode: "singular", input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } } }),
  ]);
  const search = await caller.search.search({ query, over: "characters", scope: { kind: "owner" }, topN: 2, rerank: false });
  if (search.over !== "characters") {
    throw new Error("native character search returned another output family");
  }
  expect(search.hits.map((hit) => hit.characterId).toSorted()).toEqual(pair.map((card) => card.id).toSorted());
  const generation = await root.app.embeddings.resolveGeneration(root.ownerId, "embed");
  if (generation === null) {
    throw new Error("native encoder generation was not resolved");
  }
  const inputs = [query, "An unrelated cobalt ferry leaves the estuary."];
  const batch = await generation.connection.embed(inputs, { inputType: "document" });
  const single = await generation.connection.embed(query, { inputType: "query" });
  const reordered = await generation.connection.embed(inputs.toReversed());
  expect(batch.vectors[0]).toEqual(single.vectors[0]);
  expect(reordered.vectors).toEqual(batch.vectors.toReversed());
  expect(batch.vectors[0]).not.toEqual(batch.vectors[1]);
  expect(await root.db.select().from(characters)).toHaveLength(population);
  expect((await root.db.select().from(embeddingCalls)).every((row) => row.outcome === "completed")).toBe(true);
  expect(provider.requests).toContain("POST /v1/embeddings");
});
