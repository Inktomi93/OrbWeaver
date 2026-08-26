// The stable member-scope selector KEY for a roster actor: the contract's canonical immutable-ref
// projection. One home for Sheet / Inventory / the subject dropdown, so every member-scoped surface
// addresses the same actor by the same key through renames and same-name roster entries.

import type { RpgActorView } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";

/** The stable selector key for an actor. */
export function actorKey(actor: RpgActorView): string {
  return actorRefKey(actor.actorRef);
}
