// verb: staleGenerationOwners — boot re-indexes exactly the owners whose stored target no longer matches the
// generation their binding resolves to now; an owner whose stored id still matches is left alone.

import { embedGenerations, embedGenerationTargets } from "@orb/db";
import type { EmbedGenerationId, Handle, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeStoreHarness, seedUser } from "../_support.ts";

test("lists the owner whose stored generation went stale, and not the owner whose generation still matches", async () => {
  const db = await freshDb();
  const harness = makeStoreHarness(db);
  const svc = createEmbeddingsService(harness.ctx);
  const stale = await seedUser(db, { id: "user_stale_generation", handle: castId<Handle>("stale") });
  const current = await seedUser(db, { id: "user_current_generation", handle: castId<Handle>("current") });
  await svc.resolveGeneration(stale, "embed");
  await svc.resolveGeneration(current, "embed");
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
