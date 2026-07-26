// persistence/journal — the VARIANT-AWARE archive + the lineage projection (rpg-design/05 §2.5). .int: real
// FK. Model entries stamp their producing variant (CASCADE); hand entries stamp NULL (every lineage). The
// READ projects the active lineage (variantId IS NULL OR variant = its slot's selectedVariantId) — a swipe
// changes what renders with ZERO writes.

import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { MessageId, MessageVariantId, RpgGameId, RpgJournalId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  deleteJournalEntry,
  insertJournalEntry,
  listActiveJournal,
  listJournalByVariant,
} from "../../../../../packages/server/src/domain/rpg/persistence/journal";
import { freshDb } from "../../../../support/db";
import { addVariant, expect, FROZEN_AT, seedChat, seedGame, seedMessage, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Select variant `v` as the slot's active variant (the swipe pointer flip). */
async function selectVariant(messageId: MessageId, variantId: MessageVariantId): Promise<void> {
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
}

async function addEntry(opts: {
  gameId: RpgGameId;
  key: string;
  variantId: MessageVariantId | null;
  title: string;
  sourceMessageId?: MessageId | null;
}): Promise<void> {
  await insertJournalEntry(db, {
    id: castId<RpgJournalId>(`rpg_journal_${opts.key}`),
    gameId: opts.gameId,
    type: "event",
    title: opts.title,
    content: opts.title,
    variantId: opts.variantId,
    sourceMessageId: opts.sourceMessageId ?? null,
    createdAt: FROZEN_AT,
  });
}

describe("the lineage projection", () => {
  test("a model entry renders only while ITS variant is selected; a swipe hides then reveals it", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    // One assistant slot with two variants A (selected) and B (a swipe).
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");
    // Model entries: one produced under A, one under B.
    await addEntry({ gameId, key: "onA", variantId: variantA, title: "beat-on-A" });
    await addEntry({ gameId, key: "onB", variantId: variantB, title: "beat-on-B" });

    // A selected ⇒ only A's entry renders.
    let visible = (await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title);
    expect(visible).toEqual(["beat-on-A"]);

    // Swipe to B ⇒ A's entry disappears, B's appears (ZERO journal writes).
    await selectVariant(messageId, variantB);
    visible = (await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title);
    expect(visible).toEqual(["beat-on-B"]);

    // Swipe back to A ⇒ A's entry reappears.
    await selectVariant(messageId, variantA);
    visible = (await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title);
    expect(visible).toEqual(["beat-on-A"]);
  });

  test("a HAND entry (variantId NULL) renders on EVERY lineage", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");
    await addEntry({ gameId, key: "hand", variantId: null, title: "room-note" });
    await addEntry({ gameId, key: "onA", variantId: variantA, title: "beat-on-A" });

    // A selected ⇒ hand note + A's entry.
    expect((await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title).sort()).toEqual(["beat-on-A", "room-note"]);
    // Swipe to B ⇒ the hand note STAYS; A's entry drops.
    await selectVariant(messageId, variantB);
    expect((await listActiveJournal(db, gameId, { limit: 50 })).map((r) => r.title)).toEqual(["room-note"]);
  });
});

describe("CASCADE on variant delete", () => {
  test("deleting a variant CASCADE-deletes its stamped journal entries", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const variantB = await addVariant(db, messageId, 1, "swipe B body");
    await addEntry({ gameId, key: "onA", variantId: variantA, title: "beat-on-A" });
    await addEntry({ gameId, key: "onB", variantId: variantB, title: "beat-on-B" });

    // Point the slot away from A so A can be deleted (a real swipe-delete path), then delete variant A.
    await selectVariant(messageId, variantB);
    await db.delete(messageVariants).where(eq(messageVariants.id, variantA));

    // A's entry is gone (CASCADE); B's survives.
    expect(await listJournalByVariant(db, variantA)).toHaveLength(0);
    expect(await listJournalByVariant(db, variantB)).toHaveLength(1);
  });
});

describe("hand edit / delete reaches model entries (the recovery path)", () => {
  test("deleteJournalEntry removes a model entry", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    await addEntry({ gameId, key: "onA", variantId, title: "beat" });
    await deleteJournalEntry(db, gameId, castId<RpgJournalId>("rpg_journal_onA"));
    expect(await listActiveJournal(db, gameId, { limit: 50 })).toHaveLength(0);
  });
});
