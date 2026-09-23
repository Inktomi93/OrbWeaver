// verbs/quest/delete-quest — deleteQuest (docs/plans/rpg/design.md). Removes a quest from the current resolved
// snapshot's array and CLEARS its `quests.<id>` lock (the symmetric grammar — no ghost lock). Not-found on a
// missing id. Asserted at the resolved snapshot.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { resolveSnapshotForTurn } from "../../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test } from "../../_support.ts";

const NOT_FOUND_RE = /quest/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("deleteQuest", () => {
  test("removes the quest AND clears its lock (no ghost lock accumulates)", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    const questId = await h.service.upsertQuest({ principal: principal(castId<Handle>("host")), chatId, name: "Slay the dragon" });
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.fieldLocks?.[`quests.${questId}`]).toBe(true);

    await h.service.deleteQuest({ principal: principal(castId<Handle>("host")), chatId, questId });
    const snap = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(snap?.quests).toHaveLength(0);
    // The delete CLEARED the per-quest lock — no ghost lock accumulates (the symmetric grammar).
    expect(snap?.fieldLocks?.[`quests.${questId}`]).toBeUndefined();
  });

  test("deleting a nonexistent quest is a not-found", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await expect(h.service.deleteQuest({ principal: principal(castId<Handle>("host")), chatId, questId: "q_ghost" as never })).rejects.toThrow(NOT_FOUND_RE);
  });
});
