// Candidate completion receipts remain owner- and scope-scoped until every scope for a generation agrees.
// A newer target may overwrite a stale candidate receipt for the same scope, but cannot collide with another
// scope or owner. Promotion is exercised elsewhere; these pins keep the persistence belt itself honest.

import type { Db } from "@orb/db";
import { characterEmbeddings, chatParticipants, chatSegments, embedGenerations, embedGenerationTargets, embedSpaceState } from "@orb/db";
import type { CharacterEmbeddingId, CharacterId, ChatSegmentId, EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { GenerationReceipt, GenerationTask } from "../../../../../packages/server/src/domain/embeddings/contract/generation.ts";
import { upsertCharacterEmbedding } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { markGenerationComplete, switchTargetGeneration } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { readGeneration } from "../../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedUser } from "../_support.ts";

const T0 = 1_700_000_000_000;
const T1 = T0 + 60_000;

async function seedTarget(db: Db, ownerId: UserId, input: { task: GenerationTask; id: string; space: string; epoch: number }): Promise<GenerationReceipt> {
  const { task, space, epoch } = input;
  const id = castId<EmbedGenerationId>(input.id);
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task,
      via: task,
      connectionId: null,
      connectionRef: castId<UserConnectionId>(`connection:${id}`),
      fingerprint: `fingerprint:${id}`,
      space,
      createdAt: T0,
    })
    .onConflictDoNothing();
  await db
    .insert(embedGenerationTargets)
    .values({ ownerId, task, generationId: id, epoch })
    .onConflictDoUpdate({
      target: [embedGenerationTargets.ownerId, embedGenerationTargets.task],
      set: { generationId: id, epoch },
    });
  return { id, task, via: task, epoch, space };
}

test("a newer target OVERWRITES the same scope's candidate receipt — completions never accrete", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner-overwrite") });
  const first = await seedTarget(db, owner, { task: "embed", id: "generation-model-a", space: "model-a@q8", epoch: 1 });

  expect(await markGenerationComplete(db, { ownerId: owner, scope: "cards", generation: first, now: T0 })).toBe(false);
  const second = await seedTarget(db, owner, { task: "embed", id: "generation-model-b", space: "model-b@q8", epoch: 2 });
  expect(await markGenerationComplete(db, { ownerId: owner, scope: "cards", generation: second, now: T1 })).toBe(false);

  const rows = await db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ candidateGenerationId: second.id, candidateEpoch: 2, completedAt: T1 });
});

test("scopes are independent — an image completion does not overwrite the card candidate", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner-scopes") });
  const text = await seedTarget(db, owner, { task: "embed", id: "generation-text", space: "text-model", epoch: 1 });
  const image = await seedTarget(db, owner, { task: "imageEmbed", id: "generation-image", space: "image-model", epoch: 1 });

  expect(await markGenerationComplete(db, { ownerId: owner, scope: "cards", generation: text, now: T0 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId: owner, scope: "images", generation: image, now: T0 })).toBe(true);

  const rows = await db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner));
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ scope: "cards", activeGenerationId: null, candidateGenerationId: text.id }),
      expect.objectContaining({ scope: "images", activeGenerationId: image.id, candidateGenerationId: null }),
    ]),
  );
});

test("one owner's completion is invisible to another — generation reads are per-principal", async () => {
  const db = await freshDb();
  const mine = await seedUser(db, { handle: castId<Handle>("owner-mine") });
  const theirs = await seedUser(db, { handle: castId<Handle>("owner-theirs") });
  const generation = await seedTarget(db, theirs, { task: "embed", id: "generation-theirs", space: "their-model", epoch: 1 });
  await markGenerationComplete(db, { ownerId: theirs, scope: "cards", generation, now: T0 });

  expect(await readGeneration(db, mine, "embed")).toEqual({ status: "unrecorded" });
  expect(await readGeneration(db, theirs, "embed")).toEqual({ status: "moving" });
});

async function seedCardVector(db: Db, characterId: CharacterId, generation: GenerationReceipt): Promise<void> {
  await db.insert(characterEmbeddings).values({
    id: castId<CharacterEmbeddingId>(`character_embedding_${generation.id}`),
    characterId,
    embedding: new Float32Array([1, 0, 0, 0]),
    contentHash: `hash-${generation.id}`,
    model: generation.space,
    generationId: generation.id,
    dim: 4,
    createdAt: T0,
  });
}

