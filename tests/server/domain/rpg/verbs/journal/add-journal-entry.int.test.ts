// verbs/journal/add-journal-entry — addJournalEntry (rpg-design/05 §4.4, §6.2). A hand entry stamps
// `variantId: NULL` (every-lineage room note). Asserted at the persisted row + the lineage-projected read.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { listActiveJournal } from "../../../../../../packages/server/src/domain/rpg/persistence/journal";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("addJournalEntry", () => {
  test("a hand entry lands with variantId NULL and renders on every lineage", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    h.fakes.busEvents.length = 0; // drop the createGame emit — assert the journal emit alone
    const journalId = await h.service.addJournalEntry({ principal: principal("host"), chatId, type: "note", title: "Session 1", content: "We began." });

    const rows = await listActiveJournal(db, gameId, { limit: 50 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Session 1");
    expect(rows[0]?.variantId).toBeNull(); // hand entry — every lineage
    // §4.9: addJournalEntry emits `journalChanged` with the new entry's id.
    expect(h.fakes.busEvents).toEqual([{ type: "journalChanged", chatId, journalId }]);
  });
});
