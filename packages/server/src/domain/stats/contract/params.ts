// domain/stats/contract/params — the verb argument shapes (one-home per §7.4; the movement table moved the
// inline `{ sort?; limit? }` / `{ from?; to? }` opts off the verb signatures into here). Two string-union
// axes live here too: `LeaderboardSort` (the `readLeaderboard` `sortCols` mapped-Record is the gold-standard
// exhaustive-dispatch pattern — a new member is a `tsc` error if its Record arm is missing) and
// `LatencyScope` (a discriminated union; the `readLatency` chain SHOULD carry an `assertNever` default —
// FLAG[PD-97]: it does NOT yet, so an unhandled kind falls through to owner-scope; a TODO to add the guard).

import type { CharacterId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

/** The leaderboard sort axis — the canonical `as const` tuple is the ONE home (§7.5; no inline re-spell).
 *  The verb's `sortCols` mapped Record + the tRPC `z.enum(LEADERBOARD_SORTS)` both DERIVE from this. */
export const LEADERBOARD_SORTS = [
  "assistantTurns",
  // biome-ignore lint/security/noSecrets: a leaderboard sort-key literal, not a secret (high-entropy false positive).
  "totalGenTimeMs",
  "swipes",
  "lastActivityAt",
] as const;
export type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number];

/** The entity a latency percentile scan is scoped to (discriminated union; SHOULD be `assertNever`-
 *  dispatched — FLAG[PD-97], the `readLatency` chain lacks the guard today). The
 *  Zod schema is the ONE home (§7.5; the tRPC router re-parses it directly, deriving — not re-spelling — the
 *  wire shape); `LatencyScope` derives via `z.infer`. */
export const latencyScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner") }),
  z.object({ kind: z.literal("character"), characterId: brandedId<CharacterId>() }),
  z.object({ kind: z.literal("model"), model: z.string(), provider: z.string().nullable() }),
]);
export type LatencyScope = z.infer<typeof latencyScopeSchema>;

/** `leaderboard` opts — sort (default `assistantTurns`) + limit (default 50, capped 200). */
export interface LeaderboardOpts {
  sort?: LeaderboardSort | undefined;
  limit?: number | undefined;
}

/** `timeseries` opts — an inclusive [from, to] YYYY-MM-DD window (both ends optional). */
export interface TimeseriesOpts {
  from?: string | undefined;
  to?: string | undefined;
}

/** `byModel` opts — limit (default 50, capped 200). */
export interface ByModelOpts {
  limit?: number | undefined;
}