// The ruling: no index ever holds two generations at rest. The batch that moves the target deletes the old
// generation's vectors and clears the active generation, so reads refuse until the rebuild is promoted.
test("a target switch deletes the old generation's vectors and clears the active generation in one batch", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner-switch") });
  const card = await seedCharacter(db, owner, { id: "character_switch" });
  const old = await seedTarget(db, owner, { task: "embed", id: "generation-switch-old", space: "model-a", epoch: 1 });
  await seedCardVector(db, card, old);
  for (const scope of ["cards", "memory", "documents"] as const) {
    await markGenerationComplete(db, { ownerId: owner, scope, generation: old, now: T0 });
  }
  expect(await readGeneration(db, owner, "embed")).toMatchObject({ status: "ready" });
  await db.insert(embedGenerations).values({
    id: castId<EmbedGenerationId>("generation-switch-new"),
    ownerId: owner,
    task: "embed",
    via: "embed",
    connectionId: null,
    connectionRef: castId<UserConnectionId>("connection:new"),
    fingerprint: "fingerprint:new",
    space: "model-b",
    createdAt: T1,
  });

  await switchTargetGeneration(db, {
    ownerId: owner,
    task: "embed",
    from: { generationId: old.id, epoch: 1 },
    to: castId<EmbedGenerationId>("generation-switch-new"),
  });

  expect(await db.select().from(characterEmbeddings)).toEqual([]);
  expect(await db.select({ generationId: embedGenerationTargets.generationId, epoch: embedGenerationTargets.epoch }).from(embedGenerationTargets)).toEqual([
    { generationId: "generation-switch-new", epoch: 2 },
  ]);
  expect(await readGeneration(db, owner, "embed")).toEqual({ status: "moving" });
});

test("a switch that lost the race to a newer target deletes nothing", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner-switch-race") });
  const card = await seedCharacter(db, owner, { id: "character_switch_race" });
  const newer = await seedTarget(db, owner, { task: "embed", id: "generation-race-newer", space: "model-c", epoch: 3 });
  await seedCardVector(db, card, newer);

  // A slow resolver still believes the target is the epoch-1 generation it read first.
  await switchTargetGeneration(db, {
    ownerId: owner,
    task: "embed",
    from: { generationId: castId<EmbedGenerationId>("generation-race-stale"), epoch: 1 },
    to: castId<EmbedGenerationId>("generation-race-other"),
  });

  expect((await db.select().from(characterEmbeddings)).map((row) => row.generationId)).toEqual([newer.id]);
  expect(await db.select({ generationId: embedGenerationTargets.generationId }).from(embedGenerationTargets)).toEqual([{ generationId: newer.id }]);
});

const TEXT_SCOPES = ["cards", "memory", "documents"] as const;

/** An owner on a promoted generation A, with generation B minted and two resolvers that both observed (A, 1). */
async function seedTwoResolvers(tag: string): Promise<{ db: Db; owner: UserId; card: CharacterId; before: GenerationReceipt; after: GenerationReceipt }> {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>(`owner-${tag}`) });
  const card = await seedCharacter(db, owner, { id: `character_${tag}` });
  const before = await seedTarget(db, owner, { task: "embed", id: `generation-${tag}-a`, space: "model-a", epoch: 1 });
  for (const scope of TEXT_SCOPES) {
    await markGenerationComplete(db, { ownerId: owner, scope, generation: before, now: T0 });
  }
  const afterId = castId<EmbedGenerationId>(`generation-${tag}-b`);
  await db.insert(embedGenerations).values({
    id: afterId,
    ownerId: owner,
    task: "embed",
    via: "embed",
    connectionId: null,
    connectionRef: castId<UserConnectionId>(`connection:${afterId}`),
    fingerprint: `fingerprint:${afterId}`,
    space: "model-b",
    createdAt: T1,
  });
  return { db, owner, card, before, after: { id: afterId, task: "embed", via: "embed", epoch: 2, space: "model-b" } };
}

