// Search reads immutable active generations, scoped by owner and logical task. A generation becomes ready
// only after every required scope promotes together; an incomplete first build is `moving`, and a principal
// with no target or completion rows is explicitly `unrecorded`.

import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { GenerationReceipt, GenerationTask } from "../../../../../packages/server/src/domain/embeddings/contract/generation.ts";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { readGeneration } from "../../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../../embeddings/_support.ts";

const NOW = 1_700_000_000_000;

async function seedTarget(db: Db, ownerId: UserId, input: { task: GenerationTask; id: string; space: string }): Promise<GenerationReceipt> {
  const { task, space } = input;
  const id = castId<EmbedGenerationId>(input.id);
  await db.insert(embedGenerations).values({
    id,
    ownerId,
    task,
    via: task,
    connectionId: null,
    connectionRef: castId<UserConnectionId>(`connection:${id}`),
    fingerprint: `fingerprint:${id}`,
    space,
    createdAt: NOW,
  });
  await db.insert(embedGenerationTargets).values({ ownerId, task, generationId: id, epoch: 1, updatedAt: NOW });
  return { id, task, via: task, epoch: 1, space };
}

async function complete(db: Db, ownerId: UserId, generation: GenerationReceipt): Promise<void> {
  for (const scope of VECTOR_SCOPES_BY_TASK[generation.task]) {
    await markGenerationComplete(db, { ownerId, scope, generation, now: NOW });
  }
}

test("returns this owner's ready generation and nobody else's", async () => {
  const db = await freshDb();
  const mine = await seedUser(db, { handle: castId<Handle>("reader-mine") });
  const theirs = await seedUser(db, { handle: castId<Handle>("reader-theirs") });
  const mineGeneration = await seedTarget(db, mine, { task: "embed", id: "generation-mine", space: "mine-model" });
  const theirGeneration = await seedTarget(db, theirs, { task: "embed", id: "generation-theirs", space: "their-model" });
  await complete(db, mine, mineGeneration);
  await complete(db, theirs, theirGeneration);

  expect(await readGeneration(db, mine, "embed")).toEqual({
    status: "ready",
    generation: expect.objectContaining({ id: mineGeneration.id, space: "mine-model" }),
  });
  expect(await readGeneration(db, theirs, "embed")).toEqual({
    status: "ready",
    generation: expect.objectContaining({ id: theirGeneration.id, space: "their-model" }),
  });
});

test("keeps embed and image generations independent", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("reader-tasks") });
  const text = await seedTarget(db, owner, { task: "embed", id: "generation-text", space: "text-space" });
  const image = await seedTarget(db, owner, { task: "imageEmbed", id: "generation-image", space: "image-space" });
  await complete(db, owner, text);
  await complete(db, owner, image);

  expect(await readGeneration(db, owner, "embed")).toEqual({ status: "ready", generation: expect.objectContaining({ id: text.id, space: "text-space" }) });
  expect(await readGeneration(db, owner, "imageEmbed")).toEqual({
    status: "ready",
    generation: expect.objectContaining({ id: image.id, space: "image-space" }),
  });
});

test("an incomplete first build is moving, while an untouched owner is unrecorded", async () => {
  const db = await freshDb();
  const moving = await seedUser(db, { handle: castId<Handle>("reader-moving") });
  const untouched = await seedUser(db, { handle: castId<Handle>("reader-virgin") });
  const generation = await seedTarget(db, moving, { task: "embed", id: "generation-moving", space: "moving-space" });
  await markGenerationComplete(db, { ownerId: moving, scope: "cards", generation, now: NOW });

  expect(await readGeneration(db, moving, "embed")).toEqual({ status: "moving" });
  expect(await readGeneration(db, untouched, "embed")).toEqual({ status: "unrecorded" });
});
