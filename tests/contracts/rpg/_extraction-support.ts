import type { ExtractionRefs, RpgTrackerCarrier, RpgTrackerDef } from "@orb/contracts/rpg";
import { rpgTrackerDefSchema } from "@orb/contracts/rpg";

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
  return { actorKey: `${kind === "npcs" ? "npc" : "user"}:${name}`, name, kind, grants: [], revokes: [], ...over };
}

export function refEnum(schema: Record<string, unknown>, path: readonly string[]): unknown {
  let node: unknown = schema;
  for (const key of path) {
    // @orb-waive no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
    node = node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
  }
  return node;
}

export const MANA = tracker({ key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party" });
export const TRUST = tracker({ key: "trust", label: "Trust", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" });
export const SEALED = tracker({ key: "sealed", label: "Sealed", shape: "meter", write: "delta", subject: "actor", appliesTo: "everyone", locked: true });
