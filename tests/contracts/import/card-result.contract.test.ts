import { cardImportResultSchema } from "@orb/contracts/import";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const CARD = {
  filename: "card.png",
  characterId: mintTypeId(ID_PREFIX.character),
  created: true,
  importHash: "content-hash",
  notes: ["The existing primary book was kept."],
};

test("a batch round-trips successes, deduplicated cards and isolated failures without dropping provenance", () => {
  const result = {
    imported: [CARD, { ...CARD, filename: null, created: false, notes: [] }],
    failed: [{ filename: "broken.png", error: "The card could not be read." }],
  };
  const parsed = cardImportResultSchema.parse(result);
  expect(parsed).toEqual(result);
  expect(cardImportResultSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
});

test("an older card outcome may omit notes without inventing a different import result", () => {
  const { notes: _notes, ...card } = CARD;
  expect(cardImportResultSchema.parse({ imported: [card], failed: [] })).toEqual({ imported: [card], failed: [] });
});

test("the response refuses wrong entity identities and malformed per-card fields", () => {
  const invalidCards = [
    { ...CARD, characterId: mintTypeId(ID_PREFIX.chat) },
    { ...CARD, created: "true" },
    { ...CARD, filename: 2 },
    { ...CARD, importHash: undefined },
    { ...CARD, notes: [7] },
  ];
  for (const card of invalidCards) {
    expect(cardImportResultSchema.safeParse({ imported: [card], failed: [] }).success).toBe(false);
  }
  expect(cardImportResultSchema.safeParse({ imported: [], failed: [{ filename: null, error: false }] }).success).toBe(false);
  expect(cardImportResultSchema.safeParse({ imported: [], failed: null }).success).toBe(false);
});
