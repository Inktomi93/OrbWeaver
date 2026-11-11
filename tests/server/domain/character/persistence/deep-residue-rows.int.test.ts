// A card's leftover vendor fields are stored as the JSON its file held, however deep; the read seam guards only
// that the column holds an object, so a deep stored value never reaches a recursive check that would overflow.
// @subject packages/server/src/domain/character/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { characters } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

// Deeper than zod's recursive record check survives inside a read seam, well inside what JSON text round-trips.
const DEPTH = 2500;

function nested(depth: number): JsonValue {
  let value: JsonValue = "floor";
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return value;
}

test("a character whose stored extensions nest deep still opens, saves and copies", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Deep vendor", handle: "deep-vendor", description: "", greetings: [] }),
  });
  const stored = JSON.stringify({ vendor: nested(DEPTH) });
  await harness.db
    .update(characters)
    .set({ extensions: sql`${stored}` })
    .where(eq(characters.id, card.id));

  const read = await harness.services.character.get({ principal: owner, characterId: card.id });
  expect(JSON.stringify(read.extensions)).toBe(stored);

  const saved = await harness.services.character.update({ principal: owner, characterId: card.id, input: { name: "Deep vendor, renamed" } });
  expect(saved.name).toBe("Deep vendor, renamed");
  expect(JSON.stringify(saved.extensions)).toBe(stored);

  const copy = await harness.services.character.duplicate({ principal: owner, characterId: card.id });
  expect(copy.id).not.toBe(card.id);
  expect(JSON.stringify(copy.extensions)).toBe(stored);
});
