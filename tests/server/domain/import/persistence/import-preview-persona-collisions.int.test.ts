// A persona whose name the owner holds but whose content differs is a collision, and the preview says what the run
// does with it under the owner's choice: merge writes nothing, keep both writes the copy. The choice rides the dry
// run the way it rides the run, and an unrecorded collision merges (D312).
// @subject packages/server/src/domain/persona/persistence/import-write.ts
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/entry/http/import-tree.ts

import type { PersonaCollisionChoice, PersonaCollisionChoices } from "@orb/contracts/import";
import { DEFAULT_PERSONA_COLLISION_CHOICE, ST_SETTINGS_FILE } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, dryRun, finishRun, harness, settings } from "./_st-tree-door.ts";

// The folded name a choice is recorded under.
const NAME_KEY = "bob";

const HELD: Files = { [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }) };
// The held persona's name with a description of its own, so its content differs.
const NAMESAKE: Files = {
  [ST_SETTINGS_FILE]: JSON.stringify({
    ["power_user"]: { personas: { "bob.png": "Bob" }, ["persona_descriptions"]: { "bob.png": { description: "Another Bob." } } },
  }),
};

const PERSONAS_WRITTEN: Readonly<Record<PersonaCollisionChoice, number>> = { merge: 0, "keep-both": 1 };

async function personaRows(root: ServerTestHarness): Promise<number> {
  const [row] = await root.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM personas`);
  return present(row).n;
}

/** Previews the folder under the choices, runs it under the same, and returns both counts of new personas. */
async function previewedAndWritten(root: ServerTestHarness, files: Files, choices: PersonaCollisionChoices): Promise<{ shown: number; written: number }> {
  const preview = await dryRun(root, files, choices);
  const shown = preview.kinds.personas.items.filter((item) => item.inLibrary !== true && item.repeat !== true).length;
  const before = await personaRows(root);
  await finishRun(root, await admit(root, files, [], choices));
  return { shown, written: (await personaRows(root)) - before };
}

/** The owner holds Bob; the folder brings another Bob and the owner answers the collision with `choice`. */
async function namesakeUnder(choice: PersonaCollisionChoice): Promise<{ shown: number; written: number }> {
  await using root = await harness();
  await finishRun(root, await admit(root, HELD));
  return await previewedAndWritten(root, NAMESAKE, { [NAME_KEY]: choice });
}

test("a persona that takes a held persona's name with other content previews no write when the owner chooses merge", async () => {
  const { shown, written } = await namesakeUnder("merge");

  expect(written).toBe(PERSONAS_WRITTEN.merge);
  expect(shown).toBe(written);
});

test("a persona that takes a held persona's name with other content previews its copy when the owner chooses keep both", async () => {
  const { shown, written } = await namesakeUnder("keep-both");

  expect(written).toBe(PERSONAS_WRITTEN["keep-both"]);
  expect(shown).toBe(written);
});

test("a collision the owner has not answered previews as the default choice, which the run honors", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, HELD));

  const { shown, written } = await previewedAndWritten(root, NAMESAKE, {});

  expect(written).toBe(PERSONAS_WRITTEN[DEFAULT_PERSONA_COLLISION_CHOICE]);
  expect(shown).toBe(written);
});

test("a persona with the held persona's name and content is still reused whatever the owner chose", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, HELD));

  const { shown, written } = await previewedAndWritten(root, HELD, { [NAME_KEY]: "keep-both" });

  expect(written).toBe(0);
  expect(shown).toBe(0);
});
