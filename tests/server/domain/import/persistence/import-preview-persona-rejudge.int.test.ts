// The client judges a folder's personas again under the owner's current answers by sending the persona files alone
// (`settings.json` and its avatars) as a dry run, so a changed answer costs no second upload of the folder. That
// request previews the same persona writes the whole folder's run makes under the same answers.
// @subject packages/server/src/domain/import/loader/profile-ownership.ts
// @subject packages/server/src/entry/http/import-tree.ts

import type { PersonaCollisionChoice } from "@orb/contracts/import";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, dryRun, finishRun, harness, presetOf, settings } from "./_st-tree-door.ts";

const NAME_KEY = "bob";
const HELD: Files = { [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob", "cat.png": "Cat" }) };
const NAMESAKE_SETTINGS = JSON.stringify({
  ["power_user"]: {
    personas: { "bob.png": "Bob", "cat.png": "Cat", "dot.png": "Dot" },
    ["persona_descriptions"]: { "bob.png": { description: "Another Bob." } },
  },
});

/** The whole folder as the client's first dry run and the run send it: the persona files beside other planes. */
function folder(root: ServerTestHarness): Files {
  return { [ST_SETTINGS_FILE]: NAMESAKE_SETTINGS, "characters/Aria.png": cardPng(root, "Aria"), "OpenAI Settings/Plain.json": presetOf("You are plain.") };
}

/** The persona files of that folder alone, the request that judges them again. */
const PERSONA_FILES: Files = { [ST_SETTINGS_FILE]: NAMESAKE_SETTINGS };

async function personaRows(root: ServerTestHarness): Promise<number> {
  const [row] = await root.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM personas`);
  return present(row).n;
}

// Held Cat is reused whatever Bob's answer is and Dot is new, so the answer decides only Bob's namesake.
const PERSONAS_WRITTEN: Readonly<Record<PersonaCollisionChoice, number>> = { merge: 1, "keep-both": 2 };

/** Previews the persona files under the answer, runs the whole folder under the same, and returns both counts. */
async function previewedAndWritten(choice: PersonaCollisionChoice): Promise<{ shown: number; written: number; found: number }> {
  await using root = await harness();
  await finishRun(root, await admit(root, HELD));
  const choices = { [NAME_KEY]: choice };

  const { kinds } = await dryRun(root, PERSONA_FILES, choices);
  const before = await personaRows(root);
  await finishRun(root, await admit(root, folder(root), [], choices));
  return { shown: kinds.personas.counts.writes, written: (await personaRows(root)) - before, found: kinds.personas.total };
}

test("the persona files alone preview the persona writes the whole folder's run makes when the owner chose merge", async () => {
  const { shown, written, found } = await previewedAndWritten("merge");

  expect(found).toBe(3);
  expect(written).toBe(PERSONAS_WRITTEN.merge);
  expect(shown).toBe(written);
});

test("the persona files alone preview the persona writes the whole folder's run makes when the owner chose keep both", async () => {
  const { shown, written, found } = await previewedAndWritten("keep-both");

  expect(found).toBe(3);
  expect(written).toBe(PERSONAS_WRITTEN["keep-both"]);
  expect(shown).toBe(written);
});

test("the whole folder's dry run sent without the owner's answers previews the default, which the persona files alone then correct", async () => {
  await using root = await harness();
  await finishRun(root, await admit(root, HELD));

  const unanswered = await dryRun(root, folder(root));
  const answered = await dryRun(root, PERSONA_FILES, { [NAME_KEY]: "keep-both" });

  expect(unanswered.kinds.personas.total).toBe(answered.kinds.personas.total);
  expect(unanswered.kinds.personas.counts.writes).toBe(1);
  expect(answered.kinds.personas.counts.writes).toBe(2);
});
