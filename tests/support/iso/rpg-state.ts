import type {
  RpgActorEntry,
  RpgActorIdentity,
  RpgActorRef,
  RpgActorVolatile,
  RpgInventoryItem,
  RpgRelationship,
  RpgSheet,
  RpgTrackerValue,
} from "@orb/contracts/rpg";
import { rpgActorEntrySchema, rpgSheetSchema } from "@orb/contracts/rpg";
import { rpgActorIdentitySchema, rpgActorVolatileSchema, rpgInventoryItemSchema, rpgRelationshipSchema } from "../../../packages/contracts/src/rpg/actor.ts";
import { rpgTrackerValueSchema } from "../../../packages/contracts/src/rpg/tracker.ts";

/** Builds a sheet from its authored defaults, not a game's birth policy. */
export function makeRpgSheet(overrides: Partial<RpgSheet> = {}): RpgSheet {
  return rpgSheetSchema.parse(overrides);
}

/** Builds the actor's owner-default volatile component. */
export function makeRpgActorVolatile(overrides: Partial<RpgActorVolatile> = {}): RpgActorVolatile {
  return rpgActorVolatileSchema.parse(overrides);
}

/** Builds the relationship component without inventing a story-written stance. */
export function makeRpgRelationship(overrides: Partial<RpgRelationship> = {}): RpgRelationship {
  return rpgRelationshipSchema.parse(overrides);
}

/** Builds an unset tracker reading unless the caller supplies one. */
export function makeRpgTrackerValue(overrides: Partial<RpgTrackerValue> = {}): RpgTrackerValue {
  return rpgTrackerValueSchema.parse(overrides);
}

/** Supplies the authored name while the owner schema fills identity defaults. */
export function makeRpgActorIdentity(name: RpgActorIdentity["name"], overrides: Partial<Omit<RpgActorIdentity, "name">> = {}): RpgActorIdentity {
  return rpgActorIdentitySchema.parse({ name, ...overrides });
}

/** Supplies a genuine actor reference while the owner schema constructs its whole volatile state. */
export function makeRpgActorEntry(actorRef: RpgActorRef, overrides: Partial<Omit<RpgActorEntry, "actorRef">> = {}): RpgActorEntry {
  return rpgActorEntrySchema.parse({ actorRef, ...overrides });
}

/** Fills inventory component defaults around the supplied identity and name. */
export function makeRpgInventoryItem(input: Pick<RpgInventoryItem, "id" | "name"> & Partial<Omit<RpgInventoryItem, "id" | "name">>): RpgInventoryItem {
  return rpgInventoryItemSchema.parse(input);
}
