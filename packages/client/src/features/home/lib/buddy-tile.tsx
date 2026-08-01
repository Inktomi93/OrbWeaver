// The BUDDY doorway — the founding DORMANT home tile (home-section-spec §3.5, owner decisions H7 + H8).
//
// Buddy is PURGED-pending-return: the domain map still lists it ("the companion = the `agent` role
// connection"), but `domain/buddy` is not in the retro tree. Omitting the tile would tell the user this
// product has no companion; a fake-loading tile would lie. The doorway is the only truthful third option —
// it says what this will be and exactly what must land first, and it renders NO control at all.
//
// Why the `{dormant}` BODY ARM and not a `when: () => false` predicate (H7): a predicate gating a BUILD
// fact can only ever be `false`, which makes the tile INVISIBLE — the promise disappears and the stale
// predicate is undetectable. The marker and the body are ONE field here, so building buddy means writing
// `body: () => <BuddyHomeTile/>`, which DELETES the marker in the same edit. A stale doorway is
// unrepresentable, not merely detected.
//
// HOME-owned until the domain returns (H8): an empty `features/buddy/` dir is `feature-owns-definition`
// RED, and adding `tile` to that gate's suffix list is work that belongs to the day buddy actually lands.

import { BrainCircuit } from "@orb/ui/icons";
import type { HomeTileContribution } from "#lib";

const BUDDY_TILE_ORDER = 80;

export const buddyDormantTile: HomeTileContribution = {
  id: "buddy",
  title: "Buddy",
  icon: BrainCircuit,
  order: BUDDY_TILE_ORDER,
  body: {
    dormant: {
      reason: "domain/buddy (not in the retro tree) · the agent-role connection",
      teaser: "Your companion — the agent-role connection that reacts to what you and your characters do, in its own voice.",
    },
  },
};
