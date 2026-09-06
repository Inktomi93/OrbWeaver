// persistence/snapshots — the resolution ladder + clone-forward + committed lifecycle (rpg-design/05 §2.4)
// AND the D124 TWO-ARM law: a snapshot is variant-keyed IFF a turn flush produced it; every other write is a
// message-less HAND row ordered by `asOfMessageId`. .int: real libSQL, real FK + CHECK enforcement over
// messages/message_variants/rpg_snapshots. The ladder is the swipe-rewind mechanism's core — each rung is
// exercised in isolation, in fall-through order, and with the two arms INTERLEAVED (the case that did not
// exist before D124 and is the whole risk surface of the reshape).

import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { eq, isNull } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { snapshotRowToState } from "../../../../../packages/server/src/domain/rpg/contract/service.ts";
import {
  commitSnapshotForVariant,
  findSnapshotByVariant,
  insertSnapshot,
  resolveSnapshotBeforeSlot,
  resolveSnapshotForTurn,
  resolveSnapshotHead,
  resolveTurnSnapshotPair,
  writeHandSnapshot,
  writeStagedSnapshot,
} from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { addVariant, emptyState, expect, FROZEN_AT, handTarget, seedChat, seedGame, seedMessage, snapshotId, target, test } from "../_support.ts";

const CORRUPT_TABLE_RE = /rpg_snapshots/;
const POOLS_MAX_RE = /pools|max/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Insert a committed snapshot keyed to a variant, carrying a marker location. */
async function seedSnapshot(opts: {
  gameId: string;
  chatId: ChatId;
  seq: number;
  variantId: MessageVariantId;
  key: string;
  location: string;
  committed?: number;
}): Promise<void> {
  await insertSnapshot(db, {
    id: snapshotId(opts.key),
    gameId: opts.gameId as never,
    messageId: `message_${opts.chatId}_${opts.seq}` as never,
    variantId: opts.variantId,
    location: opts.location,
    committed: opts.committed ?? 1,
    createdAt: FROZEN_AT + opts.seq,
  });
}

describe("the head resolution ladder", () => {
  test("rung 1 — a fresh turn resolves the last VISIBLE assistant slot's selected-variant snapshot", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: first.variantId, key: "s1", location: "old-room" });
    const second = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: second.variantId, key: "s2", location: "new-room" });

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base?.location).toBe("new-room");
  });

  test("rung 1 skips an excludedFromPrompt assistant slot", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const visible = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: visible.variantId, key: "s1", location: "kept-room" });
    const excluded = await seedMessage(db, chatId, 2, { role: "assistant", excludedFromPrompt: true });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: excluded.variantId, key: "s2", location: "hidden-room" });

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base?.location).toBe("kept-room");
  });

  test("rung 2 — no visible assistant slot ⇒ latest COMMITTED by createdAt", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    // A user message only (no assistant slot to anchor rung 2). Two committed snapshots exist directly.
    const u = await seedMessage(db, chatId, 1, { role: "user" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: u.variantId, key: "s-old", location: "old", committed: 1 });
    // A later committed snapshot on a non-message-anchored variant (createdAt wins).
    const u2 = await seedMessage(db, chatId, 2, { role: "user" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: u2.variantId, key: "s-new", location: "newest", committed: 1 });

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base?.location).toBe("newest");
  });

  test("rung 3 — no committed snapshot ⇒ latest ANY (uncommitted)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const u = await seedMessage(db, chatId, 1, { role: "user" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: u.variantId, key: "s-unc", location: "uncommitted", committed: 0 });

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base?.location).toBe("uncommitted");
    expect(base?.committed).toBe(0);
  });

  test("born-seed miss — a game with no snapshots resolves undefined", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base).toBeUndefined();
  });
});

