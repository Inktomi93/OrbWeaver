// substrate/actor-ops — the PURE op applier behind `rpg.patchActor` (the actor-state review §5 R1). The verb
// suite drives these through the db; this pins the arithmetic + the lock-path derivation directly, where the
// edge arms are cheap to state: an omitted datum KEEPS (never blanks), a `null` datum CLEARS, an op naming a
// datum the actor doesn't carry REFUSES as data, and each op earns exactly one fine lock path.

import type { RpgActorEntry, RpgActorOp } from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { applyActorOps, emptyActorEntry } from "../../../../../packages/server/src/domain/rpg/substrate/actor-ops.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const MIRA = { kind: "cast", castKey: "mira" } as const;
const USER_ID = newId<UserId>();
const MINTED_ITEM_ID_RE = /^item_/u;
let itemSeq = 0;
function mint(): string {
  itemSeq += 1;
  return `item_${itemSeq}`;
}

function apply(base: RpgActorEntry, ops: readonly RpgActorOp[]): ReturnType<typeof applyActorOps> {
  return applyActorOps(base, ops, mint);
}

/** A row that already carries something in every keyed sub-plane (the "not a fresh actor" base). */
function seeded(): RpgActorEntry {
  return {
    ...emptyActorEntry(MIRA),
    volatile: {
      trackerValues: { trust: { value: 4, items: null, max: 6 } },
      conditions: [{ name: "Chilled", stat: null, modifier: 2, turnsLeft: null }],
      inventory: [{ id: "itm-key", name: "Bone key", description: "cold", quantity: 1, location: "pocket", type: "" }],
      wallet: [{ name: "gold", amount: 45 }],
      status: "wary",
    },
  };
}

test("setTracker KEEPS the datums it does not name and CLEARS the ones it nulls", () => {
  const raised = apply(seeded(), [{ op: "setTracker", key: "trust", value: { value: 7 } }]);
  expect(raised.ok && raised.actor.volatile.trackerValues["trust"]).toStrictEqual({ value: 7, items: null, max: 6 });

  // `max: null` is the honest CLEAR of a per-carrier ceiling override, NOT "no max supplied".
  const cleared = apply(seeded(), [{ op: "setTracker", key: "trust", value: { max: null } }]);
  expect(cleared.ok && cleared.actor.volatile.trackerValues["trust"]).toStrictEqual({ value: 4, items: null, max: null });
});

test("addCondition is a NAME-keyed upsert (re-adding a standing condition re-authors it, never duplicates)", () => {
  const out = apply(seeded(), [{ op: "addCondition", condition: { name: "Chilled", modifier: 5 } }]);
  expect(out.ok && out.actor.volatile.conditions).toEqual([{ name: "Chilled", stat: null, modifier: 5, turnsLeft: null }]);
});

test("addItem mints the id server-side and fills the item's defaults", () => {
  const out = apply(emptyActorEntry(MIRA), [{ op: "addItem", item: { name: "Rope" } }]);
  expect(out.ok && out.actor.volatile.inventory).toHaveLength(1);
  expect(out.ok && out.actor.volatile.inventory[0]).toMatchObject({ name: "Rope", quantity: 1, description: "", location: "", type: "" });
  expect(out.ok && out.actor.volatile.inventory[0]?.id).toMatch(MINTED_ITEM_ID_RE);
});

test("patchItem keeps the fields it does not name — including a deliberate EMPTY STRING", () => {
  const out = apply(seeded(), [{ op: "patchItem", id: "itm-key", patch: { description: "", quantity: 3 } }]);
  expect(out.ok && out.actor.volatile.inventory[0]).toMatchObject({ name: "Bone key", description: "", quantity: 3, location: "pocket" });
});

test("setWalletAmount UPSERTS — an absent slot is created, an existing one is set (not added to)", () => {
  const created = apply(seeded(), [{ op: "setWalletAmount", name: "silver", amount: 7 }]);
  expect(created.ok && created.actor.volatile.wallet).toEqual([
    { name: "gold", amount: 45 },
    { name: "silver", amount: 7 },
  ]);
  const set = apply(seeded(), [{ op: "setWalletAmount", name: "gold", amount: 2 }]);
  expect(set.ok && set.actor.volatile.wallet).toEqual([{ name: "gold", amount: 2 }]);
});

