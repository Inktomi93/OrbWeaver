// Integration test: the DB-backed rate-limit primitive over a real libSQL `:memory:` db (the shared
// `rate_limit_buckets` table is what makes the cap multi-replica-correct). The per-member COUNT
// budget that shared this table is GONE — D17's count-budget clause was retired (@orb/inference §14 F11).
// Determinism: time is pinned through the injected `now` seam (testing §3) — the window-boundary cases pin
// the clock instead of racing the wall clock (the 2026-06-11 flake this seam exists for).

// @orb-waive-file no-test-fabrication(DomainRateLimitError): baselined when the gate widened to value casts; burn-down item 906.
import { rateLimitBuckets } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createRateLimiter } from "#server/transport/rate-limit.ts";

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

  test("repeated consumes in one window are ONE bucket row whose count is the consume count", async () => {
    const db = await freshDb();
    const limiter = createRateLimiter(db, { scope: "authed", points: 10, windowMs: WINDOW_MS, now: () => T0 });

    await limiter.consume("user-b");
    await limiter.consume("user-b");
    await limiter.consume("user-b");

    const rows = await db.select().from(rateLimitBuckets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(3);
  });

  test("a consume sweeps its own scope's expired buckets and leaves other scopes and live buckets", async () => {
    const db = await freshDb();
    let clock = T0;
    const authed = createRateLimiter(db, { scope: "authed", points: 10, windowMs: WINDOW_MS, now: () => clock });
    const publicIp = createRateLimiter(db, { scope: "public-ip", points: 10, windowMs: WINDOW_MS, now: () => clock });
    await authed.consume("u1");
    await authed.consume("u2");
    await publicIp.consume("9.9.9.9");

    clock += WINDOW_MS * 2;
    await authed.consume("u3");

    // The sweep is fire-and-forget beside the verdict; a following read on the same connection runs after it.
    const keys = (await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets)).map((row) => row.key.split(":").slice(0, 2).join(":")).sort();
    expect(keys).toEqual(["authed:u3", "public-ip:9.9.9.9"]);
  });
});
