// verb: staleGenerationOwners — boot re-indexes exactly the owners whose stored target no longer matches the
// generation their binding resolves to now, or whose rebuild never promoted; an owner on a promoted, matching
// generation is left alone.

import { VECTOR_SCOPES_BY_TASK } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { markGenerationComplete } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeStoreHarness, seedUser } from "../_support.ts";

const NOW = 1_700_000_000_000;

async function promotedOwner(db: Db, svc: EmbeddingsService, id: string): Promise<UserId> {
  const owner = await seedUser(db, { id, handle: castId<Handle>(id) });
  const generation = await svc.resolveGeneration(owner, "embed");
  if (generation === null) {
    throw new Error("the store harness binds an embed connection for every owner");
  }
  for (const scope of VECTOR_SCOPES_BY_TASK.embed) {
    await markGenerationComplete(db, { ownerId: owner, scope, generation, now: NOW });
  }
  return owner;
}

test("lists the owner whose stored generation went stale, and not the owner whose generation still matches", async () => {
  const db = await freshDb();
  const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
  const stale = await promotedOwner(db, svc, "user_stale_generation");
  await promotedOwner(db, svc, "user_current_generation");
  expect(await svc.staleGenerationOwners()).toEqual([]);

  // The stale owner's stored target is an id the current code would no longer mint for their binding.
  const legacy = castId<EmbedGenerationId>("embed_generation_minted_by_an_older_release");
  await db.insert(embedGenerations).values({
    id: legacy,
    ownerId: stale,
    task: "embed",
    via: "embed",
    connectionId: null,
    connectionRef: castId<UserConnectionId>("user_connection_legacy"),
    fingerprint: "legacy",
    space: "legacy",
    createdAt: 0,
  });
  await db.update(embedGenerationTargets).set({ generationId: legacy }).where(eq(embedGenerationTargets.ownerId, stale));

  expect(await svc.staleGenerationOwners()).toEqual([stale]);
});

// A crash after the switch leaves the target current but never promoted, and search refuses until a sweep
// finishes it. Boot has no live sweep, so it re-fires that owner's rebuild.
test("lists the owner whose current target never promoted, so boot finishes the dead rebuild", async () => {
  const db = await freshDb();
  const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
  await promotedOwner(db, svc, "user_promoted_generation");
  const stuck = await seedUser(db, { id: "user_stuck_generation", handle: castId<Handle>("stuck") });
  await svc.resolveGeneration(stuck, "embed");

  expect(await svc.staleGenerationOwners()).toEqual([stuck]);
});
