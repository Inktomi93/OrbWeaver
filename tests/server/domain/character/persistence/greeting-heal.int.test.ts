// @subject packages/server/src/domain/character/persistence/queries.ts
// @subject packages/server/src/domain/character/verbs/get.ts
import type { Greeting } from "@orb/contracts/character";
import { createCharacterSchema } from "@orb/contracts/character";
import { characters } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const FIRST = { text: "The first greeting." };
const SECOND = { text: "A group-only greeting.", groupOnly: true };

// The card is created through `character.create` and read back through `character.get`, the production read that
// projects the stored `greetings` column through the persistence seam.
async function cardWithStoredGreetings(harness: ServerTestHarness, stored: string): Promise<() => Promise<readonly Greeting[]>> {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Greeting heal", handle: "greeting-heal", description: "", greetings: [FIRST, SECOND] }),
  });
  const read = async (): Promise<readonly Greeting[]> => (await harness.services.character.get({ principal: owner, characterId: card.id })).greetings;
  expect(await read(), "the created card reads back whole").toEqual([FIRST, SECOND]);
  await harness.db
    .update(characters)
    .set({ greetings: sql`${stored}` })
    .where(eq(characters.id, card.id));
  return read;
}

test("one malformed stored greeting costs only itself", async ({ harness }) => {
  const read = await cardWithStoredGreetings(harness, JSON.stringify([FIRST, { text: false }, SECOND]));
  expect(await read()).toEqual([FIRST, SECOND]);
});

test("a stored greetings value that is not a list reads as no greetings", async ({ harness }) => {
  const read = await cardWithStoredGreetings(harness, JSON.stringify({ text: "Not a list." }));
  expect(await read()).toEqual([]);
});
