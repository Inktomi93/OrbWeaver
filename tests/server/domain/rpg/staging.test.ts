// staging — the Option-A accumulator (rpg-design/05 §2.4). Pure unit (in-memory singleton, no db).
// Proves: read-through (tool 2 sees tool 1, incl. a quest created then flipped in one turn), take/flush,
// abort clears EVERYTHING (the dead-turn-never-flushes pin), and two concurrent turns on one chat do NOT
// share a bucket (the ChatTurnId keying pin — the load-bearing correctness invariant).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createRpgStagingStore } from "../../../../packages/server/src/domain/rpg/staging";
import { emptyState, expect, quest, questId, test } from "./_support";

const TURN_A = castId<ChatTurnId>("chat_turn_a");
const TURN_B = castId<ChatTurnId>("chat_turn_b");

function baseAt(location: string): RpgSnapshotState {
  return { ...emptyState(), location };
}

describe("read-through", () => {
  test("tool 2 sees tool 1's staged mutation over the base", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, baseAt("start"));
    store.stage(TURN_A, { location: "tool-1-set" });
    // Tool 2 resolves the CURRENT effective state (ensure is idempotent — the overlay survives).
    const seenByTool2 = store.ensure(TURN_A, baseAt("start"));
    expect(seenByTool2.location).toBe("tool-1-set");
  });

  test("a quest created by tool 1 is visible to tool 2's flip within one turn", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, emptyState());
    // Tool 1 creates a quest (the quests array is the swipe-consistent quest plane).
    store.stage(TURN_A, { quests: [{ id: "questX", name: "find the key", status: "active", description: "", objectives: [] }] });
    // Tool 2 flips it complete — it must see tool 1's quest in the effective state.
    const afterCreate = store.peek(TURN_A);
    expect(afterCreate?.quests).toHaveLength(1);
    store.stage(TURN_A, { quests: [{ id: "questX", name: "find the key", status: "completed", description: "", objectives: [] }] });
    const afterFlip = store.peek(TURN_A);
    expect(afterFlip?.quests[0]?.status).toBe("completed");
  });

  test("ensure is idempotent per turn — a second base does NOT reseed", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, baseAt("first-base"));
    const again = store.ensure(TURN_A, baseAt("DIFFERENT-base"));
    expect(again.location).toBe("first-base");
  });
});

describe("take / flush at turn-completed", () => {
  test("take returns the accumulated state + journal and DELETES the bucket (flush exactly once)", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, baseAt("s"));
    store.stage(TURN_A, { location: "final" });
    store.stageJournal(TURN_A, { type: "event", title: "a beat", content: "it happened" });

    const flush = store.take(TURN_A);
    if (!flush) {
      throw new Error("expected a flush");
    }
    expect(flush.state.location).toBe("final");
    expect(flush.journal).toEqual([{ type: "event", title: "a beat", content: "it happened" }]);
    // The bucket is gone — a second take is a no-op (undefined).
    expect(store.take(TURN_A)).toBeUndefined();
  });

  test("a turn that staged nothing takes undefined (no snapshot to write)", () => {
    const store = createRpgStagingStore();
    expect(store.take(TURN_A)).toBeUndefined();
  });
});

describe("abort clears EVERYTHING (the dead-turn-never-flushes pin)", () => {
  test("clear discards the bucket — a later take finds nothing", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, baseAt("s"));
    store.stage(TURN_A, { location: "dead-write" });
    store.stageJournal(TURN_A, { type: "note", title: "dead", content: "aborted" });

    store.clear(TURN_A);
    expect(store.peek(TURN_A)).toBeUndefined();
    expect(store.take(TURN_A)).toBeUndefined();
  });

  test("a cleared turn does not bleed into the next turn on the same chat", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, baseAt("s"));
    store.stage(TURN_A, { location: "aborted-turn" });
    store.clear(TURN_A);
    // A fresh turn seeds from ITS base, never the aborted turn's overlay.
    const fresh = store.ensure(TURN_B, baseAt("fresh-base"));
    expect(fresh.location).toBe("fresh-base");
  });
});

describe("the ChatTurnId keying pin", () => {
  test("two concurrent turns on ONE chat do NOT share a bucket", () => {
    const store = createRpgStagingStore();
    // A locked `send` and a lock-free `generate` run concurrently on the same chat, different turnIds.
    store.ensure(TURN_A, baseAt("base"));
    store.ensure(TURN_B, baseAt("base"));
    store.stage(TURN_A, { location: "from-send" });
    store.stage(TURN_B, { location: "from-generate" });

    expect(store.peek(TURN_A)?.location).toBe("from-send");
    expect(store.peek(TURN_B)?.location).toBe("from-generate");
    // Taking one leaves the other intact.
    store.take(TURN_A);
    expect(store.peek(TURN_B)?.location).toBe("from-generate");
  });
});

describe("locks honored during staging", () => {
  test("a staged tool write on a locked path is dropped (the base fieldLocks ride the state)", () => {
    const store = createRpgStagingStore();
    store.ensure(TURN_A, { ...emptyState(), location: "hand-set", fieldLocks: { location: true } });
    store.stage(TURN_A, { location: "tool-tried" });
    expect(store.peek(TURN_A)?.location).toBe("hand-set");
  });

  test("a per-quest element lock is honored through the staging path (the W1b tool-write path)", () => {
    // The accumulator's stage() runs the SAME applyLockedPatch a tool write hits — prove the element-lock
    // grammar bites end-to-end here, not just in the pure merge unit.
    const store = createRpgStagingStore();
    const locked = quest("main");
    store.ensure(TURN_A, { ...emptyState(), quests: [locked, quest("side")], fieldLocks: { [`quests.${locked.id}`]: true } });
    // A tool completes BOTH quests; the locked one must stay active.
    store.stage(TURN_A, { quests: [quest("main", { status: "completed" }), quest("side", { status: "completed" })] });
    const quests = store.peek(TURN_A)?.quests ?? [];
    expect(quests.find((q) => q.id === locked.id)?.status).toBe("active");
    expect(quests.find((q) => q.id === questId("side"))?.status).toBe("completed");
  });
});
