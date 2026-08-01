// @orb/contracts/rpg/actor — the actor reference + per-actor VOLATILE state (rpg-design/05 §2.6). Wallet +
// inventory are FIRST-CLASS on EVERY actor (character AND cast NPC), present in lite (owner-CONFIRMED at
// ratification). `wallet` is a STORED named-amount array, NOT legacy's derived currency-item total — lite
// has no loot engine to mint currency items, so a derived wallet would be a permanently-empty dead
// doorway; full's loot engine later CREDITS the same slots at grant time (an engine graft onto an existing
// column, zero re-spell).
//
// Actor-ref arms: `character`/`user` address roster identities directly (no membership shadow — §4.3);
// `cast` addresses scene-only NPCs by stable normalized-name `key`. Full ADDS the `{kind:"npc"}` arm when
// `rpg_npcs` lands — an additive union member every `assertNever` consumer is compile-forced to handle
// (shipping it now would mint a dead `RpgNpcId` brand FK-ing a nonexistent table).

import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { rpgTrackerValueSchema, rpgTrackerValuesSchema } from "./tracker";

/** A durable/scene actor identity. `character`/`user` = roster identities; `cast` = a scene-only NPC by
 *  its stable normalized-name `key`. Full ADDS `{kind:"npc"}` (additive — `assertNever` consumers error). */
export const rpgActorRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("character"), characterId: typeIdSchema(ID_PREFIX.character) }),
  z.object({ kind: z.literal("user"), userId: brandedId<UserId>() }),
  z.object({ kind: z.literal("cast"), castKey: z.string().min(1) }),
]);
export type RpgActorRef = z.infer<typeof rpgActorRefSchema>;

/** The ONE string projection of an actor ref — the Map / lock / find key. A total switch (a new arm fails
 *  `tsc` here). */
export function actorRefKey(ref: RpgActorRef): string {
  if (ref.kind === "character") {
    return `character:${ref.characterId}`;
  }
  if (ref.kind === "user") {
    return `user:${ref.userId}`;
  }
  return `cast:${ref.castKey}`;
}

/** An inventory item — `type` taxonomy ships for display + full's equip/filter future, minus any wallet
 *  coupling (§2.6). */
export const rpgInventoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  quantity: z.number().int().min(1).default(1),
  location: z.string().default(""),
  type: z.string().default(""),
  // #37 — the HOST-picked display icon (a curated `@orb/ui/icons` seal NAME from the client's
  // `ITEM_ICON_CHOICES` table). Host-set only (absent from `update_inventory`'s args + the extraction
  // schema — unwritable by the model); display falls back to the keyword resolver when unset.
  icon: z.string().optional(),
});
export type RpgInventoryItem = z.infer<typeof rpgInventoryItemSchema>;

/** The full-engine condition slot, born whole (`stat`/`turnsLeft` are full-engine fields lite ignores). */
const rpgConditionSchema = z.object({
  name: z.string().min(1),
  stat: z.enum(["attack", "defense", "speed", "hp"]).nullable(),
  modifier: z.number().int(),
  turnsLeft: z.number().int().min(1).nullable(),
});

/** Per-actor volatile state — the swipe-volatile plane, born whole (full grafts ZERO fields here). `hp` is
 *  born nullable (§8 nullable-honesty — a null-hp actor has no health bar, not a phantom 0). `wallet` is
 *  the STORED named-amount array (§2.6). `trackerValues` is the tracked-field VALUE plane, keyed by tracker
 *  `key` (the tracked-field unification) — it replaces the old name-addressed `pools[]` AND the cast row's
 *  opaque `customFields` string record, so every tracked value on every actor (roster member OR scene NPC)
 *  reads from ONE home with ONE addressing rule. */
export const rpgActorVolatileSchema = z.object({
  actorRef: rpgActorRefSchema,
  hp: z.object({ value: z.number().int(), max: z.number().int().min(1) }).nullable(),
  trackerValues: rpgTrackerValuesSchema.default({}),
  conditions: z.array(rpgConditionSchema).default([]),
  inventory: z.array(rpgInventoryItemSchema).default([]),
  wallet: z.array(z.object({ name: z.string().min(1), amount: z.number().int() })).default([]),
  status: z.string().default(""),
});
export type RpgActorVolatile = z.infer<typeof rpgActorVolatileSchema>;

