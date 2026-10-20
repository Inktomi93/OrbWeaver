// verbs/journal/edit-journal-entry — editJournalEntry (docs/plans/rpg/design.md). Host-gated, game-scoped.
// Asserted at the lineage-projected read.
// @subject packages/server/src/domain/rpg/verbs/journal/edit-journal-entry.ts

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { beforeEach, describe } from "vitest";
import { listActiveJournal } from "#server/domain/rpg/persistence/journal.ts";
import { expect, principal, seedLiteGame, test, UNCLAMPED } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("editJournalEntry", () => {
  test("patches an entry's text at the row", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const entryId = await h.service.addJournalEntry({
      principal: await principal(db, castId<Handle>("host")),
      chatId,
      type: "note",
      title: "Session 1",
      content: "We began.",
    });

    await h.service.editJournalEntry({ principal: await principal(db, castId<Handle>("host")), chatId, entryId, patch: { content: "We truly began." } });
    const rows = await listActiveJournal(db, gameId, { limit: 50, historyFloorSeq: UNCLAMPED });
    expect(rows[0]?.content).toBe("We truly began.");
  });
});
