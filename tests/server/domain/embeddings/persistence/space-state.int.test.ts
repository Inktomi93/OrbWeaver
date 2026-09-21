// Candidate completion receipts remain owner- and scope-scoped until every scope for a generation agrees.
// A newer target may overwrite a stale candidate receipt for the same scope, but cannot collide with another
// scope or owner. Promotion is exercised elsewhere; these pins keep the persistence belt itself honest.

import type { Db } from "@orb/db";
import { embedGenerations, embedGenerationTargets, embedSpaceState } from "@orb/db";
import type { EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { GenerationReceipt, GenerationTask } from "../../../../../packages/server/src/domain/embeddings/contract/generation.ts";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { readGeneration } from "../../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

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
