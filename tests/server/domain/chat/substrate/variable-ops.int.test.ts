// substrate/variable-ops — the STANDALONE (out-of-turn) runtime-variable write (automation-design/03 §1.1).
// Proves against a real libSQL db: an `applyVariableOps` with no turn in flight appends a seq-stamped batch
// to `chats.standalone_variable_deltas` AND refolds `chats.runtime_variables` in one write; successive calls
// accumulate + fold in order; a standalone delta stamped at the head seq folds AFTER the existing message-
// variant deltas (the unified fold source); an empty op list writes nothing.

import type { StandaloneVariableDelta } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chats, messages, messageVariants } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { beforeEach } from "vitest";
import { applyStandaloneVariableOps } from "../../../../../packages/server/src/domain/chat/substrate/variable-ops.ts";
import { freshCountedDb, freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, seedChat } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Read the two derived columns off ANY db handle (the race pin drives a held one). */
async function readColumns(database: Db, chatId: ChatId): Promise<{ runtime: Record<string, string> | null; standalone: unknown }> {
  const rows = await database.select({ runtime: chats.runtimeVariables, standalone: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId));
  const row = rows.at(0);
  return { runtime: row?.runtime ?? null, standalone: row?.standalone ?? null };
}

/** Read the two derived columns back off the suite's own db. */
async function readChat(chatId: ChatId): Promise<{ runtime: Record<string, string> | null; standalone: unknown }> {
  return await readColumns(db, chatId);
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

/** The CAS read's SQL signature: the ONE statement that returns the guarded column BOTH ways (the driver's
 *  bytes for the predicate, drizzle's decoded value for the derivation), which drizzle renders as the column
 *  term TWICE. Every other projection of this column renders it once, so this regex parks that statement and
 *  nothing else — and a future split back into two reads stops matching, which the count pin below catches. */
const CAS_READ = /select "standalone_variable_deltas", "standalone_variable_deltas" from "chats"/iu;

/** How many statements a call issued that read the guarded column at all (either spelling). */
function standaloneColumnReads(statements: readonly string[]): string[] {
  return statements.filter((s) => /^select "standalone_variable_deltas"/iu.test(s));
}

// ── The two-writer race (#1463 item 1) ──────────────────────────────────────────────────────────────────
// The standalone plane's real callers are an automation arm executor, the analysis arm and the plugin-host
// membrane — none of which serialize on the chat. Both writers read the SAME chain snapshot (the hold parks
// them at the read that resolves it), rebuild the array from it and write; without a guard the second write
// overwrites the first's batch and its op is gone from BOTH the durable log and the folded cache.
test("two concurrent standalone writes both land (neither op is lost to the other's snapshot)", async () => {
  const held = await freshHeldDb();
  const chatId = await seedChat(held.db, "standalone-race");
  const ctx = makeChatContext(held.db);
  // Park BOTH writers at the CAS read of the standalone chain, so each rebuilds from the pre-race snapshot.
  // The DOUBLED projection is that statement's signature and the reason the count is trustworthy: it is the
  // one read that returns both the predicate's bytes and the array to rebuild, and drizzle renders every
  // OTHER projection of this column with a single term (measured, not assumed — `CAS_READ` below).
  const gate = held.hold(CAS_READ, 2);
  const first = applyStandaloneVariableOps(ctx, chatId, [{ op: "set", key: "alpha", value: "1" }]);
  const second = applyStandaloneVariableOps(ctx, chatId, [{ op: "set", key: "beta", value: "2" }]);
  await gate.reached;
  // POSITIVE CONTROL for the hold itself: `reached` resolved, so two statements matched — and neither writer
  // has written yet, which is what makes this a RACE pin rather than two sequential writes that would pass
  // whatever the code did. (A regex that matched nothing would hang here instead; one that matched the WRITES
  // would fail this line.)
  expect((await readColumns(held.db, chatId)).standalone).toBeNull();
  gate.release();
  await Promise.all([first, second]);

  const settled = await readColumns(held.db, chatId);
  // Both ops survive in the folded cache AND in the durable batch log (the fold's source of truth).
  expect(settled.runtime).toEqual({ alpha: "1", beta: "2" });
  expect(settled.standalone).toHaveLength(2);
});

// ── The race THROUGH the guard (#1634 item 1) ───────────────────────────────────────────────────────────
// A CAS is only as good as the snapshot it compares. While the derivation input and the predicate's bytes
// came from TWO reads of the same column, a sibling committing BETWEEN them made the guard PASS against the
// sibling's bytes while the array was rebuilt from the pre-sibling chain — the lost update, laundered through
// the mechanism meant to stop it.
//
// THE STRUCTURAL PIN IS THE PRIMARY PROOF, deliberately: the two reads were BYTE-IDENTICAL SQL, so no
// text-matching hold can park one of them specifically and the interleaving is not reproducible on demand
// (that is precisely why the defect survived a behavioural race pin). What IS decidable is the property the
// defect violates — the snapshot is one statement — so that is what this asserts.
test("the CAS snapshot is ONE read of the guarded column (two reads are the race, in or out of the guard)", async () => {
  const { db: counted, queries } = await freshCountedDb();
  const chatId = await seedChat(counted, "standalone-one-read");
  queries.reset();

  await applyStandaloneVariableOps(makeChatContext(counted), chatId, [{ op: "set", key: "alpha", value: "1" }]);

  const reads = standaloneColumnReads(queries.statements());
  expect(reads).toHaveLength(1);
  // …and that one read is the CAS shape (both projections), not a bare parsed read whose bytes the predicate
  // would have to fetch separately. A planted positive control for the matcher itself: the filter above is
  // non-empty, so a zero here would be "I could not measure", never "there is one read".
  expect(reads[0]).toMatch(CAS_READ);
});

// The behavioural companion: with the snapshot resolved by one statement, a sibling that commits while this
// writer is parked at that statement is FOLDED IN rather than overwritten. (Its pre-fix run cannot be made
// deterministic — see above — so the structural pin is what carries the defect proof.)
test("a sibling committing mid-read is folded in, not overwritten", async () => {
  const held = await freshHeldDb();
  const chatId = await seedChat(held.db, "standalone-straddle");
  const ctx = makeChatContext(held.db);

  // Park the writer at its CAS read of the standalone chain (arrivals 1 — only this writer is running).
  const gate = held.hold(CAS_READ, 1);
  const parked = applyStandaloneVariableOps(ctx, chatId, [{ op: "set", key: "beta", value: "2" }]);
  await gate.reached;
  // POSITIVE CONTROL: the writer really is parked BEFORE its read, so what follows is genuinely "a sibling
  // committed mid-read" and not a sequential write the code would survive either way.
  expect((await readColumns(held.db, chatId)).standalone).toBeNull();

  // THE SIBLING: any other committed standalone write (an automation arm on another connection). Written
  // directly so it does not queue behind the same gate — what matters is only that it lands mid-read.
  const siblingBatch: StandaloneVariableDelta[] = [{ seq: 0, delta: [{ op: "set", key: "alpha", value: "1" }] }];
  await held.db
    .update(chats)
    .set({ standaloneVariableDeltas: siblingBatch, runtimeVariables: { alpha: "1" } })
    .where(eq(chats.id, chatId));

  gate.release();
  await parked;

  const settled = await readColumns(held.db, chatId);
  expect(settled.standalone).toEqual([...siblingBatch, { seq: 0, delta: [{ op: "set", key: "beta", value: "2" }] }]);
  expect(settled.runtime).toEqual({ alpha: "1", beta: "2" });
});
