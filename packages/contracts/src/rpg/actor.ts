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
import { rpgTrackerValuesSchema } from "./tracker";

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