test("an op naming a datum the actor does not carry REFUSES with a reason naming it (never a silent no-op)", () => {
  expect(apply(seeded(), [{ op: "removeItem", id: "itm-ghost" }])).toStrictEqual({ ok: false, reason: 'no inventory item "itm-ghost" on this actor' });
  expect(apply(seeded(), [{ op: "removeCondition", name: "Burning" }])).toStrictEqual({ ok: false, reason: 'no condition named "Burning" on this actor' });
  expect(apply(seeded(), [{ op: "patchItem", id: "itm-ghost", patch: { name: "x" } }]).ok).toBe(false);
});

test("each op earns ONE fine lock path under its HALF's base, de-duplicated in first-touch order", () => {
  const out = apply(seeded(), [
    { op: "setStatus", status: "calm" },
    { op: "setTracker", key: "trust", value: { value: 1 } },
    { op: "addCondition", condition: { name: "Burning" } },
    { op: "removeCondition", name: "Burning" },
    { op: "addItem", item: { name: "Rope" } },
    { op: "setWalletAmount", name: "gold", amount: 1 },
    { op: "setIdentityText", field: "mood", text: "wary" },
    { op: "setRelationship", relationship: { kind: "enemy", label: "" } },
  ]);
  // The `volatile`/`identity` segment is a REAL path segment (the merge walks the stored JSON): a path that
  // skipped it would pin nothing at all. R2's identity pins are also FINE — pinning one NPC's mood used to
  // require the plane-wide `presentCharacters` lock, which froze the entire cast.
  expect(out.ok && out.lockPaths).toEqual([
    "actorState.cast:mira.volatile.status",
    "actorState.cast:mira.volatile.trackerValues.trust",
    // The two condition ops share ONE plane-level pin — the panel's Release affordance for this plane is the
    // section, so a per-element lock here would be a pin the host can see but cannot release.
    "actorState.cast:mira.volatile.conditions",
    "actorState.cast:mira.volatile.inventory",
    "actorState.cast:mira.volatile.wallet.gold",
    "actorState.cast:mira.identity.mood",
    "actorState.cast:mira.identity.relationship",
  ]);
});

// ── R2: the identity half ─────────────────────────────────────────────────────────────────────────────────

test("a cast actor is BORN with an identity (slug-named); a roster actor is born without one", () => {
  // A cast actor IS an identity-bearing person by construction — born without one, the very first
  // `presentUpsert`/`setIdentityText` would have nothing to write onto. A roster member's name is the chat
  // roster's and her standing prose is the sheet's, which is what makes the refusal below meaningful.
  expect(emptyActorEntry(MIRA).identity).toEqual({ name: "mira", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } });
  expect(emptyActorEntry({ kind: "user", userId: USER_ID }).identity).toBeUndefined();
});

test("an identity op on a ROSTER actor REFUSES as data (one name home per person, never two)", () => {
  const out = apply(emptyActorEntry({ kind: "user", userId: USER_ID }), [{ op: "setIdentityText", field: "mood", text: "wary" }]);
  expect(out.ok).toBe(false);
  expect(!out.ok && out.reason).toContain("carries no identity of its own");
});

test("a RENAME writes the display name and leaves the slug KEY alone (what R2's slug exists for)", () => {
  const out = apply(seeded(), [{ op: "setIdentityText", field: "name", text: "Mira Solheart" }]);
  expect(out.ok && out.actor.identity?.name).toBe("Mira Solheart");
  expect(out.ok && out.actor.actorRef).toEqual(MIRA);
  // A blank rename is REFUSED — a nameless card and an unaddressable reminder line are not a valid state.
  expect(apply(seeded(), [{ op: "setIdentityText", field: "name", text: "   " }]).ok).toBe(false);
});

test("setRelationship clears the label on a non-custom kind (the same rule the story's applier follows)", () => {
  const custom = apply(seeded(), [{ op: "setRelationship", relationship: { kind: "custom", label: "vassal" } }]);
  expect(custom.ok && custom.actor.identity?.relationship).toEqual({ kind: "custom", label: "vassal" });
  const plain = apply(seeded(), [{ op: "setRelationship", relationship: { kind: "enemy", label: "vassal" } }]);
  expect(plain.ok && plain.actor.identity?.relationship).toEqual({ kind: "enemy", label: "" });
});
