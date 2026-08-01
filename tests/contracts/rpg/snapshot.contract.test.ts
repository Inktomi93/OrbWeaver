// @orb/contracts/rpg/snapshot — the swipe-volatile plane shapes (§2.4-2.5). Pins the quests-in-snapshot
// shape (ratification #1: quests fold INTO the snapshot state), the objective `n/m` shape, present-cast,
// the full snapshot state's collection defaults + nullable ambient, and (R1) the HAND-PATCH plane split —
// `actorState` is op-shaped, so it must be absent from the image door's vocabulary — plus the one actor
// lock-path grammar the server stamp and the panel pin both read.

import {
  RPG_HAND_PATCH_PLANES,
  RPG_OP_SHAPED_PLANES,
  RPG_SNAPSHOT_STATE_PLANES,
  rpgActorLockBase,
  rpgFieldLocksSchema,
  rpgPlotSchema,
  rpgPresentCharacterSchema,
  rpgQuestSchema,
  rpgSnapshotStateSchema,
} from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

test("a quest is a stable-id object with status + n/m objectives (the snapshot-resident shape)", () => {
  const quest = rpgQuestSchema.parse({
    id: "q1",
    name: "Find the amulet",
    status: "active",
    objectives: [
      { id: "o1", text: "Search the crypt", completed: true },
      { id: "o2", text: "Defeat the warden" },
    ],
  });
  expect(quest.status).toBe("active");
  expect(quest.objectives).toHaveLength(2);
  expect(quest.objectives[1]?.completed).toBe(false);
});

test("quest status is bounded to the tuple", () => {
  expect(rpgQuestSchema.safeParse({ id: "q", name: "x", status: "abandoned" }).success).toBe(false);
});

test("the snapshot state folds quests INSIDE it and defaults every collection (ratification #1)", () => {
  const state = rpgSnapshotStateSchema.parse({ clock: null, calendarDate: null, weather: null, fieldLocks: null });
  expect(state.quests).toEqual([]);
  expect(state.presentCharacters).toEqual([]);
  expect(state.actorState).toEqual([]);
  expect(state.recentEvents).toEqual([]);
  expect(state.trackerValues).toEqual({});
  expect(state.location).toBe("");
  expect(state.clock).toBeNull();
});

test("the GAME-subject tracker values live on the snapshot, keyed by tracker key", () => {
  // The tracked-field unification: `widgetValues` (keyed by widget LABEL, defs in their own table) is gone.
  const state = rpgSnapshotStateSchema.parse({
    clock: null,
    calendarDate: null,
    weather: null,
    fieldLocks: null,
    trackerValues: { alarm: { value: 35, max: 100 } },
  });
  // A game-subject tracker may carry its own ceiling override exactly like an actor's (one value shape).
  expect(state.trackerValues["alarm"]).toEqual({ value: 35, items: null, max: 100 });
});

test("present character defaults its display fields and carries NO tracked-value store", () => {
  const cast = rpgPresentCharacterSchema.parse({ key: "elder", name: "The Elder" });
  expect(cast.emoji).toBe("");
  expect(cast.mood).toBe("");
  // A cast member's tracked values ride the per-actor `actorState` plane under `cast:<key>` — ONE value
  // home for every actor, so the opaque `customFields` string record on the cast row is gone.
  expect("customFields" in cast).toBe(false);
});

test("fieldLocks is a presence-key record of true", () => {
  expect(rpgFieldLocksSchema.safeParse({ "quests.q1": true, location: true }).success).toBe(true);
  expect(rpgFieldLocksSchema.safeParse({ "quests.q1": false }).success).toBe(false);
});

// ── P5 — the snapshot-resident plot plane ──
test("plot defaults null (pre-P5 self-heal) and parses the {act,title,acts} shape; act floors at 1", () => {
  const healed = rpgSnapshotStateSchema.parse({ clock: null, calendarDate: null, weather: null, fieldLocks: null });
  expect(healed.plot).toBeNull();
  const state = rpgSnapshotStateSchema.parse({
    clock: null,
    calendarDate: null,
    weather: null,
    fieldLocks: null,
    plot: { act: 2, title: "The Bone Key", acts: [{ title: "Arrival" }, { title: "Descent", summary: "down" }] },
  });
  expect(state.plot).toEqual({
    act: 2,
    title: "The Bone Key",
    acts: [
      { title: "Arrival", summary: "" },
      { title: "Descent", summary: "down" },
    ],
  });
  expect(rpgPlotSchema.safeParse({ act: 0 }).success).toBe(false);
});

// ── R1: the plane split + the ONE actor lock-path grammar ─────────────────────────────────────────────────

test("the hand-patch planes are the state planes MINUS the op-shaped ones (derived, never a second list)", () => {
  expect(RPG_OP_SHAPED_PLANES.has("actorState")).toBe(true);
  expect(RPG_HAND_PATCH_PLANES.has("actorState")).toBe(false);
  // Everything else a hand can honestly author whole is still there.
  for (const plane of ["location", "clock", "weather", "calendarDate", "presentCharacters", "recentEvents", "trackerValues", "quests", "plot"]) {
    expect(RPG_HAND_PATCH_PLANES.has(plane)).toBe(true);
  }
  // Locks are METADATA, never a patch key — on either set.
  expect(RPG_SNAPSHOT_STATE_PLANES.has("fieldLocks")).toBe(false);
  expect(RPG_HAND_PATCH_PLANES.has("fieldLocks")).toBe(false);
});

test("rpgActorLockBase is the ONE lock-path grammar both the server stamp and the panel pin read", () => {
  expect(rpgActorLockBase({ kind: "cast", castKey: "mira" })).toBe("actorState.cast:mira");
  const userId = newId<UserId>();
  expect(rpgActorLockBase({ kind: "user", userId })).toBe(`actorState.user:${userId}`);
});