describe("RPG-REWIND-STUCK — the turn arm WALKS the selected lineage; a swipe rewinds", () => {
  // The owner's class report was "rewinding swipes leaves state stuck" (2026-08-13, no single repro). The turn
  // arm used to inspect exactly ONE slot: it read the tail assistant slot, looked up its SELECTED variant's
  // snapshot, and returned nothing if there wasn't one. But a snapshot-less variant is the NORMAL case —
  // `chat-ops/flush.ts`: "a turn that staged NOTHING writes NO snapshot", and under the born-default `folded`
  // mode that is every beat which changes no tracked state. So the arm went dark on most beats and the head
  // fell to the game-wide `latestSnapshot`, which orders by `createdAt`, is blind to story position, and
  // excludes no slot. Linear play hid it (write order agrees with story order); a REWIND exposed it by
  // resolving the ABANDONED SIBLING VARIANT'S OWN ROW.
  //
  // These are TRANSITION tests, not endpoint pokes (the merge-clear-needs-a-transition-test law): each drives
  // the swipe and asserts the state on BOTH sides of it, because "stuck" is by definition a claim about what
  // a transition failed to change.

  test("swiping to a QUIET sibling rewinds to the previous beat — and swiping BACK returns", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const b1 = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: b1.variantId, key: "s1", location: "the ford" });
    const b2 = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: b2.variantId, key: "s2", location: "the keep" });

    // BEFORE: beat 2's own variant is selected and carries a snapshot.
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the keep");

    // THE SWIPE — a sibling variant on the SAME slot whose turn was quiet, so it wrote no snapshot at all.
    const quiet = await addVariant(db, b2.messageId, 1, "she says nothing of the keep");
    await db.update(messages).set({ selectedVariantId: quiet }).where(eq(messages.id, b2.messageId));

    // AFTER: beat 2 now contributes nothing, so the head is beat 1 — NOT the abandoned sibling's "the keep",
    // which is the row the position-blind fallback used to hand back.
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the ford");

    // AND BACK — the return leg is what makes this a transition test rather than two endpoints: re-selecting
    // the original variant must restore its consequences with zero writes (D26's swipe-rewind promise).
    await db.update(messages).set({ selectedVariantId: b2.variantId }).where(eq(messages.id, b2.messageId));
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the keep");
  });

  test("the head NEVER resolves a non-selected sibling's row — even when it is the only snapshot in the game", async () => {
    // The starkest form of the same defect: one beat, two variants, only the ABANDONED one ever wrote state.
    // The honest answer is the pre-story baseline (undefined ⇒ the caller synthesizes the born default), not a
    // row belonging to prose the user navigated away from.
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the keep" });
    const quiet = await addVariant(db, beat.messageId, 1, "a quieter beat");
    await db.update(messages).set({ selectedVariantId: quiet }).where(eq(messages.id, beat.messageId));

    expect(await resolveSnapshotForTurn(db, { id: gameId, chatId })).toBeUndefined();
  });

  test("LINEAR play with a quiet tail beat resolves through the TURN arm, not the createdAt fallback", async () => {
    // The control, and the reason the defect had no repro: this case was ALREADY answered correctly, but by the
    // position-blind fallback rather than the ladder. Same visible answer, wrong machinery — and the wrong
    // machinery is what broke the moment anything was rewound. Pinning the ANSWER alone would not have caught
    // the defect, so this asserts the row identity that only the lineage walk can produce.
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const b1 = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: b1.variantId, key: "s1", location: "the ford" });
    // Beat 2 is quiet — no snapshot row of its own.
    await seedMessage(db, chatId, 2, { role: "assistant" });

    const head = await resolveSnapshotHead(db, { id: gameId, chatId });
    expect(head?.arm).toBe("turn");
    expect(head?.seq).toBe(1);
    expect(head?.row.location).toBe("the ford");
  });

  test("the walk stays on the SELECTED lineage — an unselected earlier sibling is skipped, not preferred", async () => {
    // The descent must not turn into "any snapshot below me": beat 1 has two variants and the selected one is
    // quiet, so the walk must pass beat 1 entirely rather than pick up its abandoned sibling on the way down.
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const b0 = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: b0.variantId, key: "s0", location: "the road" });
    const b1 = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: b1.variantId, key: "s1", location: "the keep" });
    // Swipe beat 2 to a quiet sibling, and beat 1 as well — beat 1's own contribution is now abandoned too.
    const quiet2 = await addVariant(db, b1.messageId, 1, "quiet 2");
    await db.update(messages).set({ selectedVariantId: quiet2 }).where(eq(messages.id, b1.messageId));

    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the road");

    const quiet0 = await addVariant(db, b0.messageId, 1, "quiet 1");
    await db.update(messages).set({ selectedVariantId: quiet0 }).where(eq(messages.id, b0.messageId));

    // Both beats are now quiet on the selected lineage — the story has established nothing.
    expect(await resolveSnapshotForTurn(db, { id: gameId, chatId })).toBeUndefined();
  });
});

