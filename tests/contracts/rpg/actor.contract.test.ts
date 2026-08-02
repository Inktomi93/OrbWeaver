// @orb/contracts/rpg/actor — THE actor: the ref, the cast SLUG, the IDENTITY half and the VOLATILE half
// (§2.6 + the R2 one-row reshape) + the hand OP union. Pins: the three ref arms parse, `actorRefKey` projects
// each, the slug normalizes and the display name stays separate, an entry carries both halves (identity for
// `cast` only), the volatile defaults fill the collection fields, hp is GONE from the plane (R3 — health is an
// ordinary tracker), and every op arm carries only its own field's datum (the op vocabulary is the plane's
// write surface — an arm that grew a foreign field would be a second image contract creeping back in).

import {
  actorRefKey,
  RPG_ACTOR_IDENTITY_TEXT_FIELDS,
  RPG_ACTOR_OP_FIELDS,
  rpgActorEntrySchema,
  rpgActorIdentitySchema,
  rpgActorOpSchema,
  rpgActorRefSchema,
  rpgActorVolatileSchema,
  rpgCastSlug,
} from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

test("actor ref parses all three lite arms (character/user/cast)", () => {
  const characterId = mintTypeId(ID_PREFIX.character);
  const userId = newId<UserId>();
  expect(rpgActorRefSchema.safeParse({ kind: "character", characterId }).success).toBe(true);
  expect(rpgActorRefSchema.safeParse({ kind: "user", userId }).success).toBe(true);
  expect(rpgActorRefSchema.safeParse({ kind: "cast", castKey: "goblin-scout" }).success).toBe(true);
  expect(rpgActorRefSchema.safeParse({ kind: "npc", npcId: "x" }).success).toBe(false);
});

test("actorRefKey projects a stable distinct key per arm", () => {
  const characterId = mintTypeId(ID_PREFIX.character);
  expect(actorRefKey({ kind: "character", characterId })).toBe(`character:${characterId}`);
  expect(actorRefKey({ kind: "cast", castKey: "goblin" })).toBe("cast:goblin");
});

// ── the cast SLUG (R2 — the doc's "normalized-name key" claim made true) ──────────────────────────────────

test("rpgCastSlug folds every spelling of one name onto ONE key (the sibling-identity class)", () => {
  // The exact class the verbatim key allowed: case, spacing and punctuation variance minted separate actors
  // on any non-enforcing wire, each with its own state, each unreachable from the other's spelling.
  const canonical = rpgCastSlug("Sister Vesna");
  expect(canonical).toBe("sister-vesna");
  expect(rpgCastSlug("sister  vesna")).toBe(canonical);
  expect(rpgCastSlug("  Sister Vesna.  ")).toBe(canonical);
  expect(rpgCastSlug("SISTER-VESNA")).toBe(canonical);
});

test("a name with no slug-able character still yields a legal key (a ref key is min(1))", () => {
  // A refused write on an emoji-only name would be a worse answer than one stable bucket a host can rename.
  expect(rpgCastSlug("🔥🔥").length).toBeGreaterThan(0);
  expect(rpgCastSlug("   ").length).toBeGreaterThan(0);
});

test("the slug is IDEMPOTENT — which is what lets the wire use it as its own canonicality predicate", () => {
  for (const name of ["Sister Vesna", "  MARI!  ", "🔥🔥", "already-slugged"]) {
    expect(rpgCastSlug(rpgCastSlug(name))).toBe(rpgCastSlug(name));
  }
});

test("a NON-CANONICAL cast key is unrepresentable at the wire (prevent-at-schema, not refuse-downstream)", () => {
  // The hole this closes: a raw API caller `patchActor`-ing with `castKey: "Sister Vesna"` minted a SIBLING
  // row beside the model's `cast:sister-vesna` — a duplicate person in the panel, unreachable by every model
  // write (the appliers all resolve names through the slug), removable only by `dismissActor` with the same
  // raw key. The house pattern is prevent-at-schema (the R6 enum precedent, the stamped-id write boundary).
  for (const bad of ["Sister Vesna", "Mari", "sister vesna", "sister-vesna-", " mari"]) {
    expect(rpgActorRefSchema.safeParse({ kind: "cast", castKey: bad }).success, `"${bad}" must be refused`).toBe(false);
  }
  // …and every key the SLUG itself mints round-trips (the two are the same rule, so they cannot drift).
  for (const name of ["Sister Vesna", "  MARI!  ", "🔥🔥"]) {
    expect(rpgActorRefSchema.safeParse({ kind: "cast", castKey: rpgCastSlug(name) }).success).toBe(true);
  }
  // The roster arms are untouched — their keys are branded ids, not slugs.
  expect(rpgActorRefSchema.safeParse({ kind: "character", characterId: mintTypeId(ID_PREFIX.character) }).success).toBe(true);
});

