import { CARD_REFUSAL_CODES, cardImportResultSchema } from "@orb/contracts/import";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { summarizeCardImport } from "#client/features/workloads/lib/portability-model.ts";
import { cardImportFailedDetail } from "#client/lib/card-import-copy.ts";

const [, INVALID] = CARD_REFUSAL_CODES;

test("card summaries retain success notes, omit empty or legacy notes, and keep failures separate", ({ ids }) => {
  const characterId = mintTypeId(ID_PREFIX.character, ids.next);
  const result = cardImportResultSchema.parse({
    imported: [
      { filename: "duplicate.png", characterId, created: false, importHash: "duplicate", notes: ["Book kept"] },
      { filename: "created.png", characterId, created: true, importHash: "created", notes: ["Regex kept"] },
      { filename: null, characterId, created: true, importHash: "legacy" },
      { filename: "empty.png", characterId, created: false, importHash: "empty", notes: [] },
    ],
    failed: [{ filename: "broken.png", reason: INVALID, error: "Invalid card" }],
  });
  const summary = summarizeCardImport(result);
  expect(summary).toEqual({
    imported: 2,
    skipped: 2,
    merged: 0,
    failed: 1,
    notes: [],
    memoryScope: null,
    outcomes: [
      { path: "created.png", ok: true, detail: "Character card", notes: ["Regex kept"] },
      { path: "Unnamed card", ok: true, detail: "Character card" },
      { path: "duplicate.png", ok: true, detail: "Already imported", notes: ["Book kept"] },
      { path: "empty.png", ok: true, detail: "Already imported" },
      { path: "broken.png", ok: false, detail: cardImportFailedDetail(INVALID) },
    ],
  });
  expect(summary.outcomes[0]?.notes).toBe(result.imported[1]?.notes);
  expect(summary.outcomes[2]?.notes).toBe(result.imported[0]?.notes);
});
