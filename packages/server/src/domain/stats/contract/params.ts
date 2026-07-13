// domain/stats/contract/params — verb argument shapes. LeaderboardSort backs the readLeaderboard sortCols
// exhaustive-dispatch Record; LatencyScope is a discriminated union whose readLatency switch carries an
// assertNever default, so an unhandled kind fails tsc instead of falling through to owner-scope.

import type { CharacterId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

export const LEADERBOARD_SORTS = [
  "assistantTurns",
  // biome-ignore lint/security/noSecrets: a leaderboard sort-key literal, not a secret (high-entropy false positive).
  "totalGenTimeMs",
  "swipes",
  "lastActivityAt",
] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

export const latencyScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner") }),
  z.object({ kind: z.literal("character"), characterId: brandedId<CharacterId>() }),
  z.object({ kind: z.literal("model"), model: z.string(), provider: z.string().nullable() }),
]);
export type LatencyScope = z.infer<typeof latencyScopeSchema>;

export interface LeaderboardOpts {
  sort?: LeaderboardSort | undefined;
  limit?: number | undefined;
}

export interface TimeseriesOpts {
  from?: string | undefined;
  to?: string | undefined;
}

export interface ByModelOpts {
  limit?: number | undefined;
}
