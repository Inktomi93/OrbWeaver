// verb: writeHubScores — the discovery → embeddings hub-score write seam (the ONLY hub_score writer;
// §invariant 3). Asserts: scores land keyed `(id, model)`; `rowsUpdated` counts touched rows; a write to a
// non-matching model leaves the row alone (space-scoped); an empty batch is a 0-row noop.

import { characterEmbeddings } from "@orb/db";
import type { CharacterEmbeddingId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_DIM, EMBED_MODEL, makeStoreHarness, seedCharacter, seedUser } from "../_support.ts";

const CARD_TEXT = "a card to score";

async function seedOneEmbedding(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  svc: ReturnType<typeof createEmbeddingsService>;
  id: CharacterEmbeddingId;
}> {
  const h = makeStoreHarness(db);
  const svc = createEmbeddingsService(h.ctx);
  const owner = await seedUser(db, { handle: "owner" });
  const characterId = await seedCharacter(db, owner);
  await svc.store({
    kind: "card",
    lens: "card-text",
    characterId,
    content: CARD_TEXT,
    model: EMBED_MODEL,
    dim: EMBED_DIM,
  });
  const row = (
    await db
      .select()
      .from(characterEmbeddings)
      .where(eq(characterEmbeddings.characterId, characterId))
  )[0];
  if (row === undefined) {
    throw new Error("seedOneEmbedding: row missing after store");
  }
  return { svc, id: row.id };
}

describe("writeHubScores", () => {
  test("writes hub_score keyed (id, model) and reports rowsUpdated", async () => {
    const db = await freshDb();
    const { svc, id } = await seedOneEmbedding(db);

    const result = await svc.writeHubScores({
      table: "character_embeddings",
      updates: [{ id, model: EMBED_MODEL, hubScore: 0.42 }],
    });

    expect(result.rowsUpdated).toBe(1);
    const row = (
      await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.id, id))
    )[0];
    expect(row?.hubScore).toBeCloseTo(0.42);
  });

  test("a wrong-model update touches no row (the score is space-scoped)", async () => {
    const db = await freshDb();
    const { svc, id } = await seedOneEmbedding(db);

    const result = await svc.writeHubScores({
      table: "character_embeddings",
      updates: [{ id, model: "some-other-space", hubScore: 0.99 }],
    });

    expect(result.rowsUpdated).toBe(0);
    const row = (
      await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.id, id))
    )[0];
    expect(row?.hubScore).toBeNull();
  });

  test("an empty batch is a zero-row noop", async () => {
    const db = await freshDb();
    const { svc } = await seedOneEmbedding(db);
    const result = await svc.writeHubScores({ table: "character_embeddings", updates: [] });
    expect(result.rowsUpdated).toBe(0);
  });
});
