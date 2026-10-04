// The role row's rebuild line reads this: search is paused while either vector target is mid-move, and only then.

import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { GenerationReceipt, GenerationTask } from "../../../../../packages/server/src/domain/embeddings/contract/generation.ts";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { createSpaceStatus } from "../../../../../packages/server/src/domain/search/verbs/space-status.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../../embeddings/_support.ts";

const NOW = 1_700_000_000_000;

async function seedTarget(db: Db, ownerId: UserId, task: GenerationTask): Promise<GenerationReceipt> {
  const id = castId<EmbedGenerationId>(`generation-${ownerId}-${task}`);
  await db.insert(embedGenerations).values({
    id,
    ownerId,
    task,
    via: task,
    connectionId: null,
    connectionRef: castId<UserConnectionId>(`connection:${id}`),
    fingerprint: `fingerprint:${id}`,
    space: `${task}-model`,
    createdAt: NOW,
  });
  await db.insert(embedGenerationTargets).values({ ownerId, task, generationId: id, epoch: 1 });
  return { id, task, via: task, epoch: 1, space: `${task}-model` };
}

async function complete(db: Db, ownerId: UserId, generation: GenerationReceipt, scopes = VECTOR_SCOPES_BY_TASK[generation.task]): Promise<void> {
  for (const scope of scopes) {
    await markGenerationComplete(db, { ownerId, scope, generation, now: NOW });
  }
}

test("search is paused while either target is mid-move, and not once both promote or before any exists", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("space-status") });
  const status = createSpaceStatus({ db });
  expect(await status({ ownerId: owner }), "no target yet").toEqual({ paused: false });

  const text = await seedTarget(db, owner, "embed");
  const image = await seedTarget(db, owner, "imageEmbed");
  await complete(db, owner, text, ["cards", "documents"]);
  await complete(db, owner, image);
  expect(await status({ ownerId: owner }), "the text space still waits on memory").toEqual({ paused: true });

  await complete(db, owner, text);
  expect(await status({ ownerId: owner })).toEqual({ paused: false });
});
