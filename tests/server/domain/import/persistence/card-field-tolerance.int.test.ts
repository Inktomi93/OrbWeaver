// A card with malformed fields still imports through the Characters dialog: each malformed field drops to its default
// and is named in the card's notes, and every other field, the embedded book included, lands.
// @subject packages/server/src/primitives/serde/card/index.ts
// @subject packages/server/src/domain/import/substrate/card.ts

import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { harness, importThroughDialog } from "./_st-tree-door.ts";

const BOOK_NAME = "Harbor Lore";

// SillyTavern wire text is snake_case by spec, so the card is raw JSON. `personality`, one alternate greeting and the
// entry's `insertion_order` are malformed; everything else is well formed.
function cardFile(malformed: boolean): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: {
      name: "Lantern Keeper",
      description: "Keeps the harbor light.",
      personality: malformed ? 7 : "steady",
      ["first_mes"]: "The lamp is lit.",
      ["alternate_greetings"]: malformed ? ["Mind the tide.", 7] : ["Mind the tide."],
      ["character_book"]: {
        name: BOOK_NAME,
        entries: [{ keys: ["lantern"], content: "The lantern burns blue.", enabled: true, ["insertion_order"]: malformed ? { order: 3 } : 3 }],
      },
    },
  });
}

const MALFORMED_FIELDS = ["data.personality", "data.alternate_greetings", "data.character_book.entries[0].insertion_order"];

test("a card's malformed fields drop to their defaults and are named, and the rest of the card lands", async () => {
  await using root = await harness();
  const caller = await root.internalCallerFor(root.ownerId);

  const result = await importThroughDialog(root, "lantern.json", cardFile(true));
  const imported = present(result.imported[0]);
  const character = await caller.character.get({ characterId: imported.characterId });
  expect({ description: character.description, personality: character.personality, greetings: character.greetings.map(({ text }) => text) }).toEqual({
    description: "Keeps the harbor light.",
    personality: null,
    greetings: ["The lamp is lit.", "Mind the tide."],
  });
  const [book] = await caller.worldInfo.listForCharacter({ characterId: imported.characterId });
  expect(book?.name).toBe(BOOK_NAME);
  const entries = await caller.worldInfo.listEntries({ bookId: present(book).id });
  expect(entries.map(({ content, priority }) => ({ content, priority }))).toEqual([{ content: "The lantern burns blue.", priority: 0 }]);
  const notes = imported.notes ?? [];
  expect(MALFORMED_FIELDS.filter((field) => !notes.some((note) => note.includes(`\`${field}\``)))).toEqual([]);

  // The control: the same card well formed carries no note, so the names above are verdicts on the malformed fields.
  const clean = await importThroughDialog(root, "lantern-clean.json", cardFile(false));
  expect(present(clean.imported[0]).notes ?? []).toEqual([]);
});
