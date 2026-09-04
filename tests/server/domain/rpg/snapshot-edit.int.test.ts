// rpg/snapshot-edit (.int — real libSQL, because the fold's whole subject is what the DB holds WHEN the
// critical section runs). The unit half (the per-game ownership chain itself) lives in `snapshot-edit.test.ts`.
//
// #1458: `foldTurnWriteIntoHandHead` decides whether a just-flushed turn's writes should be replayed onto the
// hand head that outranks them. Its "is this flush still the story's current beat" check used to run OUTSIDE
// the per-game section, so a NEWER flush that landed while this one waited in the queue was invisible: the
// stale turn's patches were rebased onto whatever was head at execution time instead of being refused as
// superseded. The pin holds the section open, advances the beat inside that window, and asserts the refusal.

import type { Db } from "@orb/db";
import type { ChatId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { RpgGameRow } from "../../../../packages/server/src/domain/rpg/contract/service.ts";
import { findGameByChat } from "../../../../packages/server/src/domain/rpg/persistence/games.ts";
import {
  commitSnapshotForVariant,
  countSnapshots,
  writeHandSnapshot,
  writeStagedSnapshot,
} from "../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { foldTurnWriteIntoHandHead, serializeHandWrite } from "../../../../packages/server/src/domain/rpg/snapshot-edit.ts";
import { defaultSnapshotState } from "../../../../packages/server/src/domain/rpg/substrate/default-state.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, handTarget, seedLiteGame, seedMessage, target, test } from "./_support.ts";

/** Let the PRE-SECTION precheck the old shape ran reach its own queue slot before the beat advances — without
 *  this window the test would be racing the very ordering it is about. */
const PRECHECK_WINDOW_MS = 50;
const settle = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, PRECHECK_WINDOW_MS));

/** The game row the fold takes — loaded, never fabricated (it FKs the seeded chat). */
async function gameRow(db: Db, chatId: ChatId, gameId: RpgGameId): Promise<RpgGameRow> {
  const row = await findGameByChat(db, chatId);
  expect(row?.id).toBe(gameId);
  if (row === undefined) {
    throw new Error("seeded game vanished");
  }
  return row;
}

/** Beat 1's committed TURN snapshot plus the HAND row that outranks it — the state in which the fold's replay
 *  path is reachable at all (a non-hand head is `shadowed`, and being head ourselves is the ordinary flush). */
async function seedFoldable(db: Db, chatId: ChatId, gameId: RpgGameId, key: string): Promise<RpgSnapshotId> {
  const beat1 = await seedMessage(db, chatId, 1);
  const written = await writeStagedSnapshot(db, defaultSnapshotState(), target({ gameId, chatId, seq: 1, variantId: beat1.variantId, key: `turn-${key}` }));
  if (!written.ok) {
    throw new Error(`seed failed: ${written.reason}`);
  }
  await commitSnapshotForVariant(db, beat1.variantId);
  await writeHandSnapshot(db, defaultSnapshotState(), null, handTarget({ gameId, chatId, key: `hand-${key}` }));
  return written.row.id;
}

describe("foldTurnWriteIntoHandHead — the supersede check runs INSIDE the serialized section (#1458)", () => {
  test("a flush superseded WHILE it waited in the queue is refused, not rebased onto the newer head", async () => {
    const db = await freshDb();
    const { chatId, gameId, h } = await seedLiteGame(db);
    const snapshotId = await seedFoldable(db, chatId, gameId, "a");
    const before = await countSnapshots(db, gameId);
    const game = await gameRow(db, chatId, gameId);

    // Hold the per-game section open, then advance the story a beat from INSIDE it — the exact window a
    // newer turn's flush occupies while this one queues.
    const held = Promise.withResolvers<void>();
    const holding = Promise.withResolvers<void>();
    const occupant = serializeHandWrite(gameId, async (): Promise<void> => {
      holding.resolve();
      await held.promise;
      await seedMessage(db, chatId, 2);
    });
    await holding.promise;

    const folding = foldTurnWriteIntoHandHead(h.ctx, game, { patches: [], snapshotId }, 1);
    await settle();
    held.resolve();
    await occupant;

    const outcome = await folding;
    // Superseded: this flush's beat is no longer the story's current beat, so its writes are legitimately
    // dropped — injecting an old beat's consequences into the present is the resurrection bug wearing the
    // fix's clothes.
    expect(outcome.kind).toBe("head");
    expect(await countSnapshots(db, gameId)).toBe(before);
  });

  test("CONTROL: a flush that is STILL the current beat when its turn comes still folds", async () => {
    const db = await freshDb();
    const { chatId, gameId, h } = await seedLiteGame(db, {}, "b");
    const snapshotId = await seedFoldable(db, chatId, gameId, "b");
    const before = await countSnapshots(db, gameId);
    const game = await gameRow(db, chatId, gameId);

    const outcome = await foldTurnWriteIntoHandHead(h.ctx, game, { patches: [], snapshotId }, 1);

    expect(outcome.kind).toBe("folded");
    expect(await countSnapshots(db, gameId)).toBe(before + 1);
  });
});
