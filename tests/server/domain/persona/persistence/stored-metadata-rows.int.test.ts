// A stored persona's metadata reads back as stored: a key this release does not declare rides through as JSON however
// deep, an absent known field stays absent, and a known field out of shape heals the blob to null.
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
