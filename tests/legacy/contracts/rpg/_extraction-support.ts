import type { ExtractionRefs, RpgActorRef, RpgTrackerCarrier, RpgTrackerDef } from "@orb/contracts/rpg";
import { actorRefKey, rpgNpcSlug, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";

// The ref bundle's establishment flags. The enum tests below don't force scene population (both false); the
// establish-when-unset arm is pinned by its own tests further down.
const NO_ESTABLISH = { location: false, timeOfDay: false, presentCast: false } as const;

/** The tracker-free ref bundle every non-R6 enum test starts from (a game that tracks nothing per-actor). */
export const BARE_REFS: ExtractionRefs = {
  actorRefs: [],
  trackerWriteGroups: [],
  gameTrackerKeys: { deltaKeys: [], setKeys: [] },
  conditionNames: [],
  establishScene: NO_ESTABLISH,
};

/** A tracker def with the axes a test cares about; everything else takes its schema default. */
export function tracker(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

/** A carrier (an actor the write surface may target), with no sheet exceptions unless given. */
export function carrier(name: string, kind: "party" | "npcs", over: Partial<RpgTrackerCarrier> = {}): RpgTrackerCarrier {
  const ref: RpgActorRef = kind === "npcs" ? { kind: "npc", npcKey: rpgNpcSlug(name) } : { kind: "user", userId: newId<UserId>() };
  return { actorKey: actorRefKey(ref), name, kind, grants: [], revokes: [], ...over };
}

export function refEnum(schema: Record<string, unknown>, path: readonly string[]): unknown {
  let node: unknown = schema;
  for (const key of path) {
    node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
  }
  return node;
}

export const MANA = tracker({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
export const TRUST = tracker({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" });
export const SEALED = tracker({ key: "sealed", label: "Sealed", shape: "meter", write: "delta", subject: "actor", appliesTo: "everyone", locked: true });