// ── THE OP-SHAPED HAND VOCABULARY (R1 — `rpg.patchActor`) ────────────────────────────────────────────────
// The hand used to author this plane as a whole-ARRAY IMAGE through `editSnapshot`, which asked a client that
// can only SEE the plane in projections (`actors[].volatile` + `castVolatile`, never the departed rows) to
// re-author every actor's every field on every click. Three shipped defects and one latent clobber came out of
// that one contract (the actor-state stickler review §2/§5 R1). The ops below replace it: one actor, one
// datum, per call — the server reads the TRUE head, applies the op, and writes back, so a model flush landing
// between the panel's read and the human's click can no longer be overwritten by a stale image, and the
// auto-lock lands on exactly the datum the human touched.
//
// The op vocabulary is DERIVED from the plane above ({@link RPG_ACTOR_OP_FIELDS}) — a renamed volatile field
// fails `tsc` here, not at a call site — and every op names the ONE field it writes, which is also the fine
// lock path it stamps (the server's ONE derivation, `substrate/actor-ops.ts`).

/** The volatile fields the hand ops address, pinned to the plane's own keys (`actorRef` is identity, not a
 *  writable datum — an actor is re-keyed by no gesture; it LEAVES by `rpg.dismissActor`). */
export const RPG_ACTOR_OP_FIELDS = [
  "status",
  "hp",
  "trackerValues",
  "conditions",
  "inventory",
  "wallet",
] as const satisfies readonly (keyof RpgActorVolatile)[];
export type RpgActorOpField = (typeof RPG_ACTOR_OP_FIELDS)[number];

/** The tracked-value PATCH a `setTracker` op carries — each datum optional, each DERIVED from the resident
 *  value schema (never a re-spell): an omitted datum keeps the actor's current one, so a max edit never blanks
 *  the reading beside it. `max: null` is the honest CLEAR of a per-carrier ceiling override
 *  (`resolveTrackerMaxOverride`), not "no max given". */
const rpgTrackerValuePatchSchema = z.object({
  value: rpgTrackerValueSchema.shape.value.optional(),
  items: rpgTrackerValueSchema.shape.items.optional(),
  max: rpgTrackerValueSchema.shape.max.optional(),
});

/** The authored half of an inventory item (the resident shape MINUS `id`, which the SERVER mints — a hand
 *  caller never names an item's identity, exactly as the model applier never does). */
const rpgInventoryItemInputSchema = rpgInventoryItemSchema.omit({ id: true }).partial().extend({ name: rpgInventoryItemSchema.shape.name });

/** ONE hand write on ONE actor's volatile plane. Discriminated on `op`; every arm names the field it writes
 *  (the `<field>` in its `actorState.<actorKey>.<field>` lock path) and carries only that field's datum.
 *  Keyed sub-arrays (`conditions` by name, `inventory` by id, `wallet` by name — the merge engine's own
 *  element keys) get add/remove/patch arms; the leaves get `set` arms, where `setHp`'s `null` is the honest
 *  clear (`hp` is the one nullable volatile leaf). */
export const rpgActorOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setStatus"), status: rpgActorVolatileSchema.shape.status }),
  z.object({ op: z.literal("setHp"), hp: rpgActorVolatileSchema.shape.hp }),
  z.object({ op: z.literal("setTracker"), key: z.string().min(1), value: rpgTrackerValuePatchSchema }),
  z.object({ op: z.literal("addCondition"), condition: rpgConditionSchema.partial().extend({ name: rpgConditionSchema.shape.name }) }),
  z.object({ op: z.literal("removeCondition"), name: z.string().min(1) }),
  z.object({ op: z.literal("addItem"), item: rpgInventoryItemInputSchema }),
  // The item ops address the element by its OWN `id` field — a blob-internal string (no table, no FK, no
  // brand: `rpgInventoryItemSchema.id` is the same plain string, and a per-item brand buys nothing at this
  // cardinality), which is also why the field is spelled `id` and not `itemId`.
  z.object({ op: z.literal("patchItem"), id: rpgInventoryItemSchema.shape.id, patch: rpgInventoryItemInputSchema.partial() }),
  z.object({ op: z.literal("removeItem"), id: rpgInventoryItemSchema.shape.id }),
  z.object({ op: z.literal("setWalletAmount"), name: z.string().min(1), amount: z.number().int() }),
]);
export type RpgActorOp = z.infer<typeof rpgActorOpSchema>;
