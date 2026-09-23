// persistence/checkpoints — labeled snapshot bookmarks + the restore clone-forward (docs/plans/rpg/design.md).
// .int: real FK. Create/list + the restore statement builder (born COMMITTED) + the RESTRICT belt (a
// checkpoint pins its snapshot against delete). Marker/snapshot batch rollback is pinned at the verb mirror.

import type { Db } from "@orb/db";
import { rpgSnapshots } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { RpgCheckpointId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { findCheckpoint, insertCheckpoint, listCheckpoints } from "../../../../../packages/server/src/domain/rpg/persistence/checkpoints.ts";
import { buildRestoredSnapshotStatement, insertSnapshot } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, FROZEN_AT, seedChat, seedGame, seedMessage, snapshotId, test } from "../_support.ts";

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
    const restoredId = snapshotId("restored");
    await db.batch(batchMany([buildRestoredSnapshotStatement(db, checkpointed, { id: restoredId, gameId, now: FROZEN_AT }, notice.messageId)]));
    const [restored] = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, restoredId)).limit(1);
    if (restored === undefined) {
      throw new Error("restored snapshot was not committed");
    }
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

// ── THE LINEAGE INVARIANT (#1380) ─────────────────────────────────────────────────────────────────────
// A checkpoint's `game_id` and its snapshot's OWN `game_id` must be the same game — two FKs to two tables,
// which SQLite cannot pair. UNLIKE the derive-only snapshot/tool-call arms, this pair IS caller-supplied on
// the restore path, and it IS validated there (`verbs/game/restore-checkpoint.ts` compares
// `checkpoint.gameId !== game.id` before use). This pins that the SCHEMA does not hold the line, so nobody
// deletes that compare believing the db has their back.
describe("the cross-game lineage invariant", () => {
  test("a bookmark into ANOTHER game's snapshot is STORABLE — the restore verb's compare is the real belt", async () => {
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    const gameA = await seedGame(db, chatA, "ga");
    const gameB = await seedGame(db, chatB, "gb");
    const beatB = await seedMessage(db, chatB, 1, { role: "assistant" });
    const foreign = await insertSnapshot(db, {
      id: snapshotId("b1"),
      gameId: gameB,
      messageId: beatB.messageId,
      variantId: beatB.variantId,
      location: "room B camp",
      committed: 1,
      createdAt: FROZEN_AT,
    });

    // Both FKs resolve; nothing pairs them. The write goes through.
    await insertCheckpoint(db, {
      id: castId<RpgCheckpointId>("rpg_checkpoint_cross"),
      gameId: gameA,
      snapshotId: foreign.id,
      label: "a bookmark into someone else's game",
      trigger: "manual",
      createdAt: FROZEN_AT,
    });

    const stored = await listCheckpoints(db, gameA);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.snapshotId).toBe(foreign.id);
    // The incoherence, stated: the bookmark's game is not the snapshot's game.
    const snap = await findCheckpoint(db, castId<RpgCheckpointId>("rpg_checkpoint_cross"));
    expect(snap?.gameId).toBe(gameA);
    expect(foreign.gameId).toBe(gameB);
  });
});
