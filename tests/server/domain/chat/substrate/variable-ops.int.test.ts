// substrate/variable-ops — the STANDALONE (out-of-turn) runtime-variable write (automation-design/03 §1.1).
// Proves against a real libSQL db: an `applyVariableOps` with no turn in flight appends a seq-stamped batch
// to `chats.standalone_variable_deltas` AND refolds `chats.runtime_variables` in one write; successive calls
// accumulate + fold in order; a standalone delta stamped at the head seq folds AFTER the existing message-
// variant deltas (the unified fold source); an empty op list writes nothing.

import type { Db } from "@orb/db";
import { chats, messages, messageVariants } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { beforeEach } from "vitest";
import { applyStandaloneVariableOps } from "../../../../../packages/server/src/domain/chat/substrate/variable-ops.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedChat } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Read the two derived columns back. */
async function readChat(chatId: ChatId): Promise<{ runtime: Record<string, string> | null; standalone: unknown }> {
  const rows = await db.select({ runtime: chats.runtimeVariables, standalone: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId));
  const row = rows.at(0);
  return { runtime: row?.runtime ?? null, standalone: row?.standalone ?? null };
}

/** Seed one assistant slot at `seq` carrying a selected-variant `variableDelta`. */
async function seedMessageWithDelta(chatId: ChatId, seq: number, delta: readonly VarOp[]): Promise<void> {
  const messageId = castId<MessageId>(`message_${chatId}_${seq}`);
  const variantId = castId<MessageVariantId>(`variant_${chatId}_${seq}`);
  await db.insert(messages).values({ id: messageId, chatId, seq, role: "assistant", createdAt: FROZEN_AT });
  await db.insert(messageVariants).values({ id: variantId, messageId, idx: 0, content: "x", variableDelta: [...delta], createdAt: FROZEN_AT });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
}

test("an empty op list writes nothing (both derived columns stay null)", async () => {
  const chatId = await seedChat(db, "empty-ops");
  await applyStandaloneVariableOps(makeChatContext(db), chatId, []);
  expect(await readChat(chatId)).toEqual({ runtime: null, standalone: null });
});

test("a standalone write appends a seq-stamped batch AND refolds the runtime cache in one op", async () => {
  const chatId = await seedChat(db, "standalone-write");
  await applyStandaloneVariableOps(makeChatContext(db), chatId, [{ op: "set", key: "mood", value: "happy" }]);
  const { runtime, standalone } = await readChat(chatId);
  expect(runtime).toEqual({ mood: "happy" });
  // maxSeq of a message-less chat is 0 → the batch is seq-stamped 0.
  expect(standalone).toEqual([{ seq: 0, delta: [{ op: "set", key: "mood", value: "happy" }] }]);
});

test("successive standalone writes accumulate as batches and fold in order (set then inc)", async () => {
  const chatId = await seedChat(db, "standalone-accumulate");
  const ctx = makeChatContext(db);
  await applyStandaloneVariableOps(ctx, chatId, [{ op: "set", key: "count", value: "1" }]);
  await applyStandaloneVariableOps(ctx, chatId, [{ op: "inc", key: "count" }]);
  const { runtime, standalone } = await readChat(chatId);
  expect(runtime).toEqual({ count: "2" });
  expect(standalone).toEqual([
    { seq: 0, delta: [{ op: "set", key: "count", value: "1" }] },
    { seq: 0, delta: [{ op: "inc", key: "count" }] },
  ]);
});

test("a standalone delta folds together with the existing message-variant deltas (unified source)", async () => {
  const chatId = await seedChat(db, "standalone-interleave");
  // A committed turn set y=fromTurn (seq 1); the standalone then sets z + overrides y (stamped at maxSeq 1,
  // folded AFTER the message delta — the automation acted after the turn).
  await seedMessageWithDelta(chatId, 1, [{ op: "set", key: "y", value: "fromTurn" }]);
  await applyStandaloneVariableOps(makeChatContext(db), chatId, [
    { op: "set", key: "y", value: "fromStandalone" },
    { op: "set", key: "z", value: "9" },
  ]);
  const { runtime, standalone } = await readChat(chatId);
  expect(runtime).toEqual({ y: "fromStandalone", z: "9" });
  expect(standalone).toEqual([
    {
      seq: 1,
      delta: [
        { op: "set", key: "y", value: "fromStandalone" },
        { op: "set", key: "z", value: "9" },
      ],
    },
  ]);
});

// ── The two-writer race (#1463 item 1) ──────────────────────────────────────────────────────────────────
// The standalone plane's real callers are an automation arm executor, the analysis arm and the plugin-host
// membrane — none of which serialize on the chat. Both writers read the SAME chain snapshot (the hold parks
// them at the read that resolves it), rebuild the array from it and write; without a guard the second write
// overwrites the first's batch and its op is gone from BOTH the durable log and the folded cache.
test("two concurrent standalone writes both land (neither op is lost to the other's snapshot)", async () => {
  const held = await freshHeldDb();
  const chatId = await seedChat(held.db, "standalone-race");
  const ctx = makeChatContext(held.db);
  // Park BOTH writers at the read of the standalone chain, so each rebuilds from the pre-race snapshot.
  const gate = held.hold(/select "standalone_variable_deltas" from "chats"/iu, 2);
  const first = applyStandaloneVariableOps(ctx, chatId, [{ op: "set", key: "alpha", value: "1" }]);
  const second = applyStandaloneVariableOps(ctx, chatId, [{ op: "set", key: "beta", value: "2" }]);
  await gate.reached;
  gate.release();
  await Promise.all([first, second]);

  const rows = await held.db.select({ runtime: chats.runtimeVariables, standalone: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId));
  // Both ops survive in the folded cache AND in the durable batch log (the fold's source of truth).
  expect(rows.at(0)?.runtime).toEqual({ alpha: "1", beta: "2" });
  expect(rows.at(0)?.standalone).toHaveLength(2);
});
