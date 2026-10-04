// verb: embedCorpus — the bulk TEXT catch-up sweep. Load-bearing assertions:
//   • a fresh sweep embeds every enumerated card through the ONE write path (rows land, counts fold);
//   • RESUMABILITY: a rerun is all hash-gate noops — zero embed calls, counts flip to skipped;
//   • `force` bypasses the staleness short-circuit (re-embeds matched rows, still ONE row per card);
//   • a vanished/empty card text is a skip, not an error;
//   • cooperative abort: an aborted signal stops the sweep between items (no further reads/embeds), and an
//     abort during an embed's wait on the model rejects the pass with no partial row;
//   • an embed failure PROPAGATES (never swallowed) — the completed items' rows survive for the rerun.

import type { Db } from "@orb/db";
import { characterEmbeddings, embedGenerations, embedSpaceState, userConnections } from "@orb/db";
import type { CharacterEmbeddingId, CharacterId, EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "@orb/server/domain/embeddings";
import { createEmbeddingsService, EmbedFailedError, SpaceMismatchError } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { StoreHarness } from "../_support.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedCharacter, seedUser } from "../_support.ts";

const STALE_MODEL = "old-embed-model-v0";
const NOW = 1_750_000_000_000;

const signal = (): AbortSignal => new AbortController().signal;

/** The width a user declares under Advanced, narrower than the fixture embedder's native `EMBED_DIM`. */
const DECLARED_DIM = 4;

/** The harness's embed connection restated at `dims`; `returned` is the width the embedder answers with. */
function restateWidth(h: StoreHarness, dims: number, mrl: boolean, returned: number): EmbeddingsContext {
  h.roleClients.embed.mockImplementation((input) =>
    Promise.resolve({
      vectors: (typeof input === "string" ? [input] : input).map((_, i) => fakeVector(returned, i + 1)),
      model: EMBED_MODEL,
      usage: { promptTokens: null, totalTokens: null },
    }),
  );
  return {
    ...h.ctx,
    resolveEmbeddingConnection: async (ownerId, task, connectionId): ReturnType<EmbeddingsContext["resolveEmbeddingConnection"]> => {
      const connection = await h.ctx.resolveEmbeddingConnection(ownerId, task, connectionId);
      return connection === null || connection.capability.kind !== "embedding"
        ? connection
        : { ...connection, capability: { ...connection.capability, embedding: { ...connection.capability.embedding, dims, mrl } } };
    },
  };
}

async function seedTwoCards(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  owner: UserId;
  a: CharacterId;
  b: CharacterId;
  ids: readonly CharacterId[];
  texts: ReadonlyMap<CharacterId, string>;
}> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const a = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
  const b = await seedCharacter(db, owner, { id: "character_b", name: "Bryn" });
  return {
    owner,
    a,
    b,
    ids: [a, b],
    texts: new Map([
      [a, "Aria — a curious traveler."],
      [b, "Bryn — a grumpy blacksmith."],
    ]),
  };
}

async function seedHarnessConnection(db: Db, ownerId: UserId, harness: StoreHarness): Promise<void> {
  const resolved = await harness.roleClients.resolved("embed");
  if (resolved === null) {
    throw new Error("the corpus fixture needs an embed connection");
  }
  await db
    .insert(userConnections)
    .values({ id: resolved.connectionId, ownerId, label: "corpus embed", providerId: resolved.providerId, model: resolved.model })
    .onConflictDoNothing();
}

async function seedDetachedGeneration(db: Db, ownerId: UserId, model: string): Promise<EmbedGenerationId> {
  const id = castId<EmbedGenerationId>(`embed_generation_${ownerId}_${model}`);
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task: "embed",
      via: "embed",
      connectionId: null,
      connectionRef: castId<UserConnectionId>(`fixture:${model}`),
      fingerprint: `fixture:${model}`,
      space: model,
      createdAt: NOW,
    })
    .onConflictDoNothing();
  return id;
}