// Two resolvers that observed the same target and resolved the same new generation: the first switch lands, the
// second must write nothing, or it wipes the rebuild's progress and the index reads "moving" forever.
test("a resolver that lost the race to the SAME target writes nothing after a scope completed", async () => {
  const { db, owner, before, after } = await seedTwoResolvers("same-mid");
  const from = { generationId: before.id, epoch: before.epoch };
  await switchTargetGeneration(db, { ownerId: owner, task: "embed", from, to: after.id });
  expect(await markGenerationComplete(db, { ownerId: owner, scope: "cards", generation: after, now: T1 })).toBe(false);

  await switchTargetGeneration(db, { ownerId: owner, task: "embed", from, to: after.id });

  expect(await markGenerationComplete(db, { ownerId: owner, scope: "memory", generation: after, now: T1 })).toBe(false);
  expect(await markGenerationComplete(db, { ownerId: owner, scope: "documents", generation: after, now: T1 })).toBe(true);
  expect(await readGeneration(db, owner, "embed")).toMatchObject({ status: "ready", generation: { id: after.id } });
});

test("a resolver that lost the race to the SAME target writes nothing after the promotion", async () => {
  const { db, owner, card, before, after } = await seedTwoResolvers("same-post");
  const from = { generationId: before.id, epoch: before.epoch };
  await switchTargetGeneration(db, { ownerId: owner, task: "embed", from, to: after.id });
  await seedCardVector(db, card, after);
  for (const scope of TEXT_SCOPES) {
    await markGenerationComplete(db, { ownerId: owner, scope, generation: after, now: T1 });
  }

  await switchTargetGeneration(db, { ownerId: owner, task: "embed", from, to: after.id });

  expect(await readGeneration(db, owner, "embed")).toMatchObject({ status: "ready", generation: { id: after.id } });
  expect((await db.select().from(characterEmbeddings)).map((row) => row.generationId)).toEqual([after.id]);
});

// A store pins its generation before it embeds; when its upsert lands after the switch and the promotion, the
// row must not land, or the index holds two generations at rest.
test("a write pinned to a retired generation never lands, and a write to the target does", async () => {
  const { db, owner, card, before, after } = await seedTwoResolvers("late-write");
  await switchTargetGeneration(db, { ownerId: owner, task: "embed", from: { generationId: before.id, epoch: before.epoch }, to: after.id });
  for (const scope of TEXT_SCOPES) {
    await markGenerationComplete(db, { ownerId: owner, scope, generation: after, now: T1 });
  }
  const write = (generation: GenerationReceipt, dim: number): Promise<boolean> =>
    upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>(`character_embedding_late_${generation.id}`),
      characterId: card,
      embedding: new Float32Array(dim).fill(1),
      contentHash: "hash-late",
      model: generation.space,
      generationId: generation.id,
      dim,
      now: T1,
    });

  expect(await write(before, 768)).toBe(false);
  expect(await db.select().from(characterEmbeddings)).toEqual([]);
  expect(await write(after, 4)).toBe(true);
  expect(await db.select({ generationId: characterEmbeddings.generationId, dim: characterEmbeddings.dim }).from(characterEmbeddings)).toEqual([
    { generationId: after.id, dim: 4 },
  ]);
});

// A chat's vectors are funded by its owner whether or not a host is still present, so a switch retires them too.
test("a switch retires the owner's vectors in a chat with no present host", async () => {
  const { db, owner, before, after } = await seedTwoResolvers("hostless");
  const chat = await seedChat(db, "chat_hostless", owner);
  await db.update(chatParticipants).set({ leftSeq: 1 }).where(eq(chatParticipants.chatId, chat));
  await db.insert(chatSegments).values({
    id: castId<ChatSegmentId>("chat_segment_hostless"),
    chatId: chat,
    blockIdx: 0,
    chunkIdx: 0,
    seqStart: 0,
    seqEnd: 1,
    text: "old generation canon",
    embedding: new Float32Array([1, 0, 0, 0]),
    contentHash: "hash-hostless",
    model: before.space,
    generationId: before.id,
    dim: 4,
    createdAt: T0,
  });

  await switchTargetGeneration(db, { ownerId: owner, task: "embed", from: { generationId: before.id, epoch: before.epoch }, to: after.id });

  expect(await db.select().from(chatSegments)).toEqual([]);
});
