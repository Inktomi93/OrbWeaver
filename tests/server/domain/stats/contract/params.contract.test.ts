// contract/params — the LeaderboardSort axis is the canonical `as const` tuple (§7.5); LeaderboardSort
// derives from it. This pins the membership so the verb's `sortCols` mapped Record + the tRPC `z.enum`
// stay in lockstep with the one home (a dropped/renamed member is caught here + by exhaustive-dispatch).

import { describe } from "vitest";
import type { LeaderboardSort } from "../../../../../packages/server/src/domain/stats/contract/params.ts";
import { LEADERBOARD_SORTS } from "../../../../../packages/server/src/domain/stats/contract/params.ts";
import { expect, test } from "../../../../support/fixtures";

describe("LEADERBOARD_SORTS", () => {
  test("is the exact sort axis, in order", () => {
    expect([...LEADERBOARD_SORTS]).toEqual([
      "assistantTurns",
      // biome-ignore lint/security/noSecrets: a leaderboard sort-key literal, not a secret (high-entropy false positive).
      "totalGenTimeMs",
      "swipes",
      "lastActivityAt",
    ]);
  });

  test("every member is a valid LeaderboardSort (the tuple derives the union)", () => {
    const all: LeaderboardSort[] = [...LEADERBOARD_SORTS];
    expect(new Set(all).size).toBe(LEADERBOARD_SORTS.length); // no duplicate axis members
  });
});
