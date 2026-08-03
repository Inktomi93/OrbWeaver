// verbs/journal/edit-journal-entry — editJournalEntry (rpg-design/05 §4.4, §6.2). Host-gated, game-scoped.
// Asserted at the lineage-projected read.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { listActiveJournal } from "../../../../../../packages/server/src/domain/rpg/persistence/journal";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("editJournalEntry", () => {
  test("patches an entry's text at the row", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const entryId = await h.service.addJournalEntry({
      principal: principal(castId<Handle>("host")),
      chatId,
      type: "note",
      title: "Session 1",
      content: "We began.",
    });

    await h.service.editJournalEntry({ principal: principal(castId<Handle>("host")), chatId, entryId, patch: { content: "We truly began." } });
    const rows = await listActiveJournal(db, gameId, { limit: 50 });
    expect(rows[0]?.content).toBe("We truly began.");
  });
});
