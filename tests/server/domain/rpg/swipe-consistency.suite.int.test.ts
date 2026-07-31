// swipe-consistency — THE RATIFICATION PIN (rpg-design/05 §2.5, ratification #1). Everything the context
// panel renders must be swipe-consistent. This suite drives the FULL W1a stack (staging → clone-forward →
// per-variant snapshot resolution + the journal lineage projection) to prove: pool + wallet + quest state
// written on variant A rewind when you swipe to B, and RETURN when you swipe back — because each variant's
// snapshot is its own truth (variant-keyed), and the tracker re-resolves the whole panel from the selected
// variant's snapshot. Journal rides the parallel lineage projection.
//
// This is the "hardest-won" machinery: total swipe consistency across every panel plane, from ONE mechanism.

import type { Db } from "@orb/db";
import { messages } from "@orb/db";
import type { ChatTurnId, MessageId, MessageVariantId, RpgJournalId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { snapshotRowToState } from "../../../../packages/server/src/domain/rpg/contract/service";
import { insertJournalEntry, listActiveJournal } from "../../../../packages/server/src/domain/rpg/persistence/journal";
import { findSnapshotByVariant, writeStagedSnapshot } from "../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { createRpgStagingStore } from "../../../../packages/server/src/domain/rpg/staging";
import { freshDb } from "../../../support/db";
import { actorWithWallet, addVariant, emptyState, expect, FROZEN_AT, quest, seedChat, seedGame, seedMessage, target, test } from "./_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function selectVariant(messageId: MessageId, variantId: MessageVariantId): Promise<void> {
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
}

/** Resolve a variant's snapshot or throw (test-local — the ratification drive always has a snapshot). */
async function panelForVariant(variantId: MessageVariantId): Promise<{ pool: number | string | undefined; gold: number | undefined; quests: number }> {
  const snap = await findSnapshotByVariant(db, variantId);
  if (!snap) {
    throw new Error(`no snapshot for ${variantId}`);
  }
  return panelOf(snapshotRowToState(snap));
}

/** The tracker "view" reduction the CP client consumes (W1b composes the real one) — here reduced to the
 *  three planes the ratification names: the `focus` tracker reading, the wallet gold, and the active quest count. */
function panelOf(state: ReturnType<typeof snapshotRowToState>): { pool: number | string | undefined; gold: number | undefined; quests: number } {
  const actor = state.actorState[0];
  return {
    pool: actor?.trackerValues["focus"]?.value ?? undefined,
    gold: actor?.wallet[0]?.amount,
    quests: state.quests.filter((q) => q.status === "active").length,
  };
}

describe("the ratification pin — pool + wallet + quest rewind on swipe", () => {
  test("write on A, swipe to B rewinds ALL THREE planes, swipe back returns them", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    // One assistant slot, two variants A and B (a swipe pair).
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");

    // Variant A's turn: a tool stages pool=30, gold=100, one active quest — flushed to A's snapshot.
    const storeA = createRpgStagingStore();
    const turnA = castId<ChatTurnId>("chat_turn_a");
    storeA.ensure(turnA, emptyState());
    storeA.stage(turnA, { actorState: [actorWithWallet("gorak", 100, 30)], quests: [quest("main")] });
    const flushA = storeA.take(turnA);
    if (!flushA) {
      throw new Error("no flush A");
    }
    await writeStagedSnapshot(db, flushA.state, target({ gameId, chatId, seq: 1, variantId: variantA, key: "onA" }));

    // Variant B's turn (a re-roll): a DIFFERENT outcome — pool=5, gold=0, NO active quests (it failed).
    const storeB = createRpgStagingStore();
    const turnB = castId<ChatTurnId>("chat_turn_b");
    storeB.ensure(turnB, emptyState());
    storeB.stage(turnB, { actorState: [actorWithWallet("gorak", 0, 5)], quests: [quest("main", { status: "failed" })] });
    const flushB = storeB.take(turnB);
    if (!flushB) {
      throw new Error("no flush B");
    }
    await writeStagedSnapshot(db, flushB.state, target({ gameId, chatId, seq: 1, variantId: variantB, key: "onB" }));

    // A selected ⇒ the panel resolves A's snapshot: pool 30, gold 100, 1 active quest.
    await selectVariant(messageId, variantA);
    expect(await panelForVariant(variantA)).toEqual({ pool: 30, gold: 100, quests: 1 });

    // Swipe to B ⇒ ALL THREE rewind: pool 5, gold 0, 0 active quests.
    await selectVariant(messageId, variantB);
    expect(await panelForVariant(variantB)).toEqual({ pool: 5, gold: 0, quests: 0 });

    // Swipe back to A ⇒ they return.
    await selectVariant(messageId, variantA);
    expect(await panelForVariant(variantA)).toEqual({ pool: 30, gold: 100, quests: 1 });
  });
});

describe("the ratification pin — journal lineage rides the same swipe", () => {
  test("a model beat from A shows under A, hides under B, returns under A; a hand note shows on both", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");

    // A model beat produced under A, a hand/room note (NULL variant), a model beat under B.
    await insertJournalEntry(db, {
      id: castId<RpgJournalId>("rpg_journal_a"),
      gameId,
      type: "event",
      title: "beat-A",
      content: "x",
      variantId: variantA,
      sourceMessageId: null,
      createdAt: FROZEN_AT,
    });
    await insertJournalEntry(db, {
      id: castId<RpgJournalId>("rpg_journal_hand"),
      gameId,
      type: "note",
      title: "room-note",
      content: "x",
      variantId: null,
      sourceMessageId: null,
      createdAt: FROZEN_AT,
    });
    await insertJournalEntry(db, {
      id: castId<RpgJournalId>("rpg_journal_b"),
      gameId,
      type: "event",
      title: "beat-B",
      content: "x",
      variantId: variantB,
      sourceMessageId: null,
      createdAt: FROZEN_AT,
    });

    await selectVariant(messageId, variantA);
    expect((await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title).sort()).toEqual(["beat-A", "room-note"]);

    await selectVariant(messageId, variantB);
    expect((await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title).sort()).toEqual(["beat-B", "room-note"]);

    await selectVariant(messageId, variantA);
    expect((await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title).sort()).toEqual(["beat-A", "room-note"]);
  });
});
