// verbs/checkpoint/restore-checkpoint — restoreCheckpoint (rpg-design/05 §4.4, §6.2). Clones the checkpointed
// snapshot FORWARD, born committed, onto a fresh narrator slot. Asserted at the restored snapshot.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { resolveSnapshotForTurn } from "../../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("restoreCheckpoint", () => {
  test("clones the checkpointed snapshot forward onto a NEW narrator slot, born committed", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    await h.service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Ruins" } });
    const checkpointId = await h.service.createCheckpoint({ principal: principal("host"), chatId, label: "before the fight" });

    // Move on: change the location.
    await h.service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Aftermath" } });
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("The Aftermath");

    // Restore: the checkpointed "The Ruins" clones forward onto a NEW narrator slot, born committed.
    const postsBefore = h.fakes.narratorPosts.length;
    await h.service.restoreCheckpoint({ principal: principal("host"), chatId, checkpointId });
    expect(h.fakes.narratorPosts.length).toBe(postsBefore + 1); // a fresh narrator slot was minted
    const restored = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(restored?.location).toBe("The Ruins");
    expect(restored?.committed).toBe(1);
  });
});
