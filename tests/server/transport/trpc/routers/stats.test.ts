// stats.{leaderboard,latency} — the PD-47 wire-through (docs/law/Tier-4-Transport.md). The router is a THIN driver:
// it derives `leaderboard.sort` from the `LEADERBOARD_SORTS` tuple + re-parses the `latencyScopeSchema`
// discriminated union, then delegates to `ctx.services.stats.<verb>` with `ownerId = principal.userId`
// (never input). These assert the pass-through (the wired `sort` reaches the service; the parsed scope
// reaches `latency`) — driven through the real ladder via `createCaller`.

import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { LatencyStats, LeaderboardRow, StatsService } from "@orb/server/domain/stats";
import type { Context } from "@orb/server/transport/trpc";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

// MINTED, never readable literals: these ids cross `typeIdSchema` tRPC inputs, which validate the TypeID suffix.
const ID = {
  character1: mintTypeId(ID_PREFIX.character),
} as const;

const OWNER = castId<UserId>("user_owner");
const CHARACTER = ID.character1;

const NO_LATENCY: LatencyStats = {
  avgTtftMs: null,
  p50TtftMs: null,
  p90TtftMs: null,
  avgGenMs: null,
  p50GenMs: null,
  p90GenMs: null,
};

function ctxWith(stats: Partial<StatsService>): Context {
  return makeContext({ auth: principal("user", { userId: OWNER }), services: { stats } });
}

describe("stats.leaderboard — sort wire-through", () => {
  test("passes the validated sort + limit to the service, scoped to the principal", async () => {
    const leaderboard = vi.fn<StatsService["leaderboard"]>(async () => ({ rows: [] satisfies LeaderboardRow[], total: 0 }));
    await caller(ctxWith({ leaderboard })).stats.leaderboard({ sort: "swipes", limit: 10 });
    expect(leaderboard).toHaveBeenCalledWith(OWNER, { sort: "swipes", limit: 10 });
  });

  test("rejects a sort outside the LEADERBOARD_SORTS tuple at the wire boundary", async () => {
    const leaderboard = vi.fn<StatsService["leaderboard"]>(async () => ({ rows: [] satisfies LeaderboardRow[], total: 0 }));
    await expect(
      // @ts-expect-error — "bogus" is not a LeaderboardSort; the z.enum derived from the tuple rejects it.
      caller(ctxWith({ leaderboard })).stats.leaderboard({ sort: "bogus" }),
    ).rejects.toThrow();
    expect(leaderboard).not.toHaveBeenCalled();
  });
});

// P1b: the CONTEXT Personas tab narrows to the drilled character. The id is a PROJECTION filter — the
// verb's ownerId stays the principal, so the wire-through must not be able to swap whose data is read.
describe("stats.personaUsage — character scope wire-through", () => {
  test("passes the validated characterId through, still scoped to the principal", async () => {
    const personaUsage = vi.fn<StatsService["personaUsage"]>(async () => []);
    await caller(ctxWith({ personaUsage })).stats.personaUsage({ characterId: CHARACTER });
    expect(personaUsage).toHaveBeenCalledWith(OWNER, { characterId: CHARACTER });
  });

  test("no input reads the whole library", async () => {
    const personaUsage = vi.fn<StatsService["personaUsage"]>(async () => []);
    await caller(ctxWith({ personaUsage })).stats.personaUsage();
    expect(personaUsage).toHaveBeenCalledWith(OWNER, { characterId: undefined });
  });
});

describe("stats.latency — scope wire-through", () => {
  test("delegates the parsed character scope to the service, scoped to the principal", async () => {
    const latency = vi.fn<StatsService["latency"]>(async () => NO_LATENCY);
    const result = await caller(ctxWith({ latency })).stats.latency({
      kind: "character",
      characterId: CHARACTER,
    });
    expect(latency).toHaveBeenCalledWith(OWNER, { kind: "character", characterId: CHARACTER });
    expect(result).toEqual(NO_LATENCY);
  });

  test("delegates the model scope (nullable provider) verbatim", async () => {
    const latency = vi.fn<StatsService["latency"]>(async () => NO_LATENCY);
    await caller(ctxWith({ latency })).stats.latency({
      kind: "model",
      model: "gpt-4o",
      provider: null,
    });
    expect(latency).toHaveBeenCalledWith(OWNER, { kind: "model", model: "gpt-4o", provider: null });
  });

  test("rejects an unknown scope discriminant at the wire boundary", async () => {
    const latency = vi.fn<StatsService["latency"]>(async () => NO_LATENCY);
    await expect(
      // @ts-expect-error — "galaxy" is not a LatencyScope kind; the discriminated union rejects it.
      caller(ctxWith({ latency })).stats.latency({ kind: "galaxy" }),
    ).rejects.toThrow();
    expect(latency).not.toHaveBeenCalled();
  });
});
