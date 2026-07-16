// verb: embedCorpus — the PD-53 bulk TEXT catch-up sweep. Load-bearing assertions:
//   • a fresh sweep embeds every enumerated card through the ONE write path (rows land, counts fold);
//   • RESUMABILITY: a rerun is all hash-gate noops — zero embed calls, counts flip to skipped;
//   • `force` bypasses the staleness short-circuit (re-embeds matched rows, still ONE row per card);
//   • a vanished/empty card text is a skip, not an error;
//   • cooperative abort: an aborted signal stops the sweep between items (no further reads/embeds);
//   • an embed failure PROPAGATES (never swallowed) — the completed items' rows survive for the rerun.

import { characterEmbeddings } from "@orb/db";
import type { CharacterEmbeddingId, CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService, EmbedFailedError } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { upsertCharacterEmbedding } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_DIM, EMBED_MODEL, fakeVector, makeStoreHarness, seedCharacter, seedUser } from "../_support.ts";

const STALE_MODEL = "old-embed-model-v0";
const NOW = 1_750_000_000_000;

const signal = (): AbortSignal => new AbortController().signal;

async function seedTwoCards(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  a: CharacterId;
  b: CharacterId;
  ids: readonly CharacterId[];
  texts: ReadonlyMap<CharacterId, string>;
}> {
  const owner = await seedUser(db, { handle: "owner" });
  const a = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
  const b = await seedCharacter(db, owner, { id: "character_b", name: "Bram" });
  return {
    a,
    b,
    ids: [a, b],
    texts: new Map([
      [a, "Aria — a curious traveler."],
      [b, "Bram — a grumpy blacksmith."],
    ]),
  };
}

describe("embedCorpus — the bulk card-text sweep", () => {
  test("a fresh sweep embeds every card; rows land in character_embeddings", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 2, skipped: 0 });
    expect(h.roleClients.embed).toHaveBeenCalledTimes(2);
    expect(await db.select().from(characterEmbeddings)).toHaveLength(2);
  });

  test("RESUMABLE: a rerun is all content_hash noops — zero re-embeds, no extra rows", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
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
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 0, skipped: 2 });
    expect(h.roleClients.embed).not.toHaveBeenCalled();
  });

  test("cooperative abort: an already-aborted signal does no work", async () => {
    const db = await freshDb();
    const seeded = await seedTwoCards(db);
    const h = makeStoreHarness(db, { characterIds: seeded.ids, cardTexts: seeded.texts });
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
});

describe("embedCorpus — PD-104 purge+reindex of the old vector space", () => {
  test("a completed BULK sweep re-embeds into the active space AND purges the stranded old-model rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
    // A row stranded in an OLD `(model, dim)` space (a prior embed model, since changed).
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_stale"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 9),
      contentHash: "stale",
      model: STALE_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    const h = makeStoreHarness(db, {
      characterIds: [characterId],
      cardTexts: new Map([[characterId, "Aria — a curious traveler."]]),
    });
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedCorpus({ ownerId: null, force: false, signal: signal() });

    // Reindexed: the card embedded into the box's active space (EMBED_MODEL) — the re-enqueue half.
    expect(result).toEqual({ embedded: 1, skipped: 0 });
    expect(h.roleClients.embed).toHaveBeenCalledTimes(1);
    // Purged: the stale-model row is gone, ONLY the active-space row remains — no orphan stranded.
    const rows = await db.select().from(characterEmbeddings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(EMBED_MODEL);
  });

  test("a SINGULAR per-owner sweep re-embeds but does NOT purge the global old space (bulk-only reclaim)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner, { id: "character_a", name: "Aria" });
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_stale"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 9),
      contentHash: "stale",
      model: STALE_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    const h = makeStoreHarness(db, {
      characterIds: [characterId],
      cardTexts: new Map([[characterId, "Aria — a curious traveler."]]),
    });
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedCorpus({ ownerId: owner, force: false, signal: signal() });

    // The active-space row was written, but the stale row SURVIVES — a per-owner pass must not delete the
    // box-global old space (a model change is a box-level event → a bulk reindex reclaims it).
    const models = (await db.select().from(characterEmbeddings)).map((r) => r.model).sort();
    expect(models).toEqual([EMBED_MODEL, STALE_MODEL].sort());
  });
});
