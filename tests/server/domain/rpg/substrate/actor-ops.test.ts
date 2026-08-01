// substrate/actor-ops — the PURE op applier behind `rpg.patchActor` (the actor-state review §5 R1). The verb
// suite drives these through the db; this pins the arithmetic + the lock-path derivation directly, where the
// edge arms are cheap to state: an omitted datum KEEPS (never blanks), a `null` datum CLEARS, an op naming a
// datum the actor doesn't carry REFUSES as data, and each op earns exactly one fine lock path.

import type { RpgActorOp, RpgActorVolatile } from "@orb/contracts/rpg";
import { applyActorOps, emptyActorVolatile } from "../../../../../packages/server/src/domain/rpg/substrate/actor-ops";
import { expect, test } from "../../../../support/fixtures";

const MIRA = { kind: "cast", castKey: "mira" } as const;
const MINTED_ITEM_ID_RE = /^item_/u;
let itemSeq = 0;
function mint(): string {
  itemSeq += 1;
  return `item_${itemSeq}`;
}

function apply(base: RpgActorVolatile, ops: readonly RpgActorOp[]): ReturnType<typeof applyActorOps> {
  return applyActorOps(base, ops, mint);
}

/** A row that already carries something in every keyed sub-plane (the "not a fresh actor" base). */
function seeded(): RpgActorVolatile {
  return {
    ...emptyActorVolatile(MIRA),
    trackerValues: { trust: { value: 4, items: null, max: 6 } },
    conditions: [{ name: "Chilled", stat: null, modifier: 2, turnsLeft: null }],
    inventory: [{ id: "itm-key", name: "Bone key", description: "cold", quantity: 1, location: "pocket", type: "" }],
    wallet: [{ name: "gold", amount: 45 }],
    status: "wary",
  };
}

test("setTracker KEEPS the datums it does not name and CLEARS the ones it nulls", () => {
  const raised = apply(seeded(), [{ op: "setTracker", key: "trust", value: { value: 7 } }]);
  expect(raised.ok && raised.actor.trackerValues["trust"]).toStrictEqual({ value: 7, items: null, max: 6 });

  // `max: null` is the honest CLEAR of a per-carrier ceiling override, NOT "no max supplied".
  const cleared = apply(seeded(), [{ op: "setTracker", key: "trust", value: { max: null } }]);
  expect(cleared.ok && cleared.actor.trackerValues["trust"]).toStrictEqual({ value: 4, items: null, max: null });
});

test("addCondition is a NAME-keyed upsert (re-adding a standing condition re-authors it, never duplicates)", () => {
  const out = apply(seeded(), [{ op: "addCondition", condition: { name: "Chilled", modifier: 5 } }]);
  expect(out.ok && out.actor.conditions).toEqual([{ name: "Chilled", stat: null, modifier: 5, turnsLeft: null }]);
});

test("addItem mints the id server-side and fills the item's defaults", () => {
  const out = apply(emptyActorVolatile(MIRA), [{ op: "addItem", item: { name: "Rope" } }]);
  expect(out.ok && out.actor.inventory).toHaveLength(1);
  expect(out.ok && out.actor.inventory[0]).toMatchObject({ name: "Rope", quantity: 1, description: "", location: "", type: "" });
  expect(out.ok && out.actor.inventory[0]?.id).toMatch(MINTED_ITEM_ID_RE);
});

test("patchItem keeps the fields it does not name — including a deliberate EMPTY STRING", () => {
  const out = apply(seeded(), [{ op: "patchItem", id: "itm-key", patch: { description: "", quantity: 3 } }]);
  expect(out.ok && out.actor.inventory[0]).toMatchObject({ name: "Bone key", description: "", quantity: 3, location: "pocket" });
});

test("setWalletAmount UPSERTS — an absent slot is created, an existing one is set (not added to)", () => {
  const created = apply(seeded(), [{ op: "setWalletAmount", name: "silver", amount: 7 }]);
  expect(created.ok && created.actor.wallet).toEqual([
    { name: "gold", amount: 45 },
    { name: "silver", amount: 7 },
  ]);
  const set = apply(seeded(), [{ op: "setWalletAmount", name: "gold", amount: 2 }]);
  expect(set.ok && set.actor.wallet).toEqual([{ name: "gold", amount: 2 }]);
});

test("an op naming a datum the actor does not carry REFUSES with a reason naming it (never a silent no-op)", () => {
  expect(apply(seeded(), [{ op: "removeItem", id: "itm-ghost" }])).toStrictEqual({ ok: false, reason: 'no inventory item "itm-ghost" on this actor' });
  expect(apply(seeded(), [{ op: "removeCondition", name: "Burning" }])).toStrictEqual({ ok: false, reason: 'no condition named "Burning" on this actor' });
  expect(apply(seeded(), [{ op: "patchItem", id: "itm-ghost", patch: { name: "x" } }]).ok).toBe(false);
});

test("each op earns ONE fine lock path under the actor's base, de-duplicated in first-touch order", () => {
  const out = apply(seeded(), [
    { op: "setStatus", status: "calm" },
    { op: "setHp", hp: null },
    { op: "setTracker", key: "trust", value: { value: 1 } },
    { op: "addCondition", condition: { name: "Burning" } },
    { op: "removeCondition", name: "Burning" },
    { op: "addItem", item: { name: "Rope" } },
    { op: "setWalletAmount", name: "gold", amount: 1 },
  ]);
  expect(out.ok && out.lockPaths).toEqual([
    "actorState.cast:mira.status",
    "actorState.cast:mira.hp",
    "actorState.cast:mira.trackerValues.trust",
    // The two condition ops share ONE plane-level pin — the panel's Release affordance for this plane is the
    // section, so a per-element lock here would be a pin the host can see but cannot release.
    "actorState.cast:mira.conditions",
    "actorState.cast:mira.inventory",
    "actorState.cast:mira.wallet.gold",
  ]);
});
