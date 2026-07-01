// persistence/clear — clearVectorTable. Asserts the typed DELETE FROM empties exactly the named table.

import { characterEmbeddings } from "@orb/db";
import type { CharacterEmbeddingId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { clearVectorTable } from "../../../../../packages/server/src/domain/embeddings/persistence/clear.ts";
import { upsertCharacterEmbedding } from "../../../../../packages/server/src/domain/embeddings/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_DIM, EMBED_MODEL, fakeVector, seedCharacter, seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

describe("clearVectorTable", () => {
  test("empties the named table", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    await upsertCharacterEmbedding(db, {
      id: castId<CharacterEmbeddingId>("character_embedding_a"),
      characterId,
      embedding: fakeVector(EMBED_DIM, 1),
      contentHash: "h",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      now: NOW,
    });
    expect(await db.select().from(characterEmbeddings)).toHaveLength(1);

    await clearVectorTable(db, "character_embeddings");

    expect(await db.select().from(characterEmbeddings)).toHaveLength(0);
  });
});
