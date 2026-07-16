// Integration test: the DB-backed rate-limit primitive + the PD-14 per-member COUNT budget, over a real
// libSQL `:memory:` db (the shared `rate_limit_buckets` table is what makes the cap multi-replica-correct).
// Determinism: time is pinned through the injected `now` seam (testing §3) — the window-boundary cases pin
// the clock instead of racing the wall clock (the 2026-06-11 flake this seam exists for).

import { rateLimitBuckets } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { like } from "drizzle-orm";
import { describe } from "vitest";
import { createMemberBudget, createRateLimiter } from "../../../packages/server/src/transport/rate-limit.ts";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures";

const T0 = 1_700_000_000_000;
const WINDOW_MS = 60_000;

describe("rate-limit: createRateLimiter", () => {
  test("the atomic increment caps at `points` and rejects the over-budget call", async () => {
    const db = await freshDb();
    const limiter = createRateLimiter(db, {
      scope: "general",
      points: 2,
      windowMs: WINDOW_MS,
      now: () => T0,
    });

    await limiter.consume("ip-1");
    await limiter.consume("ip-1");
    await expect(limiter.consume("ip-1")).rejects.toBeInstanceOf(DomainRateLimitError);
  });

  test("the rejection carries msBeforeNext (until window reset) + remainingPoints 0", async () => {
    const db = await freshDb();
    const limiter = createRateLimiter(db, {
      scope: "general",
      points: 1,
      windowMs: WINDOW_MS,
      now: () => T0,
    });

    await limiter.consume("ip-1");
    const err = await limiter.consume("ip-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainRateLimitError);
    const rl = err as DomainRateLimitError;
    expect(rl.remainingPoints).toBe(0);
    // msBeforeNext = expiresAt - now = (windowStart + WINDOW_MS) - now, i.e. the time left in THIS window.
    expect(rl.msBeforeNext).toBe(WINDOW_MS - (T0 % WINDOW_MS));
  });

  test("the window resets — a new fixed window mints a fresh bucket", async () => {
    const db = await freshDb();
    let clock = T0;
    const limiter = createRateLimiter(db, {
      scope: "general",
      points: 1,
      windowMs: WINDOW_MS,
      now: () => clock,
    });

    await limiter.consume("ip-1");
    await expect(limiter.consume("ip-1")).rejects.toBeInstanceOf(DomainRateLimitError);
    clock += WINDOW_MS;
    await expect(limiter.consume("ip-1")).resolves.toBeUndefined();
  });

  test("distinct ids have independent buckets (one IP's flood doesn't throttle another)", async () => {
    const db = await freshDb();
    const limiter = createRateLimiter(db, {
      scope: "public-ip",
      points: 1,
      windowMs: WINDOW_MS,
      now: () => T0,
    });

    await limiter.consume("ip-1");
    await expect(limiter.consume("ip-1")).rejects.toBeInstanceOf(DomainRateLimitError);
    await expect(limiter.consume("ip-2")).resolves.toBeUndefined();
  });
});

describe("rate-limit: createMemberBudget (PD-14)", () => {
  const memberA = castId<UserId>("user_member_a");
  const memberB = castId<UserId>("user_member_b");

  test("the COUNT budget caps per member and is attributed to triggeredBy", async () => {
    const db = await freshDb();
    const budget = createMemberBudget(db, { windowMs: WINDOW_MS, now: () => T0 });

    await budget.debit(memberA, 2);
    await budget.debit(memberA, 2);
    await expect(budget.debit(memberA, 2)).rejects.toBeInstanceOf(DomainRateLimitError);

    // Attribution: member B's budget is independent — member A's spend never debits B.
    await expect(budget.debit(memberB, 2)).resolves.toBeUndefined();
  });

  test("a null budget is unbounded — no throw, and no bucket rows are written", async () => {
    const db = await freshDb();
    const budget = createMemberBudget(db, { windowMs: WINDOW_MS, now: () => T0 });

    for (let i = 0; i < 5; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential debits — the test asserts the cumulative no-op, not throughput.
      await budget.debit(memberA, null);
    }

    const rows = await db.select().from(rateLimitBuckets).where(like(rateLimitBuckets.key, "member-budget:%"));
    expect(rows).toHaveLength(0);
  });

  test("the member budget resets at the next window", async () => {
    const db = await freshDb();
    let clock = T0;
    const budget = createMemberBudget(db, { windowMs: WINDOW_MS, now: () => clock });

    await budget.debit(memberA, 1);
    await expect(budget.debit(memberA, 1)).rejects.toBeInstanceOf(DomainRateLimitError);
    clock += WINDOW_MS;
    await expect(budget.debit(memberA, 1)).resolves.toBeUndefined();
  });
});
