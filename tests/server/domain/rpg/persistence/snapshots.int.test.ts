// persistence/snapshots — the 4-rung resolution ladder + clone-forward + committed lifecycle (rpg-design/05
// §2.4). .int: real libSQL, real FK enforcement over messages/message_variants/rpg_snapshots. The ladder is
// the swipe-rewind mechanism's core — each rung is exercised in isolation and in fall-through order.

import type { Db } from "@orb/db";
import { rpgSnapshots } from "@orb/db";
import type { MessageVariantId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  commitSnapshotForVariant,
  findSnapshotByVariant,
  insertSnapshot,
  resolveSnapshotForTurn,
  writeStagedSnapshot,
} from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { freshDb } from "../../../../support/db";
import { addVariant, emptyState, expect, FROZEN_AT, seedChat, seedGame, seedMessage, snapshotId, target, test } from "../_support";

const CORRUPT_TABLE_RE = /rpg_snapshots/;

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

describe("the 4-rung resolution ladder", () => {
  test("rung 1 — regen/swipe resolves the target message's CURRENTLY-selected sibling (≠ the new variant)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId, key: "s1", location: "throne-room" });
    // A new (excluded) variant is being generated for message 1; the base must be the current sibling, not it.
    const newVariant = await addVariant(db, messageId, 1, "regen body");

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId }, { regenMessageId: messageId, excludeVariantId: newVariant });
    expect(base?.location).toBe("throne-room");
    expect(base?.variantId).toBe(variantId);
  });

  test("rung 2 — a fresh turn resolves the last VISIBLE assistant slot's selected-variant snapshot", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const first = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: first.variantId, key: "s1", location: "old-room" });
    const second = await seedMessage(db, chatId, 2, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: second.variantId, key: "s2", location: "new-room" });

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base?.location).toBe("new-room");
  });

  test("rung 2 skips an excludedFromPrompt assistant slot", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const visible = await seedMessage(db, chatId, 1, { role: "assistant" });
    await seedSnapshot({ gameId, chatId, seq: 1, variantId: visible.variantId, key: "s1", location: "kept-room" });
    const excluded = await seedMessage(db, chatId, 2, { role: "assistant", excludedFromPrompt: true });
    await seedSnapshot({ gameId, chatId, seq: 2, variantId: excluded.variantId, key: "s2", location: "hidden-room" });

    const base = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(base?.location).toBe("kept-room");
  });

  test("rung 3 — no visible assistant slot ⇒ latest COMMITTED by createdAt", async () => {
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

  test("rung 4 — no committed snapshot ⇒ latest ANY (uncommitted)", async () => {
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

describe("clone-forward + the committed lifecycle", () => {
  test("writeStagedSnapshot clones ALL state onto the committed variant, born committed=0", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

    const state = { ...emptyState(), location: "forwarded", quests: [], recentEvents: ["a beat"] };
    // A valid state writes — `undefined` only on a contract-INVALID state (the F1 structural backstop).
    const written = await writeStagedSnapshot(db, state, target({ gameId, chatId, seq: 1, variantId, key: "fwd" }));
    expect(written?.location).toBe("forwarded");
    expect(written?.recentEvents).toEqual(["a beat"]);
    expect(written?.committed).toBe(0);

    // onUserCommit locks it in (0 → 1).
    await commitSnapshotForVariant(db, variantId);
    const reread = await findSnapshotByVariant(db, variantId);
    expect(reread?.committed).toBe(1);
  });

  test("fieldLocks carry forward on the staged write (tools never author locks)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    const state = { ...emptyState(), location: "x", fieldLocks: { location: true as const } };

    const written = await writeStagedSnapshot(db, state, target({ gameId, chatId, seq: 1, variantId, key: "fwd" }));
    expect(written?.fieldLocks).toEqual({ location: true });
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
  test("writeStagedSnapshot REFUSES a contract-invalid state (returns undefined, commits nothing)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
    // A `pools[].max = 0` state violates the contract belt (`pools[].max >= 1`) — parse-on-read would throw
    // AFTER the insert commits. The backstop must refuse it at the write boundary, BEFORE the durable insert.
    const invalid = {
      ...emptyState(),
      actorState: [
        {
          actorRef: { kind: "cast" as const, castKey: "Broken" },
          hp: null,
          pools: [{ name: "x", value: 0, max: 0 }],
          conditions: [],
          inventory: [],
          wallet: [],
          status: "",
        },
      ],
    };

    const written = await writeStagedSnapshot(db, invalid, target({ gameId, chatId, seq: 1, variantId, key: "bad" }));

    expect(written).toBeUndefined(); // refused
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
          actorRef: { kind: "cast" as const, castKey: "Ok" },
          hp: null,
          pools: [{ name: "mana", value: 0, max: 1 }],
          conditions: [],
          inventory: [],
          wallet: [],
          status: "",
        },
      ],
    };

    const written = await writeStagedSnapshot(db, valid, target({ gameId, chatId, seq: 1, variantId, key: "ok" }));
    expect(written?.actorState?.[0]?.pools).toEqual([{ name: "mana", value: 0, max: 1 }]);
  });
});
