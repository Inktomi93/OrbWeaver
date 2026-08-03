// persistence/checkpoints — labeled snapshot bookmarks + the restore clone-forward (rpg-design/05 §4.4).
// .int: real FK. Create/list + the restore path (findCheckpoint → writeRestoredSnapshot, born COMMITTED) +
// the RESTRICT belt (a checkpoint pins its snapshot against delete).

import type { Db } from "@orb/db";
import { rpgSnapshots } from "@orb/db";
import type { RpgCheckpointId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { findCheckpoint, insertCheckpoint, listCheckpoints } from "../../../../../packages/server/src/domain/rpg/persistence/checkpoints.ts";
import { insertSnapshot, writeRestoredSnapshot } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, FROZEN_AT, handTarget, seedChat, seedGame, seedMessage, snapshotId, test } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("create + list", () => {
  test("insertCheckpoint writes a bookmark; listCheckpoints returns it", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const snap = await insertSnapshot(db, {
      id: snapshotId("s1"),
      gameId,
      messageId: `message_${chatId}_1` as never,
      variantId,
      location: "camp",
      committed: 1,
      createdAt: FROZEN_AT,
    });
    const cpId = castId<RpgCheckpointId>("rpg_checkpoint_1");
    await insertCheckpoint(db, { id: cpId, gameId, snapshotId: snap.id, label: "before the boss", trigger: "manual", createdAt: FROZEN_AT });

    const list = await listCheckpoints(db, gameId);
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe("before the boss");
    expect((await findCheckpoint(db, cpId))?.snapshotId).toBe(snap.id);
  });
});

describe("restore", () => {
  test("restore clones the checkpointed snapshot forward, born COMMITTED", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    const base = await insertSnapshot(db, {
      id: snapshotId("s1"),
      gameId,
      messageId: `message_${chatId}_1` as never,
      variantId: first.variantId,
      location: "camp",
      committed: 1,
      createdAt: FROZEN_AT,
    });
    const cpId = castId<RpgCheckpointId>("rpg_checkpoint_1");
    const cp = await insertCheckpoint(db, { id: cpId, gameId, snapshotId: base.id, label: "camp", trigger: "manual", createdAt: FROZEN_AT });

    // Restore as a HAND ROW (D124 fork 4): read the checkpoint's snapshot, clone it forward committed. No
    // message is keyed to it — the visible "— scene restored —" notice is pure prose the verb posts separately.
    const found = await findCheckpoint(db, cp.id);
    const snapRows = await db
      .select()
      .from(rpgSnapshots)
      .where(eq(rpgSnapshots.id, found?.snapshotId ?? base.id))
      .limit(1);
    const checkpointed = snapRows[0];
    if (!checkpointed) {
      throw new Error("checkpointed snapshot vanished");
    }
    const notice = await seedMessage(db, chatId, 2, { role: "assistant", content: "— scene restored —" });
    const restored = await writeRestoredSnapshot(db, checkpointed, handTarget({ gameId, chatId, key: "restored" }));
    expect(restored.location).toBe("camp");
    expect(restored.committed).toBe(1); // the restored scene is truth immediately
    // The hand arm: no variant to swipe, no slot to delete — ordered by the notice it followed.
    expect(restored.variantId).toBeNull();
    expect(restored.messageId).toBeNull();
    expect(restored.asOfMessageId).toBe(notice.messageId);
  });
});

describe("the RESTRICT belt", () => {
  test("deleting a snapshot a checkpoint pins is a constraint error, not a silent dangle", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const snap = await insertSnapshot(db, {
      id: snapshotId("s1"),
      gameId,
      messageId: `message_${chatId}_1` as never,
      variantId,
      location: "camp",
      committed: 1,
      createdAt: FROZEN_AT,
    });
    await insertCheckpoint(db, {
      id: castId<RpgCheckpointId>("rpg_checkpoint_1"),
      gameId,
      snapshotId: snap.id,
      label: "camp",
      trigger: "manual",
      createdAt: FROZEN_AT,
    });

    await expect(db.delete(rpgSnapshots).where(eq(rpgSnapshots.id, snap.id))).rejects.toThrow();
  });
});
