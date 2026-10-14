// @subject packages/server/src/domain/discovery/persistence/card-reads.ts
// @subject packages/server/src/domain/discovery/verbs/count-distill-calls.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { characters } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq, sql } from "drizzle-orm";

test("the canonical whole-array heal excludes partially malformed greeting text from the distill estimate", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Greeting source", handle: "greeting-source", description: "", greetings: [{ text: "An authored greeting." }] }),
  });
  expect(await harness.services.discovery.countDistillCalls(owner.userId)).toBe(1);
  await harness.db
    .update(characters)
    .set({ greetings: sql`${JSON.stringify([{ text: "Untrusted partial greeting." }, { text: false }])}` })
    .where(eq(characters.id, card.id));
  expect(await harness.services.discovery.countDistillCalls(owner.userId)).toBe(0);
});

test("the actual owner's census never decodes another owner's damaged greeting", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const other = await harness.principalFor((await harness.actor()).id);
  await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Owned writing", handle: "owned-writing", description: "A real paragraph." }),
  });
  const foreign = await harness.services.character.create({
    principal: other,
    input: createCharacterSchema.parse({ name: "Foreign writing", handle: "foreign-writing", description: "Private paragraph." }),
  });
  await harness.db
    .update(characters)
    .set({ greetings: sql`${"{"}` })
    .where(eq(characters.id, foreign.id));
  expect(await harness.services.discovery.countDistillCalls(owner.userId)).toBe(1);
});

test("stored JSON null follows the canonical greeting heal without losing genuine prose", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Prose source", handle: "prose-source", description: "Authored prose." }),
  });
  await harness.db
    .update(characters)
    .set({ greetings: sql`${"null"}` })
    .where(eq(characters.id, card.id));
  expect(await harness.services.discovery.countDistillCalls(owner.userId)).toBe(1);
});