describe("resolveSnapshotBeforeSlot — the turn's WRITE base (VER-1a)", () => {
  test("a REROLL bases on the slot BEFORE it — never on its own slot's rejected variant", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    // Beat 1 (a prior slot) then beat 2, which is about to be rerolled.
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: first.variantId, key: "s1", location: "the ford" });
    const slot = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: slot.variantId, key: "s2", location: "the tower" });
    // The reroll's new variant is selected on that same slot (the pointer already moved when it streamed).
    const rerolled = await addVariant(db, slot.messageId, 1, "regen body");
    await db.update(messages).set({ selectedVariantId: rerolled }).where(eq(messages.id, slot.messageId));

    // The base is beat 1's state — the rejected variant's applied extraction is excluded, so the new variant's
    // own delta lands ONCE (pre-fix this resolved "the tower" and the fresh extraction stacked onto it).
    const base = await resolveSnapshotBeforeSlot(db, { id: gameId, chatId }, slot.messageId);
    expect(base?.location).toBe("the ford");
    expect(base?.variantId).toBe(first.variantId);
  });

  test("a FIRST generation on a fresh slot resolves exactly what the head does", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: first.variantId, key: "s1", location: "the ford" });
    const fresh = await seedMessage(db, chatId, 2, { role: "assistant" }); // no snapshot yet — the turn in flight

    const base = await resolveSnapshotBeforeSlot(db, { id: gameId, chatId }, fresh.messageId);
    expect(base?.location).toBe("the ford");
    expect(base?.id).toBe((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.id);
  });

  test("the game-wide fallback rungs also exclude the flushing slot's own rows", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    // No PRIOR assistant slot at all — only this slot's own (rejected) snapshot exists, so the walk falls
    // through to the committed/any rungs. They must not hand the turn its own sibling back.
    const slot = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: slot.variantId, key: "s1", location: "the tower" });

    expect(await resolveSnapshotBeforeSlot(db, { id: gameId, chatId }, slot.messageId)).toBeUndefined(); // ⇒ the born default
  });

  test("a turnless game resolves undefined (the born-default path is unchanged)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const fresh = await seedMessage(db, chatId, 1, { role: "assistant" });
    expect(await resolveSnapshotBeforeSlot(db, { id: gameId, chatId }, fresh.messageId)).toBeUndefined();
  });
});

describe("clone-forward + the committed lifecycle", () => {
  test("writeStagedSnapshot clones ALL state onto the committed variant, born committed=0", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

    const state = { ...emptyState(), location: "forwarded", quests: [], recentEvents: ["a beat"] };
    // A valid state writes — `{ok:false}` only on a contract-INVALID state (the F1 structural backstop).
    const written = await writeStagedSnapshot(db, state, target({ gameId, chatId, seq: 1, variantId, key: "fwd" }));
    expect(written.ok).toBe(true);
    const row = written.ok ? written.row : undefined;
    expect(row?.location).toBe("forwarded");
    expect(row?.recentEvents).toEqual(["a beat"]);
    expect(row?.committed).toBe(0);

    // onUserCommit locks it in (0 → 1).
    await commitSnapshotForVariant(db, variantId);
    const reread = await findSnapshotByVariant(db, variantId);
    expect(reread?.committed).toBe(1);
  });

  test("P5: the plot plane round-trips the staged write and clones forward as a FRESH object (never a shared ref)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const plot = {
      act: 2,
      title: "The Bone Key",
      acts: [
        { title: "Arrival", summary: "" },
        { title: "Descent", summary: "" },
      ],
    };
    const state = { ...emptyState(), plot };

    const written = await writeStagedSnapshot(db, state, target({ gameId, chatId, seq: 1, variantId, key: "fwd" }));
    expect(written.ok ? written.row.plot : undefined).toEqual(plot);

    // Clone-forward like quests, NEVER a shared ref: projecting the row back to state deep-copies the plot
    // (a mutation on the forwarded state must not reach the parsed base row — swipe-consistency by copy).
    const row = await findSnapshotByVariant(db, variantId);
    const forwarded = row === undefined ? undefined : snapshotRowToState(row);
    expect(forwarded?.plot).toEqual(plot);
    expect(forwarded?.plot).not.toBe(row?.plot);
    expect(forwarded?.plot?.acts).not.toBe(row?.plot?.acts);
    if (forwarded?.plot !== null && forwarded?.plot !== undefined) {
      forwarded.plot.act = 99;
      forwarded.plot.acts[0] = { title: "mutated", summary: "" };
    }
    expect(row?.plot?.act).toBe(2);
    expect(row?.plot?.acts[0]?.title).toBe("Arrival");
  });

  test("fieldLocks carry forward on the staged write (tools never author locks)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const state = { ...emptyState(), location: "x", fieldLocks: { location: true as const } };

    const written = await writeStagedSnapshot(db, state, target({ gameId, chatId, seq: 1, variantId, key: "fwd" }));
    expect(written.ok ? written.row.fieldLocks : undefined).toEqual({ location: true });
  });
});

