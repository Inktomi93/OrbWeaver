// substrate/actor-ops — the PURE op applier behind `rpg.patchActor` (the actor-state review §5 R1). The verb
// suite drives these through the db; this pins the arithmetic + the lock-path derivation directly, where the
// edge arms are cheap to state: an omitted datum KEEPS (never blanks), a `null` datum CLEARS, an op naming a
// datum the actor doesn't carry REFUSES as data, and each op earns exactly one fine lock path.

import type { RpgActorEntry, RpgActorOp } from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import { applyActorOps, emptyActorEntry } from "../../../../../packages/server/src/domain/rpg/substrate/actor-ops.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const MIRA = { kind: "npc", npcKey: "mira" } as const;
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
  const base = seeded();
  const out = apply(base, [
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
    "actorState.npc:mira.volatile.status",
    "actorState.npc:mira.volatile.trackerValues.trust",
    // The two condition ops share ONE plane-level pin — the panel's Release affordance for this plane is the
    // section, so a per-element lock here would be a pin the host can see but cannot release.
    "actorState.npc:mira.volatile.conditions",
    // …and INVENTORY is the plane that grew that per-element affordance (#78), so its pin is per ITEM, per
    // CLAIMED field. `{ name: "Rope" }` claims the name and nothing else: the story keeps quantity/location.
    `actorState.npc:mira.volatile.inventory.${out.ok ? out.actor.volatile.inventory[1]?.id : ""}.name`,
    "actorState.npc:mira.volatile.wallet.gold",
    "actorState.npc:mira.identity.mood",
    "actorState.npc:mira.identity.relationship",
  ]);
  expect(out.ok && out.lockReleases).toEqual([]);
});

// ── #78: the pack's pins are per ITEM, per CLAIMED FIELD, and a drop hands them back ───────────────────────

test("#78: an inventory op pins ONLY the fields the hand authored, addressed at the item it touched", () => {
  const added = apply(emptyActorEntry(MIRA), [{ op: "addItem", item: { name: "Rope", location: "pack" } }]);
  const addedId = (added.ok && added.actor.volatile.inventory[0]?.id) || "";
  // `quantity`/`description`/`type` came from the SERVER's defaults, not from the hand — unpinned by design,
  // so a story that counts the coils or says where they ended up still lands.
  expect(added.ok && added.lockPaths).toEqual([
    `actorState.npc:mira.volatile.inventory.${addedId}.name`,
    `actorState.npc:mira.volatile.inventory.${addedId}.location`,
  ]);

  const patched = apply(seeded(), [{ op: "patchItem", id: "itm-key", patch: { quantity: 3 } }]);
  expect(patched.ok && patched.lockPaths).toEqual(["actorState.npc:mira.volatile.inventory.itm-key.quantity"]);
});

test("#78: a REMOVAL pins nothing and releases the dropped item's prefix (the symmetric grammar)", () => {
  const out = apply(seeded(), [{ op: "removeItem", id: "itm-key" }]);
  expect(out.ok && out.lockPaths).toEqual([]);
  expect(out.ok && out.lockReleases).toEqual(["actorState.npc:mira.volatile.inventory.itm-key"]);
});

test("#78: an add-then-drop batch releases the pin it just stamped (the verb applies `clear` after `lock`)", () => {
  // A PINNED mint, so the batch's second op can name the id its first op will produce (a real caller reads it
  // off the panel a beat later; here the point is the pair of lists the applier hands the verb).
  const id = "item_batch";
  const out = applyActorOps(
    emptyActorEntry(MIRA),
    [
      { op: "addItem", item: { name: "Rope" } },
      { op: "removeItem", id },
    ],
    () => id,
  );
  expect(out.ok && out.actor.volatile.inventory).toEqual([]);
  expect(out.ok && out.lockPaths).toEqual([`actorState.npc:mira.volatile.inventory.${id}.name`]);
  expect(out.ok && out.lockReleases).toEqual([`actorState.npc:mira.volatile.inventory.${id}`]);
});

// ── R2: the identity half ─────────────────────────────────────────────────────────────────────────────────

test("an npc is BORN with an identity (slug-named); a participant actor is born without one", () => {
  // An npc IS an identity-bearing person by construction — born without one, the very first
  // `presentUpsert`/`setIdentityText` would have nothing to write onto. A participant's name is chat's
  // and her standing prose is the sheet's, which is what makes the refusal below meaningful.
  expect(emptyActorEntry(MIRA).identity).toEqual({ name: "mira", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } });
  expect(emptyActorEntry({ kind: "user", userId: USER_ID }).identity).toBeUndefined();
});

test("an identity op on a PARTICIPANT actor REFUSES as data (one name home per person, never two)", () => {
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
