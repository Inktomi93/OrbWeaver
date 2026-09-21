// domain/stats/contract/params — verb argument shapes. LeaderboardSort backs the readLeaderboard sortCols
// exhaustive-dispatch Record; LatencyScope is a discriminated union whose readLatency switch carries an
// assertNever default, so an unhandled kind fails tsc instead of falling through to owner-scope.

import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export const LEADERBOARD_SORTS = ["assistantTurns", "totalGenTimeMs", "swipes", "lastActivityAt"] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

export const latencyScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner") }),
  z.object({ kind: z.literal("character"), characterId: typeIdSchema(ID_PREFIX.character) }),
  z.object({ kind: z.literal("model"), model: z.string(), provider: z.string().nullable() }),
]);
export type LatencyScope = z.infer<typeof latencyScopeSchema>;

export interface LeaderboardOpts {
  sort?: LeaderboardSort | undefined;
  limit?: number | undefined;
  /** A name substring to narrow the ranked population — the LIST-pane search that reaches the ranked
   *  characters past the page cap (the leaderboard is a page of 50 out of a larger ranked total, so a
   *  named character below the cut is otherwise unreachable). `undefined`/empty ⇒ the whole population.
   *  Case-insensitive; `total` narrows to the match count so the band's census stays honest. */
  search?: string | undefined;
}

export interface TimeseriesOpts {
  from?: string | undefined;
  to?: string | undefined;
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
