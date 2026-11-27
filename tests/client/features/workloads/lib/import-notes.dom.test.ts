import { CARD_REFUSAL_CODES, cardImportResultSchema } from "@orb/contracts/import";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { summarizeCardImport } from "#client/features/workloads/lib/portability-model.ts";
import { cardBooksNotLinkedNote, cardImportFailedDetail } from "#client/lib/card-import-copy.ts";
import { IN_LIBRARY_DETAIL } from "#client/lib/in-library-copy.ts";

const [, INVALID] = CARD_REFUSAL_CODES;

test("card summaries retain success notes, omit empty or legacy notes, and keep failures separate", ({ ids }) => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const result = cardImportResultSchema.parse({
    imported: [
      { filename: "duplicate.png", characterId, created: false, name: "Aria", importHash: "duplicate", attachedBooksSkipped: 0, notes: ["Book kept"] },
      { filename: "created.png", characterId, created: true, name: "Aria", importHash: "created", attachedBooksSkipped: 0, notes: ["Regex kept"] },
      { filename: null, characterId, created: true, name: "Aria", importHash: "legacy", attachedBooksSkipped: 0 },
      { filename: "empty.png", characterId, created: false, name: "Aria", importHash: "empty", attachedBooksSkipped: 0, notes: [] },
    ],
    failed: [{ filename: "broken.png", reason: INVALID, error: "Invalid card" }],
  });
  const summary = summarizeCardImport(result);
  expect(summary).toEqual({
    imported: 2,
    inLibrary: 2,
    skipped: 0,
    merged: 0,
    failed: 1,
    notes: [],
    memoryScope: null,
    outcomes: [
      { path: "created.png", ok: true, detail: "Character card", notes: ["Regex kept"] },
      { path: "Unnamed card", ok: true, detail: "Character card" },
      { path: "duplicate.png", ok: true, held: true, detail: IN_LIBRARY_DETAIL, notes: ["Book kept"] },
      { path: "empty.png", ok: true, held: true, detail: IN_LIBRARY_DETAIL },
      { path: "broken.png", ok: false, detail: cardImportFailedDetail(INVALID) },
    ],
  });
  expect(summary.outcomes[0]?.notes).toBe(result.imported[1]?.notes);
  expect(summary.outcomes[2]?.notes).toBe(result.imported[0]?.notes);
});

test("a card whose book references linked nothing says how many on its own outcome, and a card with none says nothing", ({ ids }) => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const result = cardImportResultSchema.parse({
    imported: [
      { filename: "far.png", characterId, created: true, name: "Aria", importHash: "far", attachedBooksSkipped: 2 },
      { filename: "whole.png", characterId, created: true, name: "Aria", importHash: "whole", attachedBooksSkipped: 0 },
    ],
    failed: [],
  });
  const { outcomes } = summarizeCardImport(result);
  expect(outcomes.find(({ path }) => path === "far.png")?.notes).toEqual([cardBooksNotLinkedNote(2)]);
  expect(outcomes.find(({ path }) => path === "whole.png")?.notes).toBeUndefined();
});