describe("embedCorpus — the bulk card-text sweep", () => {
  test("a fresh sweep embeds every card; rows land in character_embeddings", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 2, skipped: 0 });
    expect(h.roleClients.embed).toHaveBeenCalledTimes(2);
    expect(await db.select().from(characterEmbeddings)).toHaveLength(2);
  });

  test("the sweep hands back each position, so an embedder switch's re-index shows N of M", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);
    const progress: (readonly [number, number])[] = [];

    await svc.embedCorpus({ ownerId: null, force: false, signal: signal(), onProgress: (done, total) => progress.push([done, total]) });

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  test("RESUMABLE: a rerun is all content_hash noops — zero re-embeds, no extra rows", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });
    const rerun = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    expect(rerun).toEqual({ embedded: 0, skipped: 2 });
    // The staleness gate short-circuited BEFORE the embed — still only the first sweep's two calls.
    expect(h.roleClients.embed).toHaveBeenCalledTimes(2);
    expect(await db.select().from(characterEmbeddings)).toHaveLength(2);
  });

  test("force re-embeds matched rows (the deliberate full re-index) — still one row per card", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });
    const forced = await svc.embedCorpus({ ownerId: null, force: true, signal: signal() });

    expect(forced).toEqual({ embedded: 2, skipped: 0 });
    expect(h.roleClients.embed).toHaveBeenCalledTimes(4);
    expect(await db.select().from(characterEmbeddings)).toHaveLength(2);
  });

  test("a vanished or empty card text is a skip, not an error", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    // `a` resolves no text (deleted mid-sweep); `b` resolves an empty projection.
    const h = makeStoreHarness(db, {
      characterIds: seeded.ids,
      cardTexts: new Map([[seeded.b, ""]]),
    });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 0, skipped: 2 });
    expect(h.roleClients.embed).not.toHaveBeenCalled();
  });

  test("cooperative abort: an already-aborted signal does no work", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);
    const controller = new AbortController();
    controller.abort();

    const result = await svc.embedCorpus({
      ownerId: null,
      force: false,
      signal: controller.signal,
    });

    expect(result).toEqual({ embedded: 0, skipped: 0 });
    expect(h.loadCardText).not.toHaveBeenCalled();
    expect(h.roleClients.embed).not.toHaveBeenCalled();
  });

  test("an embed failure propagates; the completed items' rows survive for the rerun", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);
    // First card embeds fine (default fake), second returns a filtered/null vector → EmbedFailedError.
    h.roleClients.embed
      .mockResolvedValueOnce({
        vectors: [fakeVector()],
        model: EMBED_MODEL,
        usage: { promptTokens: null, totalTokens: null },
      })
      .mockResolvedValueOnce({
        vectors: [null],
        model: EMBED_MODEL,
        usage: { promptTokens: null, totalTokens: null },
      });

    await expect(svc.embedCorpus({ ownerId: null, force: false, signal: signal() })).rejects.toBeInstanceOf(EmbedFailedError);
    // The first card's row landed and is durable — the rerun resumes from it (hash-gated skip).
    expect(await db.select().from(characterEmbeddings)).toHaveLength(1);
    const rerun = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });
    expect(rerun).toEqual({ embedded: 1, skipped: 1 });
  });

  test("an abort while an embed waits on the model rejects the pass with no partial row and no completion", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    const svc = createEmbeddingsService(h.ctx);
    const controller = new AbortController();
    // The first card embeds; the second waits on a model that never answers until the sweep's own signal
    // fires, the case a shutdown hits while a model is still loading.
    h.roleClients.embed
      .mockResolvedValueOnce({ vectors: [fakeVector()], model: EMBED_MODEL, usage: { promptTokens: null, totalTokens: null } })
      .mockImplementationOnce((_input, opts) => {
        const sweepSignal = (opts as { readonly signal?: AbortSignal } | undefined)?.signal;
        if (sweepSignal === undefined) {
          return Promise.reject(new Error("the sweep's signal did not reach the embed call"));
        }
        const cut = Promise.withResolvers<never>();
        sweepSignal.addEventListener("abort", () => {
          cut.reject(sweepSignal.reason);
        });
        controller.abort(new Error("shutdown"));
        return cut.promise;
      });

    await expect(svc.embedCorpus({ ownerId: null, force: false, signal: controller.signal })).rejects.toThrow("shutdown");

    expect(await db.select().from(characterEmbeddings)).toHaveLength(1);
    expect(await db.select().from(embedSpaceState)).toEqual([]);
  });
});

