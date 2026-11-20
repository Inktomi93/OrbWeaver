// A stored persona's metadata reads back as stored: a key this release does not declare rides through as JSON however
// deep, an absent known field stays absent, and a known field out of shape heals the blob to null. Stored text that is
// not JSON reads as null too, and no edit that leaves the metadata alone rewrites it. The library export carries the
// persona without it and names it in the export report; the single persona export refuses naming it until the persona
// editor's save rewrites the metadata.
// @subject packages/contracts/src/persona/schemas.ts
// @subject packages/server/src/domain/persona/persistence/queries.ts
// @subject packages/server/src/domain/persona/verbs/export.ts
import { PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { personas } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { readLibraryExport, signedInBox } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

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

test("persona metadata holding text that is not JSON is carried without it and named by the library export, and refuses the single export until the editor saves it", async () => {
  const notJson = '{"descriptionPosition": "at_de';
  await using box = await signedInBox();
  const caller = await box.internalCallerFor(box.ownerId);
  const persona = await caller.persona.create({ input: { name: "Wren", description: "A cartographer." } });
  const before = await readLibraryExport(box, ["persona"]);
  // Positive control: the readable persona exports through both doors and nothing is reported.
  expect(before.report).toBeNull();
  await caller.persona.export({ personaId: persona.id });

  await box.db
    .update(personas)
    .set({ metadata: sql`${notJson}` })
    .where(eq(personas.id, persona.id));
  const after = await readLibraryExport(box, ["persona"]);
  expect([...after.files.keys()]).toEqual([...before.files.keys()]);
  expect(after.report).toEqual({
    notes: [
      {
        kind: "persona",
        item: "Wren",
        code: STORED_CONFIG_UNREADABLE,
        failure: VERSIONED_PARSE_FAILURES.notJson,
        carried: PORTABLE_EXPORT_CARRY.withoutMetadata,
      },
    ],
  });
  await expect(caller.persona.export({ personaId: persona.id })).rejects.toMatchObject({
    cause: { code: STORED_CONFIG_UNREADABLE, message: expect.stringContaining('"Wren"') },
  });

  // The persona editor's save sends a whole metadata blob, which repairs the persona, and both doors deliver again.
  await caller.persona.update({ personaId: persona.id, input: { metadata: { swapMacros: true } } });
  await caller.persona.export({ personaId: persona.id });
  expect((await readLibraryExport(box, ["persona"])).report).toBeNull();
});