describe("parse-on-read corruption belt", () => {
  test("a structurally-corrupt JSON column throws RpgStateCorruptError, never a silent default", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId, key: "s1", location: "ok" });
    // Poison the quests column past the schema (a string where an array of quest objects belongs).
    await db
      .update(rpgSnapshots)
      .set({ quests: "not-an-array" as never })
      .where(eq(rpgSnapshots.variantId, variantId));

    await expect(findSnapshotByVariant(db, variantId)).rejects.toThrow(CORRUPT_TABLE_RE);
  });
});

describe("write-boundary structural backstop (stickler F1)", () => {
  test("writeStagedSnapshot REFUSES a contract-invalid state (returns {ok:false} WITH a reason, commits nothing)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    // A `trackerValues.<key>.max = 0` state violates the contract belt (a meter ceiling is `>= 1`) —
    // parse-on-read would throw AFTER the insert commits. The backstop must refuse it at the write boundary,
    // BEFORE the durable insert.
    const invalid = {
      ...emptyState(),
      actorState: [
        {
          actorRef: { kind: "npc" as const, npcKey: "broken" },
          volatile: { trackerValues: { hp: { value: 1, items: null, max: 0 } }, conditions: [], inventory: [], wallet: [], status: "" },
        },
      ],
    };

    const written = await writeStagedSnapshot(db, invalid, target({ gameId, chatId, seq: 1, variantId, key: "bad" }));

    expect(written.ok).toBe(false); // refused
    // The drop is NEVER silent: the result carries the field-level reason so the flush can log WHY (the
    // visibility fix — a state round that produced applicable output must not vanish without a signal).
    expect(written.ok ? "" : written.reason).toMatch(POOLS_MAX_RE);
    expect(await findSnapshotByVariant(db, variantId)).toBeUndefined(); // NOTHING committed — canon uncorrupted
  });

  test("writeStagedSnapshot WRITES a contract-valid state (the positive control)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const valid = {
      ...emptyState(),
      actorState: [
        {
          actorRef: { kind: "npc" as const, npcKey: "ok" },
          volatile: { trackerValues: { mana: { value: 0, items: null, max: null } }, conditions: [], inventory: [], wallet: [], status: "" },
        },
      ],
    };

    const written = await writeStagedSnapshot(db, valid, target({ gameId, chatId, seq: 1, variantId, key: "ok" }));
    expect(written.ok ? written.row.actorState?.[0]?.volatile.trackerValues : undefined).toEqual({ mana: { value: 0, items: null, max: null } });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// D124 — THE HAND ARM: message-less snapshots, and the interleaved ladder order
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// A hand write (the 7 hand doors, resync, populate, checkpoint restore) used to BUY its ladder position by
// posting an empty-body assistant slot. Those rows were durable canon no reader saw, and they leaked onto
// every plane that consumes messages. The hand row replaces them: no message, no variant, an `asOfMessageId`
// order stamp. These tests pin the order the ladder now decides, in both walks.

/** Write a hand row carrying a marker location; `now` drives the createdAt tie-break inside one as-of slot. */
async function seedHandRow(opts: { gameId: string; chatId: ChatId; key: string; location: string; now?: number }): Promise<void> {
  await writeHandSnapshot(
    db,
    { ...emptyState(), location: opts.location },
    null,
    handTarget({ gameId: opts.gameId as never, chatId: opts.chatId as never, key: opts.key, now: opts.now ?? FROZEN_AT }),
  );
}

describe("the hand arm — a snapshot with no message", () => {
  test("a hand write posts NOTHING and stamps the chat's TAIL slot as its as-of position", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });
    const messagesBefore = await db.select().from(messages).where(eq(messages.chatId, chatId));

    await seedHandRow({ gameId, chatId, key: "h1", location: "the hand-edited hall" });

    // ZERO message rows minted (the whole point — the leaking row class is unspellable).
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(messagesBefore.length);
    const hand = (await db.select().from(rpgSnapshots).where(isNull(rpgSnapshots.variantId)))[0];
    expect(hand?.messageId).toBeNull();
    expect(hand?.variantId).toBeNull();
    expect(hand?.asOfMessageId).toBe(beat.messageId);
    expect(hand?.committed).toBe(1); // a hand write is the truth immediately
  });

  test("a hand row at the same as-of slot BEATS that slot's turn row (you edited on top of that beat)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });

    await seedHandRow({ gameId, chatId, key: "h1", location: "the hall" });

    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the hall");
  });

  test("a LATER turn row beats an older hand row (play moves on past a hand edit)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: first.variantId, key: "s1", location: "the ford" });
    await seedHandRow({ gameId, chatId, key: "h1", location: "the hall" });

    const second = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: second.variantId, key: "s2", location: "the tower" });

    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the tower");
  });

  test("an 8-WRITE BURST mints 8 hand rows, ZERO messages, and the head is the LAST", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });

    // The flagship demo's authored setup: N consecutive hand writes on a committed head. Pre-D124 this was
    // N blank "Group" bubbles in the transcript and N `"mes":""` rows in every export.
    for (let i = 0; i < 8; i++) {
      await seedHandRow({ gameId, chatId, key: `burst_${i}`, location: `hand-${i}`, now: FROZEN_AT + i });
    }

    // THE EXPORT PROOF, stated at its source: `export-chat.ts::loadParsedMessages` is exactly this query
    // (`select().from(messages).where(chatId)`) and maps `mes: selected.content`. One real beat in canon ⇒
    // one row in both export formats and ZERO `"mes":""` rows named after the synthetic Group card — clean by
    // construction, with no anchor predicate anywhere in the export path (there is nothing left to filter).
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
    expect(await db.select().from(rpgSnapshots).where(isNull(rpgSnapshots.variantId))).toHaveLength(8);
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("hand-7");
  });

  test("a TURNLESS hand write stamps a NULL as-of and orders before all history", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    await seedHandRow({ gameId, chatId, key: "h0", location: "the born hall" });

    const head = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(head?.asOfMessageId).toBeNull();
    expect(head?.location).toBe("the born hall");

    // The story then starts; the first real beat's turn row takes the head over the pre-history hand row.
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the ford");
  });

  test("VER-1a: the write base for a reroll INCLUDES a hand edit made below the slot, EXCLUDES one made on it", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: first.variantId, key: "s1", location: "the ford" });
    // The host hand-edits between beats — as-of slot 1, so it is strictly BELOW slot 2.
    await seedHandRow({ gameId, chatId, key: "h_below", location: "the hand-fixed ford" });

    const slot = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: slot.variantId, key: "s2", location: "the tower" });
    // …and again AFTER slot 2 landed (as-of slot 2). That edit is downstream of the slot being rerolled and
    // must NOT become its base, or the reroll re-applies its own consequences (the duplicate-beat class).
    await seedHandRow({ gameId, chatId, key: "h_at", location: "the downstream hall" });

    expect((await resolveSnapshotBeforeSlot(db, { id: gameId, chatId }, slot.messageId))?.location).toBe("the hand-fixed ford");
  });

  test("the delta PAIR walks one rung back through a hand-edit burst", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });
    await seedHandRow({ gameId, chatId, key: "h1", location: "hand-1", now: FROZEN_AT + 1 });
    await seedHandRow({ gameId, chatId, key: "h2", location: "hand-2", now: FROZEN_AT + 2 });

    // cur = the newest hand row; prev = the one immediately before it (NOT the turn row two rungs back).
    const pair = await resolveTurnSnapshotPair(db, { id: gameId, chatId });
    expect(pair.cur?.location).toBe("hand-2");
    expect(pair.prev?.location).toBe("hand-1");
  });

  test("a hand row SURVIVES a swipe of the tail slot (today's semantics, pinned)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId: variantA } = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: variantA, key: "sA", location: "take A" });
    await seedHandRow({ gameId, chatId, key: "h1", location: "the host's correction" });

    // The host swipes that slot to a fresh variant with its own snapshot. The hand row is not keyed to any
    // variant, so it is not rewound — the host's between-turns correction is not a take.
    const variantB = await addVariant(db, messageId, 1, "swipe B body");
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: variantB, key: "sB", location: "take B" });
    await db.update(messages).set({ selectedVariantId: variantB }).where(eq(messages.id, messageId));

    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the host's correction");
  });

  test("a FLOORED as-of (SET NULL) degrades the ORDER, never the state", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });
    await seedHandRow({ gameId, chatId, key: "h1", location: "the hall" });
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the hall");

    // The as-of slot is deleted (a D106 floor collapse / a message delete). SET NULL, never CASCADE: the old
    // anchor slot's CASCADE would have taken the STATE with it — the "never delete an anchor" footgun.
    await db.delete(messages).where(eq(messages.id, beat.messageId));
    const surviving = await db.select().from(rpgSnapshots).where(isNull(rpgSnapshots.variantId));
    expect(surviving).toHaveLength(1);
    expect(surviving[0]?.location).toBe("the hall");
    expect(surviving[0]?.asOfMessageId).toBeNull(); // orders before all history — the baseline posture
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("the hall");
  });
});