describe("embedCorpus — retained generation rebuild", () => {
  test("a completed BULK card sweep retains the active corpus until the other embed scopes complete", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
    const staleGenerationId = await seedDetachedGeneration(db, owner, STALE_MODEL);
    // A row stranded in an OLD `(model, dim)` space (a prior embed model, since changed). Inserted raw: the store
    // refuses a write for a generation that is no target.
    await db.insert(characterEmbeddings).values({
      id: castId<CharacterEmbeddingId>("character_embedding_stale"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 9),
      contentHash: "stale",
      model: STALE_MODEL,
      generationId: staleGenerationId,
      dim: EMBED_DIM,
      createdAt: NOW,
    });
    const h = makeStoreHarness(db, {
      characterIds: [characterId],
      cardTexts: new Map([[characterId, "Aria — a curious traveler."]]),
    });
    await seedHarnessConnection(db, owner, h);
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    // Reindexed: the card embedded into the box's active space (EMBED_MODEL) — the re-enqueue half.
    expect(result).toEqual({ embedded: 1, skipped: 0 });
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);
    // Cards alone cannot promote the pending generation. The old active corpus remains readable until
    // memory and document receipts complete the same target; the joint-promotion suite owns final reclaim.
    const rows = await db.select().from(characterEmbeddings);
    expect(rows.map((row) => row.model).sort()).toEqual([EMBED_MODEL, STALE_MODEL].sort());
  });

  test("a SINGULAR card sweep retains each owner's active corpus while only that owner's pending row lands", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const neighbour = await seedUser(db, { handle: castId<Handle>("neighbour") });
    const characterId = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
    const neighbourCard = await seedCharacter(db, neighbour, { id: "character_n", name: "Nils" });
    const ownerStaleGenerationId = await seedDetachedGeneration(db, owner, STALE_MODEL);
    const neighbourStaleGenerationId = await seedDetachedGeneration(db, neighbour, STALE_MODEL);
    for (const [id, card, generationId] of [
      ["character_embedding_stale", characterId, ownerStaleGenerationId],
      ["character_embedding_neighbour", neighbourCard, neighbourStaleGenerationId],
    ] as const) {
      await db.insert(characterEmbeddings).values({
        id: castId<CharacterEmbeddingId>(id),
        characterId: card,
        embedding: fakeVector(EMBED_DIM, 9),
        contentHash: "stale",
        model: STALE_MODEL,
        generationId,
        dim: EMBED_DIM,
        createdAt: NOW,
      });
    }
    const h = makeStoreHarness(db, {
      characterIds: [characterId],
      cardTexts: new Map([[characterId, "Aria — a curious traveler."]]),
    });
    await seedHarnessConnection(db, owner, h);
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedCorpus({ ownerId: owner, force: false, signal: signal() });

    // The owner's pending row lands without reclaiming either active corpus. Promotion remains owner-scoped,
    // and cannot occur until that owner's memory and document scopes complete the same target.
    const rows = await db.select().from(characterEmbeddings);
    expect(rows.map((r) => [r.characterId, r.model]).sort()).toEqual(
      [
        [characterId, STALE_MODEL],
        [characterId, EMBED_MODEL],
        [neighbourCard, STALE_MODEL],
      ].sort(),
    );
  });
});

// A declared width narrower than the encoder's native one is a generation change: the switch deletes the old
// index, so the rebuild must write at the declared width or the user loses their index for nothing.
describe("embedCorpus — a declared vector width", () => {
  test("an MRL model rebuilds at the declared width, even over a full-width seeded vector", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    await createEmbeddingsService(h.ctx).embedCorpus({ ownerId: null, force: false, signal: signal() });
    // The built-in content ships vectors precomputed at the encoder's native width.
    const ctx = {
      ...restateWidth(h, DECLARED_DIM, true, DECLARED_DIM),
      precomputedEmbedding: () => ({ model: EMBED_MODEL, vector: fakeVector(EMBED_DIM, 5) }),
    };

    const result = await createEmbeddingsService(ctx).embedCorpus({ ownerId: null, force: true, signal: signal() });

    expect(result).toEqual({ embedded: 2, skipped: 0 });
    expect((await db.select({ dim: characterEmbeddings.dim }).from(characterEmbeddings)).map((row) => row.dim)).toEqual([DECLARED_DIM, DECLARED_DIM]);
  });

  test("a width the embedder does not make is refused before the old index is deleted", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    await seedHarnessConnection(db, seeded.owner, h);
    await createEmbeddingsService(h.ctx).embedCorpus({ ownerId: null, force: false, signal: signal() });
    const ctx = restateWidth(h, DECLARED_DIM, false, EMBED_DIM);

    await expect(createEmbeddingsService(ctx).embedCorpus({ ownerId: null, force: true, signal: signal() })).rejects.toBeInstanceOf(SpaceMismatchError);

    expect((await db.select({ dim: characterEmbeddings.dim }).from(characterEmbeddings)).map((row) => row.dim)).toEqual([EMBED_DIM, EMBED_DIM]);
  });
});
