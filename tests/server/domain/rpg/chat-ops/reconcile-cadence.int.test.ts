// chat-ops/reconcile-cadence — isReconcileBeat: the RECONCILE-BEAT check. Pins: `reconcileEveryBeats <= 0` is
// OFF (opt-out), and a beat fires exactly when `(priorBeats + 1) % N === 0` — derived from a count read
// BEFORE this beat's own write, so gather and flush see the same verdict.

import type { Db } from "@orb/db";
import { rpgSnapshots } from "@orb/db";
import type { ChatId, RpgGameId } from "@orb/kit/ids";
import { describe } from "vitest";
import { isReconcileBeat } from "../../../../../packages/server/src/domain/rpg/chat-ops/reconcile-cadence.ts";
import type { RpgGameRow } from "../../../../../packages/server/src/domain/rpg/contract/service.ts";
import { writeHandSnapshot } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { emptyState, handTarget, liteConfig, seedChat, seedGame, seedMessage, target } from "../_support.ts";

function gameWith(gameId: RpgGameId, reconcileEveryBeats: number): RpgGameRow {
  // FABRICATION-OK: a minimal RpgGameRow double — isReconcileBeat reads only id and config.reconcileEveryBeats.
  return { id: gameId, config: { ...liteConfig(), reconcileEveryBeats } } as unknown as RpgGameRow;
}

async function seedBeat(db: Db, gameId: RpgGameId, chatId: ChatId, seq: number): Promise<void> {
  const { variantId } = await seedMessage(db, chatId, seq, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId, chatId, seq, variantId, key: `beat${seq}` }),
    ...emptyState(),
    committed: 1,
  });
}

describe("isReconcileBeat", () => {
  test("reconcileEveryBeats <= 0 is OFF — never fires regardless of the snapshot count", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "off");
    const gameId = await seedGame(db, chatId, "off");

    expect(await isReconcileBeat(db, gameWith(gameId, 0))).toBe(false);
  });

  test("N=2: fires on beat 2 (1 prior), not beat 1 (0 prior)", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "cadence");
    const gameId = await seedGame(db, chatId, "cadence");
    const game = gameWith(gameId, 2);

    expect(await isReconcileBeat(db, game)).toBe(false); // 0 prior beats -> ordinal 1
    await seedBeat(db, gameId, chatId, 1);
    expect(await isReconcileBeat(db, game)).toBe(true); // 1 prior beat -> ordinal 2
  });

  test("HAND rows are NOT beats: a host edit between beats does not shift the cadence boundary", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "hand");
    const gameId = await seedGame(db, chatId, "hand");
    const game = gameWith(gameId, 2);

    await seedBeat(db, gameId, chatId, 1);
    // A HAND write (host resync / populate-from-card / checkpoint restore / an editSnapshot clone-forward) is
    // a message-less row (D124), never a gameplay beat. Counting it made the expensive full-corpus
    // reconciliation cadence depend on how much the host happened to be editing by hand.
    await writeHandSnapshot(db, emptyState(), null, handTarget({ gameId, chatId, key: "hand-1" }));

    // STILL 1 prior beat -> this beat is ordinal 2 -> the N=2 boundary fires here, not one beat later.
    expect(await isReconcileBeat(db, game)).toBe(true);
  });

  test("the verdict is derived from the count BEFORE this beat's own write (reads consistent for gather+flush)", async () => {
    const db = await freshDb();
    const chatId = await seedChat(db, "n3");
    const gameId = await seedGame(db, chatId, "n3");
    const game = gameWith(gameId, 3);

    await seedBeat(db, gameId, chatId, 1);
    await seedBeat(db, gameId, chatId, 2);
    // 2 prior beats -> ordinal 3 -> fires.
    expect(await isReconcileBeat(db, game)).toBe(true);
  });
});