describe("the two-arm CHECK", () => {
  test("a half-shaped row (a message with no variant) is refused by the DB, not just by the writers", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await expect(insertSnapshot(db, { id: snapshotId("bad"), gameId, messageId: beat.messageId, variantId: null, createdAt: FROZEN_AT })).rejects.toThrow();
  });

  test("a TURN row carrying an as-of stamp is refused (a turn row IS its own position)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await expect(
      insertSnapshot(db, {
        id: snapshotId("bad2"),
        gameId,
        messageId: beat.messageId,
        variantId: beat.variantId,
        asOfMessageId: beat.messageId,
        createdAt: FROZEN_AT,
      }),
    ).rejects.toThrow();
  });

  test("the variant unique is PARTIAL — many hand rows coexist, one snapshot per variant still holds", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: beat.variantId, key: "s1", location: "the ford" });
    await seedHandRow({ gameId, chatId, key: "h1", location: "a" });
    await seedHandRow({ gameId, chatId, key: "h2", location: "b" });
    expect(await db.select().from(rpgSnapshots).where(isNull(rpgSnapshots.variantId))).toHaveLength(2);

    // The turn arm's UNIQUE is untouched: a second snapshot on the SAME variant is still refused.
    await expect(
      insertSnapshot(db, { id: snapshotId("dup"), gameId, messageId: beat.messageId, variantId: beat.variantId, createdAt: FROZEN_AT }),
    ).rejects.toThrow();
  });
});