// ── the actor ENTRY: two halves, one lifecycle ────────────────────────────────────────────────────────────

test("an entry parses with only its ref — the volatile half is born WHOLE (no partial rows)", () => {
  const parsed = rpgActorEntrySchema.parse({ actorRef: { kind: "cast", castKey: "npc" } });
  expect(parsed.identity).toBeUndefined();
  expect(parsed.volatile).toEqual({ trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" });
});

test("hp is NOT a volatile field (R3 — health is an ordinary meter tracker, not a schema privilege)", () => {
  expect(Object.keys(rpgActorVolatileSchema.shape)).not.toContain("hp");
  // The old dual-max home is gone with it: a ceiling lives ONCE, on the tracker value.
  const parsed = rpgActorVolatileSchema.parse({ trackerValues: { hp: { value: 9, max: 12 } } });
  expect(parsed.trackerValues["hp"]).toEqual({ value: 9, items: null, max: 12 });
});

test("identity carries the DISPLAY name + the standing guides, and defaults its display fields", () => {
  const identity = rpgActorIdentitySchema.parse({ name: "Sister Vesna" });
  expect(identity.name).toBe("Sister Vesna");
  expect(identity.emoji).toBe("");
  expect(identity.mood).toBe("");
  expect(identity.relationship).toEqual({ kind: "neutral", label: "" });
  // The three RV-11 guides are absent-when-unwritten (never "" placeholders the reader would print).
  expect(identity.appearance).toBeUndefined();
});

test("wallet is a STORED named-amount array (the lite-first divergence from the derived legacy wallet)", () => {
  const parsed = rpgActorVolatileSchema.parse({
    wallet: [
      { name: "gold", amount: 40 },
      { name: "silver", amount: 3 },
    ],
  });
  expect(parsed.wallet).toEqual([
    { name: "gold", amount: 40 },
    { name: "silver", amount: 3 },
  ]);
});

// ── the hand op vocabulary ────────────────────────────────────────────────────────────────────────────────

test("every op arm parses, and an unknown op is REJECTED at the wire (the union is the whole vocabulary)", () => {
  const ops = [
    { op: "setIdentityText", field: "mood", text: "wary" },
    { op: "setIdentityText", field: "name", text: "Sister Vesna" },
    { op: "setRelationship", relationship: { kind: "enemy", label: "" } },
    { op: "setStatus", status: "wary" },
    { op: "setTracker", key: "trust", value: { value: 4 } },
    { op: "setTracker", key: "trust", value: { max: null } },
    { op: "addCondition", condition: { name: "Chilled" } },
    { op: "removeCondition", name: "Chilled" },
    { op: "addItem", item: { name: "Bone key" } },
    { op: "patchItem", id: "itm-1", patch: { quantity: 3 } },
    { op: "removeItem", id: "itm-1" },
    { op: "setWalletAmount", name: "gold", amount: 45 },
  ];
  for (const op of ops) {
    expect(rpgActorOpSchema.safeParse(op).success).toBe(true);
  }
  expect(rpgActorOpSchema.safeParse({ op: "setActorRef", actorRef: { kind: "cast", castKey: "x" } }).success).toBe(false);
  // `setHp` died with the demotion — health is written by `setTracker` like every other meter.
  expect(rpgActorOpSchema.safeParse({ op: "setHp", hp: { value: 9, max: 12 } }).success).toBe(false);
  // An identity TEXT op may only name a real identity field (never `relationship`, which has its own arm).
  expect(rpgActorOpSchema.safeParse({ op: "setIdentityText", field: "relationship", text: "x" }).success).toBe(false);
  // An `addItem` without a name has no honest row to mint (the "Item 3" orphan the panel refuses too).
  expect(rpgActorOpSchema.safeParse({ op: "addItem", item: {} }).success).toBe(false);
});

test("an item's `id` is NOT authorable — identity is server-minted on both the hand and model paths", () => {
  const parsed = rpgActorOpSchema.parse({ op: "addItem", item: { name: "Rope", id: "itm-mine" } });
  expect(parsed.op === "addItem" && "id" in parsed.item).toBe(false);
});

test("the op FIELD vocabulary is the volatile plane's own writable keys", () => {
  expect([...RPG_ACTOR_OP_FIELDS].toSorted()).toEqual(Object.keys(rpgActorVolatileSchema.shape).toSorted());
});

test("the identity TEXT vocabulary is the identity plane's own string keys (relationship excluded)", () => {
  expect([...RPG_ACTOR_IDENTITY_TEXT_FIELDS].toSorted()).toEqual(
    Object.keys(rpgActorIdentitySchema.shape)
      .filter((key) => key !== "relationship" && key !== "characterId")
      .toSorted(),
  );
});
