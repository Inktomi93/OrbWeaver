// verbs/journal/delete-journal-entry — deleteJournalEntry (docs/plans/rpg/design.md). Host-gated, game-scoped.
// Asserted at the lineage-projected read (the entry is gone).

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { listActiveJournal } from "../../../../../../packages/server/src/domain/rpg/persistence/journal.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test, UNCLAMPED } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("deleteJournalEntry", () => {
  test("removes the entry", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const entryId = await h.service.addJournalEntry({
      principal: principal(castId<Handle>("host")),
      chatId,
      type: "note",
      title: "Session 1",
      content: "We began.",
    });

    await h.service.deleteJournalEntry({ principal: principal(castId<Handle>("host")), chatId, entryId });
    expect(await listActiveJournal(db, gameId, { limit: 50, historyFloorSeq: UNCLAMPED })).toHaveLength(0);
  });
});
