// The one tracker-carrier derivation, shared by the tracker view (what an actor carries) and the state rounds'
// write surface (what the model may write), so the two surfaces cannot classify one person differently. Pure.

import type { RpgActorRef, RpgSheet, RpgTrackerCarrier } from "@orb/contracts/rpg";
import { actorRefKey } from "@orb/contracts/rpg";

/** THE carrier record for ANY actor (R2) — the ONE derivation of "what class is this person, and what are
 *  their exceptions". `kind` comes off `actorRef.kind`, so the classes partition PEOPLE, not rows. That is the
 *  §1.4 read/write drift fix and it is structural: the view used to classify by which PLANE a row sat on, so a
 *  participant character standing in the scene was BOTH a `party` carrier (to the write surface, which deduped by
 *  name, participants first) and an `npcs` one (to the reminder and Scene tab, which walked the npc rows). A
 *  `trust(appliesTo:"npcs")` def was therefore taught on her line and offered on nobody's — the exact
 *  reminder-is-knowledge / tools-are-permissions drift the file header calls impossible. An npc carries
 *  no sheet, so its exceptions are empty (a one-off NPC field homes on the def's explicit `appliesTo` list —
 *  the honest home, not a row the NPC doesn't have). */
export function actorCarrier(ref: RpgActorRef, name: string, sheet: RpgSheet | undefined): RpgTrackerCarrier {
  return {
    actorKey: actorRefKey(ref),
    name,
    kind: ref.kind === "npc" ? "npcs" : "party",
    grants: sheet?.trackerGrants ?? [],
    revokes: sheet?.trackerRevokes ?? [],
  };
}
