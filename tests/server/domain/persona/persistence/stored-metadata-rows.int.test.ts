// A stored persona's metadata reads back as stored: a key this release does not declare rides through as JSON however
// deep, an absent known field stays absent, and a known field out of shape heals the blob to null. Stored text that is
// not JSON reads as null too, and no edit that leaves the metadata alone rewrites it.
// @subject packages/contracts/src/persona/schemas.ts
// @subject packages/server/src/domain/persona/persistence/queries.ts
import { personas } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

// Deeper than a recursive member check survives inside the read seam.
const DEPTH = 2500;
const DEEP = `${"[".repeat(DEPTH)}1${"]".repeat(DEPTH)}`;

test("a stored persona's metadata reads back as stored, undeclared keys and absent fields included", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const persona = await caller.persona.create({ input: { name: "Wren", description: "A cartographer." } });
  const read = async (stored: string): Promise<string> => {
    await harness.db
      .update(personas)
      .set({ metadata: sql`${stored}` })
      .where(eq(personas.id, persona.id));
    return JSON.stringify((await caller.persona.get({ personaId: persona.id })).metadata);
  };

  const undeclared = `{"descriptionPosition":"at_depth","inject":{"depth":2},"vendor":{"note":"kept","deep":${DEEP}}}`;
  expect(await read(undeclared)).toBe(undeclared);
  const knownAbsent = '{"swapMacros":true}';
  expect(await read(knownAbsent)).toBe(knownAbsent);
  expect(await read('{"descriptionPosition":"sideways","vendor":1}')).toBe("null");
});

test("persona metadata holding text that is not JSON reads as none, and a rename and a duplicate keep its bytes", async ({ harness }) => {
  const notJson = '{"descriptionPosition": "at_de';
  const caller = await harness.internalCallerFor(harness.ownerId);
  const persona = await caller.persona.create({ input: { name: "Wren", description: "A cartographer." } });
  await harness.db
    .update(personas)
    .set({ metadata: sql`${notJson}` })
    .where(eq(personas.id, persona.id));
  const stored = async (id: typeof persona.id): Promise<unknown> =>
    await harness.db
      .select({ text: sql<string>`${personas.metadata}` })
      .from(personas)
      .where(eq(personas.id, id));

  expect((await caller.persona.get({ personaId: persona.id })).metadata).toBeNull();
  expect((await caller.persona.list()).find((row) => row.id === persona.id)?.metadata).toBeNull();
  await caller.persona.update({ personaId: persona.id, input: { name: "Wren Vale" } });
  const copy = await caller.persona.duplicate({ personaId: persona.id });
  expect([await stored(persona.id), await stored(copy.id)]).toEqual([[{ text: notJson }], [{ text: notJson }]]);
});
