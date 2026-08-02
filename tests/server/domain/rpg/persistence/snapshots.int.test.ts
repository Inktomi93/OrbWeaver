// persistence/snapshots — the 4-rung resolution ladder + clone-forward + committed lifecycle (rpg-design/05
// §2.4). .int: real libSQL, real FK enforcement over messages/message_variants/rpg_snapshots. The ladder is
// the swipe-rewind mechanism's core — each rung is exercised in isolation and in fall-through order.

import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { MessageVariantId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { snapshotRowToState } from "../../../../../packages/server/src/domain/rpg/contract/service";
import {
  commitSnapshotForVariant,
  findSnapshotByVariant,
  insertSnapshot,
  resolveSnapshotBeforeSlot,
  resolveSnapshotForTurn,
  writeStagedSnapshot,
} from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../support/db";
import { addVariant, emptyState, expect, FROZEN_AT, seedChat, seedGame, seedMessage, snapshotId, target, test } from "../_support";

const CORRUPT_TABLE_RE = /rpg_snapshots/;
const POOLS_MAX_RE = /pools|max/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Insert a committed snapshot keyed to a variant, carrying a marker location. */
async function seedSnapshot(opts: {
  gameId: string;
  chatId: string;
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
          actorRef: { kind: "cast" as const, castKey: "broken" },
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
          actorRef: { kind: "cast" as const, castKey: "ok" },
          volatile: { trackerValues: { mana: { value: 0, items: null, max: null } }, conditions: [], inventory: [], wallet: [], status: "" },
        },
      ],
    };

    const written = await writeStagedSnapshot(db, valid, target({ gameId, chatId, seq: 1, variantId, key: "ok" }));
    expect(written.ok ? written.row.actorState?.[0]?.volatile.trackerValues : undefined).toEqual({ mana: { value: 0, items: null, max: null } });
  });
});
