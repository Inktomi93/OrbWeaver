// A card with malformed fields still imports through the Characters dialog: each malformed field drops to its default
// and is named in the card's notes, and every other field, the embedded book included, lands. The character it lands
// as still exports, and a later card under the same carried handle still imports.
// @subject packages/server/src/primitives/serde/card/index.ts
// @subject packages/server/src/domain/import/substrate/card.ts

import type { CharacterCardV3 } from "@orb/contracts/character";
import { CHARACTER_HANDLE_WIRE_KEY, characterCardV3Schema } from "@orb/contracts/character";
import { exportCharacterPath } from "@orb/contracts/portability";
import type { CharacterId } from "@orb/kit/ids";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
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

const CARRIED_HANDLE = "lantern-keeper";

// An entry's source spelling is kept whole as its metadata, so these two fields reach the export as the card wrote them.
function entryCard(entry: Readonly<Record<string, unknown>>, description: string): string {
  return JSON.stringify({
    spec: "chara_card_v3",
    ["spec_version"]: "3.0",
    data: {
      name: "Lantern Keeper",
      description,
      ["first_mes"]: "The lamp is lit.",
      [CHARACTER_HANDLE_WIRE_KEY]: CARRIED_HANDLE,
      ["character_book"]: {
        name: BOOK_NAME,
        entries: [{ keys: ["lantern"], content: "The lantern burns blue.", enabled: true, ["insertion_order"]: 1, ...entry }],
      },
    },
  });
}

async function exportedCard(root: ServerTestHarness, characterId: CharacterId): Promise<{ readonly status: number; readonly card: CharacterCardV3 | null }> {
  const response = await root.http.request(`${exportCharacterPath(characterId)}?format=json`);
  return { status: response.status, card: response.status === 200 ? characterCardV3Schema.parse(JSON.parse(await response.text())) : null };
}

test("a character whose book entry spelled its name and budget flag wrong still exports, without those two values", async () => {
  await using root = await harness();
  const malformed = present((await importThroughDialog(root, "lantern.json", entryCard({ name: 7, ignoreBudget: "yes" }, "Keeps the light."))).imported[0]);
  const exported = await exportedCard(root, malformed.characterId);
  expect(exported.status).toBe(200);
  const [entry] = exported.card?.data.character_book?.entries ?? [];
  expect({ name: entry?.name, ignoreBudget: entry?.ignoreBudget, content: entry?.content }).toEqual({
    name: undefined,
    ignoreBudget: undefined,
    content: "The lantern burns blue.",
  });

  // The control: well-formed values of the same two fields leave in the export, so the absences above are the drop.
  const named = present(
    (await importThroughDialog(root, "lantern-named.json", entryCard({ name: "Lantern", ignoreBudget: true }, "Keeps the lamp."))).imported[0],
  );
  const [kept] = (await exportedCard(root, named.characterId)).card?.data.character_book?.entries ?? [];
  expect({ name: kept?.name, ignoreBudget: kept?.ignoreBudget }).toEqual({ name: "Lantern", ignoreBudget: true });
});

test("a card carrying the handle of a character whose book entry spelled its name wrong still imports beside it", async () => {
  await using root = await harness();
  const first = present((await importThroughDialog(root, "lantern.json", entryCard({ name: 7 }, "Keeps the light."))).imported[0]);
  // A different card under the same carried handle: the lookup exports the held character to compare, so it must export.
  const second = present((await importThroughDialog(root, "lantern-b.json", entryCard({}, "Trims the wick."))).imported[0]);
  expect({ created: second.created, distinct: second.characterId !== first.characterId }).toEqual({ created: true, distinct: true });
});
