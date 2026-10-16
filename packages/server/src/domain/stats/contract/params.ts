// Domain read options; wire axes and their validators belong to contracts/stats.

import type { LeaderboardSort } from "@orb/contracts/stats";
import type { CharacterId } from "@orb/kit/ids";

export interface LeaderboardOpts {
  sort?: LeaderboardSort | undefined;
  limit?: number | undefined;
  /** A name substring to narrow the ranked population — the LIST-pane search that reaches the ranked
   *  characters past the page cap (the leaderboard is a page of 50 out of a larger ranked total, so a
   *  named character below the cut is otherwise unreachable). `undefined`/empty ⇒ the whole population.
   *  Case-insensitive; `total` narrows to the match count so the band's census stays honest. */
  search?: string | undefined;
}

/** An inclusive window over the timeline's bucket starts, epoch-ms. Absent bounds are open. */
export interface TimeseriesOpts {
  from?: number | undefined;
  to?: number | undefined;
}

export interface ByModelOpts {
  limit?: number | undefined;
}

/** Persona usage narrowed to the chats one character takes part in — the CONTEXT panel's drilled state
 *  (the tabs used to render LIBRARY numbers under the drilled character's face). A foreign `characterId`
 *  is not an access decision: the read is owner-scoped by `personas.owner_id` regardless, so an id the
 *  caller does not own simply matches no chats. */
export interface PersonaUsageOpts {
  characterId?: CharacterId | undefined;
}
