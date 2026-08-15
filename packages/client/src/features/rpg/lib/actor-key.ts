// The stable member-scope selector KEY for a roster actor (`kind:name` — the roster's own identity
// derivation): one home for Sheet / Inventory / the subject dropdown, so every member-scoped
// surface addresses the same actor by the same key.

import type { RpgActorView } from "@orb/contracts/rpg";

/** The stable selector key for an actor. */
export function actorKey(actor: RpgActorView): string {
  return `${actor.actorRef.kind}:${actor.name}`;
}
