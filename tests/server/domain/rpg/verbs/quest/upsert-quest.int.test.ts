// verbs/quest/upsert-quest — upsertQuest (rpg-design/05 §4.4, §6.2). The hand arm of the SNAPSHOT-plane quest
// state: create/update ride the clone-forward + `quests.<id>` lock machinery. Asserted at the resolved snapshot.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { resolveSnapshotForTurn } from "../../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("upsertQuest", () => {
  test("create → the quest lands in the snapshot array (auto-locked); update flips its status", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    h.fakes.busEvents.length = 0; // drop the createGame emit — assert the quest-write emits alone

    const questId = await h.service.upsertQuest({
      principal: principal(castId<Handle>("host")),
      chatId,
      name: "Slay the dragon",
      objectives: [{ text: "Find the lair" }],
    });
    let snap = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(snap?.quests).toHaveLength(1);
    expect(snap?.quests?.[0]?.name).toBe("Slay the dragon");
    expect(snap?.quests?.[0]?.status).toBe("active");
    expect(snap?.quests?.[0]?.objectives[0]?.text).toBe("Find the lair");
    // The hand-created quest auto-locked its `quests.<id>` path (manual-edit-wins).
    expect(snap?.fieldLocks?.[`quests.${questId}`]).toBe(true);
    // §4.9: a snapshot-plane quest write emits BOTH `snapshotPatched` and `questChanged`.
    expect(h.fakes.busEvents).toEqual([
      { type: "snapshotPatched", chatId, snapshotId: snap?.id },
      { type: "questChanged", chatId },
    ]);

    await h.service.upsertQuest({ principal: principal(castId<Handle>("host")), chatId, questId, name: "Slay the dragon", status: "completed" });
    snap = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(snap?.quests?.[0]?.status).toBe("completed");
  });
});
