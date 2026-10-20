// stats.{leaderboard,latency} — the wire-through (docs/law/Tier-4-Transport.md). The router is a THIN driver:
// it derives `leaderboard.sort` from the `LEADERBOARD_SORTS` tuple + re-parses the `latencyScopeSchema`
// discriminated union, then delegates to `ctx.services.stats.<verb>` with `ownerId = principal.userId`
// (never input). These assert the pass-through (the wired `sort` reaches the service; the parsed scope
// reaches `latency`) — driven through the real ladder via `createCaller`.

import type { LeaderboardRow } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { Context } from "@orb/server/transport/trpc";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import type { LatencyStats, StatsService } from "#server/domain/stats/index.ts";
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

async function ctxWith(db: Db, stats: Partial<StatsService>): Promise<Context> {
  return makeContext({ auth: await principal(db, "user", { userId: OWNER }), services: { stats } });
}

describe("stats.leaderboard — sort wire-through", () => {
  test("passes the validated sort + limit to the service, scoped to the principal", async () => {
    const db = await freshDb();
    const leaderboard = vi.fn<StatsService["leaderboard"]>(async () => ({ rows: [] satisfies LeaderboardRow[], total: 0 }));
    await caller(await ctxWith(db, { leaderboard })).stats.leaderboard({ sort: "swipes", limit: 10 });
    expect(leaderboard).toHaveBeenCalledWith(OWNER, { sort: "swipes", limit: 10 });
  });

  test("rejects a sort outside the LEADERBOARD_SORTS tuple at the wire boundary", async () => {
    const db = await freshDb();
    const leaderboard = vi.fn<StatsService["leaderboard"]>(async () => ({ rows: [] satisfies LeaderboardRow[], total: 0 }));
    await expect(
      // @ts-expect-error — "bogus" is not a LeaderboardSort; the z.enum derived from the tuple rejects it.
      caller(await ctxWith(db, { leaderboard })).stats.leaderboard({ sort: "bogus" }),
    ).rejects.toThrow();
    expect(leaderboard).not.toHaveBeenCalled();
  });
});

// The timeline window is bucket-start instants: the server takes no calendar day and no zone, since the
// viewer's day is folded on the client.
describe("stats.timeseries — window wire-through", () => {
  test("passes epoch-ms bounds to the service, scoped to the principal", async () => {
    const db = await freshDb();
    const timeseries = vi.fn<StatsService["timeseries"]>(async () => []);
    await caller(await ctxWith(db, { timeseries })).stats.timeseries({ from: FROZEN_AT_MS, to: 1_750_000_900_000 });
    expect(timeseries).toHaveBeenCalledWith(OWNER, { from: FROZEN_AT_MS, to: 1_750_000_900_000 });
  });

  test("rejects a calendar-day string bound at the wire boundary", async () => {
    const db = await freshDb();
    const timeseries = vi.fn<StatsService["timeseries"]>(async () => []);
    // @ts-expect-error — a "YYYY-MM-DD" day is not a bucket-start instant.
    await expect(caller(await ctxWith(db, { timeseries })).stats.timeseries({ from: "2026-07-01" })).rejects.toThrow();
    expect(timeseries).not.toHaveBeenCalled();
  });
});

// P1b: the CONTEXT Personas tab narrows to the drilled character. The id is a PROJECTION filter — the
// verb's ownerId stays the principal, so the wire-through must not be able to swap whose data is read.
describe("stats.personaUsage — character scope wire-through", () => {
  test("passes the validated characterId through, still scoped to the principal", async () => {
    const db = await freshDb();
    const personaUsage = vi.fn<StatsService["personaUsage"]>(async () => []);
    await caller(await ctxWith(db, { personaUsage })).stats.personaUsage({ characterId: CHARACTER });
    expect(personaUsage).toHaveBeenCalledWith(OWNER, { characterId: CHARACTER });
  });

  test("no input reads the whole library", async () => {
    const db = await freshDb();
    const personaUsage = vi.fn<StatsService["personaUsage"]>(async () => []);
    await caller(await ctxWith(db, { personaUsage })).stats.personaUsage();
    expect(personaUsage).toHaveBeenCalledWith(OWNER, { characterId: undefined });
  });
});

describe("stats.latency — scope wire-through", () => {
  test("delegates the parsed character scope to the service, scoped to the principal", async () => {
    const db = await freshDb();
    const latency = vi.fn<StatsService["latency"]>(async () => NO_LATENCY);
    const result = await caller(await ctxWith(db, { latency })).stats.latency({
      kind: "character",
      characterId: CHARACTER,
    });
    expect(latency).toHaveBeenCalledWith(OWNER, { kind: "character", characterId: CHARACTER });
    expect(result).toEqual(NO_LATENCY);
  });

  test("delegates the model scope (nullable provider) verbatim", async () => {
    const db = await freshDb();
    const latency = vi.fn<StatsService["latency"]>(async () => NO_LATENCY);
    await caller(await ctxWith(db, { latency })).stats.latency({
      kind: "model",
      model: "gpt-4o",
      provider: null,
    });
    expect(latency).toHaveBeenCalledWith(OWNER, { kind: "model", model: "gpt-4o", provider: null });
  });

  test("rejects an unknown scope discriminant at the wire boundary", async () => {
    const db = await freshDb();
    const latency = vi.fn<StatsService["latency"]>(async () => NO_LATENCY);
    await expect(
      // @ts-expect-error — "galaxy" is not a LatencyScope kind; the discriminated union rejects it.
      caller(await ctxWith(db, { latency })).stats.latency({ kind: "galaxy" }),
    ).rejects.toThrow();
    expect(latency).not.toHaveBeenCalled();
  });
});