// ── THE LINEAGE INVARIANT (#1380) — the named ENFORCER for a boundary the schema cannot express ─────────
// A snapshot's THREE references must meet at ONE chat: `game_id`'s game, `message_id`'s message and
// `variant_id`'s variant. SQLite cannot pair them (a CHECK cannot join; the FKs point at three tables), so
// the schema permits a cross-chat row and always will. A full verification pass found every writer SAFE
// for a stronger reason than validation — the turn, hand and fork arms take all three off ONE
// `findEngagedGame(chatId)` result or one fork's own id maps, so a mismatched tuple is UNCONSTRUCTIBLE,
// and the import arm's portable form carries INDICES that `remapRpg` can only resolve against the target
// chat's freshly-minted identity. But "today's code happens to derive" is code shape, not a boundary
// (constitution §2.3), and this arm had no negative test at all.
//
// THIS DOES NOT CLAIM THE DB REFUSES THE ROW — it does not, and pretending otherwise is the false clean
// the pin exists to prevent. It states WHERE the line actually is, so nobody deletes a derivation
// believing the schema has their back.
describe("the cross-chat lineage invariant", () => {
  test("a snapshot whose game and turn belong to DIFFERENT chats is STORABLE — derivation is the only belt", async () => {
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    const gameA = await seedGame(db, chatA, "ga");
    await seedGame(db, chatB, "gb");
    const slotA = await seedMessage(db, chatA, 1, { role: "assistant" });
    const slotB = await seedMessage(db, chatB, 1, { role: "assistant" });

    // Room A's game anchored to room B's turn. Every FK resolves, so the write SUCCEEDS.
    await insertSnapshot(db, { id: snapshotId("cross"), gameId: gameA, messageId: slotB.messageId, variantId: slotB.variantId, createdAt: FROZEN_AT });
    const stored = (
      await db
        .select()
        .from(rpgSnapshots)
        .where(eq(rpgSnapshots.id, snapshotId("cross")))
    )[0];
    expect(stored?.gameId).toBe(gameA);
    expect(stored?.variantId).toBe(slotB.variantId);
    expect(stored?.messageId).not.toBe(slotA.messageId);

    // THE DAY a constraint lands (a trigger, or a composite FK via a unique key on `messages(id, chat_id)`)
    // this goes red and is rewritten as a refusal — on purpose. Until then the honest statement is:
    // incoherent is storable, and the writers are what keep it unreached.
  });
});
