// persistence/clear — clearVectorTable (the whole-table wipe) asserts the typed DELETE FROM empties
// exactly the named table.
//
// The model-change purge (`purgeStaleVectors`) that used to be pinned here was DELETED with the
// generation cutover (#2496): promotion retires every non-active generation inside ONE transaction
// (`persistence/space-state.ts` `retiredVectorStatements`), and the end-to-end invariant — old vectors
// survive until every scope lands, then the swap completes on the new tag — is driven through real
// sweeps by `tests/server/domain/embeddings/embed-space-round-trip.suite.int.test.ts`.

import type { Db } from "@orb/db";
import { characterEmbeddings, embedGenerations } from "@orb/db";
import type { CharacterEmbeddingId, EmbedGenerationId, Handle, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { clearVectorTable } from "../../../../../packages/server/src/domain/embeddings/persistence/clear.ts";
import { upsertCharacterEmbedding } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, fakeVector, seedCharacter, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

async function seedGeneration(db: Db, ownerId: UserId, model: string, task: "embed" | "imageEmbed" = "embed"): Promise<EmbedGenerationId> {
  const id = castId<EmbedGenerationId>(`embed_generation_${ownerId}_${task}_${model}`);
  await db
    .insert(embedGenerations)
    .values({
      id,
      ownerId,
      task,
      via: task,
      connectionId: null,
      connectionRef: castId<UserConnectionId>(`fixture:${model}`),
      fingerprint: `fixture:${model}`,
      space: model,
      createdAt: NOW,
    })
    .onConflictDoNothing();
  return id;
}

describe("clearVectorTable", () => {
  test("empties the named table", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const generationId = await seedGeneration(db, owner, EMBED_MODEL);
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h",
      model: EMBED_MODEL,
      generationId,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await db.select().from(characterEmbeddings)).toHaveLength(1);

    await clearVectorTable(db, "character_embeddings");

    expect(await db.select().from(characterEmbeddings)).toHaveLength(0);
  });
});
