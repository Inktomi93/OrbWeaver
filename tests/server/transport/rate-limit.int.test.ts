// Integration test: the DB-backed rate-limit primitive over a real libSQL `:memory:` db (the shared
// `rate_limit_buckets` table is what makes the cap multi-replica-correct). The PD-14 per-member COUNT
// budget that shared this table is GONE — D17's count-budget clause was retired (@orb/inference §14 F11).
// Determinism: time is pinned through the injected `now` seam (testing §3) — the window-boundary cases pin
// the clock instead of racing the wall clock (the 2026-06-11 flake this seam exists for).

import { DomainRateLimitError } from "@orb/kit/errors";
import { describe } from "vitest";
import { createRateLimiter } from "../../../packages/server/src/transport/rate-limit.ts";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

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
