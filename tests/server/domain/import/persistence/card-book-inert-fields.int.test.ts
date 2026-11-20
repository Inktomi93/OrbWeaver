// A card's embedded world book keeps SillyTavern's activation settings in the card spelling: secondary keys on the
// entry, the probability under its `extensions`. A profile import lands that book with its character, and both the
// entry editor's read and the import report list those settings as kept but not active yet.
// @subject packages/kit/src/world-info/index.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// @subject packages/server/src/domain/import/substrate/report.ts

import { readFile } from "node:fs/promises";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { inertActivationFields } from "@orb/kit/world-info";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { admit, finishRun, harness, settings } from "./_st-tree-door.ts";

const CARD_NAME = "Lantern Keeper";
const BOOK_NAME = "Harbor Lore";

// The entry as SillyTavern's card export writes it (`convertWorldInfoToCharacterBook`): the card's own names at the
// entry, and every activation knob under `extensions` in snake case. Wire text is snake_case by spec.
const CARD_ENTRY = {
  id: 0,
  keys: ["lantern"],
  ["secondary_keys"]: ["harbor"],
  comment: "Lantern",
  content: "The lantern burns blue.",
  constant: false,
  selective: true,
  ["insertion_order"]: 100,
  enabled: true,
  position: "before_char",
  ["use_regex"]: true,
  extensions: {
    position: 0,
    ["exclude_recursion"]: false,
    ["display_index"]: 0,
    probability: 40,
    useProbability: true,
    depth: 4,
    selectiveLogic: 0,
    ["outlet_name"]: "",
    group: "",
    ["group_override"]: false,
    ["group_weight"]: 100,
    ["prevent_recursion"]: false,
    ["delay_until_recursion"]: false,
    ["scan_depth"]: null,
    ["match_whole_words"]: null,
    ["use_group_scoring"]: false,
    ["case_sensitive"]: null,
    ["automation_id"]: "",
    role: 0,
    vectorized: false,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    ["match_persona_description"]: false,
    ["match_character_description"]: false,
    ["match_character_personality"]: false,
    ["match_character_depth_prompt"]: false,
    ["match_scenario"]: false,
    ["match_creator_notes"]: false,
    triggers: [],
    ["ignore_budget"]: false,
  },
};

function bookCardPng(root: ServerTestHarness): Uint8Array {
  const card = {
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: {
      name: CARD_NAME,
      description: "Keeps the harbor light.",
      ["first_mes"]: "The lamp is lit.",
      ["character_book"]: { name: BOOK_NAME, entries: [CARD_ENTRY] },
    },
  };
  return writeCardChunk(new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))), JSON.stringify(card));
}

/** The fields the entry editor lists as kept, read through the same verbs the editor reads the entry by. */
async function keptInEditor(root: ServerTestHarness): Promise<readonly string[]> {
  const caller = await root.internalCallerFor(root.ownerId);
  const characters = (await caller.character.list({})).items.filter((item) => item.name === CARD_NAME);
  const [character] = characters;
  if (character === undefined || characters.length !== 1) {
    throw new Error(`expected one character named ${CARD_NAME}, found ${String(characters.length)}`);
  }
  const books = (await caller.worldInfo.listForCharacter({ characterId: character.id })).filter((candidate) => candidate.name === BOOK_NAME);
  const [book] = books;
  if (book === undefined || books.length !== 1) {
    throw new Error(`expected the card's book ${BOOK_NAME} on its character`);
  }
  const entries = await caller.worldInfo.listEntries({ bookId: book.id });
  return entries.flatMap((entry) => inertActivationFields(entry.metadata).map(({ field }) => field));
}

test("a card book's secondary keys and partial probability are listed as kept in the editor read and the import report", async () => {
  await using root = await harness();

  const result = await finishRun(root, await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`characters/${CARD_NAME}.png`]: bookCardPng(root) }));

  expect(await keptInEditor(root)).toEqual(["keysecondary", "probability"]);
  if (result.reportPath === undefined) {
    throw new Error("the real run did not expose its written report");
  }
  const report = await readFile(result.reportPath, "utf8");
  expect(report).toContain(
    `\`${BOOK_NAME}\` (from \`${CARD_NAME}.png\`) — 1 entry; kept but not active yet: \`keysecondary\` (1 entry), \`probability\` (1 entry)`,
  );
});
