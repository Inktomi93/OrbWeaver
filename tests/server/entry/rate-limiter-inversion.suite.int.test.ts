// The rate-limit gate's bucket-selection FAILSAFE — "anonymous fails closed on the TIGHT per-IP bucket,
// never silently falls through to the LOOSE authed bucket." The tRPC ladder runs the rate-limit middleware
// BEFORE the auth gate (trpc.ts stack order), so `ctx.auth` is legitimately `null` at limit time for a
// public call — the gate MUST route a null principal to the `public-ip` bucket (tight cap, keyed on the IP /
// an `unknown` sentinel), and an authed principal to the `general` bucket (loose cap, keyed on userId). The
// inversion this guards: a refactor that reordered the branches (or keyed a null principal into `general`)
// would hand an anonymous flood the 10×-looser authed budget — a silent throttle hole no other test covers
// (every existing rate-limit test drives the primitive directly, never the gate's null-vs-authed routing).
//
// NON-VACUITY: the failsafe test proves anon is capped at the PUBLIC cap WHILE an authed caller at the same
// count still has headroom — inverting the branch (anon → general) would let the anon caller past the public
// cap and the assert fails. The `unknown`-sentinel test proves a null-IP anon still throttles (no un-keyed
// hole); the scope-partition test proves the two buckets never share rows.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { rateLimitBuckets } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "@orb/server/foundation/env";
import type { RateLimitDecision } from "@orb/server/transport/trpc";
import { like } from "drizzle-orm";
import { describe } from "vitest";
import { createRateLimitGate } from "../../../packages/server/src/entry/rate-limit-gate";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

const T0 = 1_700_000_000_000;
const PUBLIC_CAP = env.RATE_LIMIT_PUBLIC_IP;
const AUTHED_CAP = env.RATE_LIMIT_AUTHED;

function gate(db: Db): ReturnType<typeof createRateLimitGate> {
  return createRateLimitGate({ db, now: () => T0 });
}

function anon(clientIp: string | null): RateLimitDecision {
  return { path: "chat.send", type: "mutation", principal: null, clientIp };
}

function authed(userId: string, clientIp: string | null = "9.9.9.9"): RateLimitDecision {
  const principal: Principal = {
    userId: castId<UserId>(userId),
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "header",
  };
  return { path: "chat.send", type: "mutation", principal, clientIp };
}

/** Drive `enforce` `n` times, swallowing throws — returns how many were ALLOWED before the first reject. */
async function consumeUntilThrottled(
  enforce: (d: RateLimitDecision) => Promise<void>,
  decision: RateLimitDecision,
  n: number,
): Promise<number> {
  let allowed = 0;
  for (let i = 0; i < n; i += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the fixed-window count is inherently sequential (each consume reads the prior increment).
      await enforce(decision);
      allowed += 1;
    } catch {
      break;
    }
  }
  return allowed;
}

describe("rate-limit gate — the anonymous → tight-bucket failsafe (never keys the loose authed bucket)", () => {
  test("the caps are actually distinct (the inversion is only dangerous because public ≪ authed)", () => {
    // If this ever ceases to hold the failsafe below is meaningless — pin the premise.
    expect(PUBLIC_CAP).toBeLessThan(AUTHED_CAP);
  });

  test("an anonymous caller is throttled at the PUBLIC cap while an authed caller at the same count is NOT", async () => {
    const { enforce } = gate(await freshDb());

    // The anon caller (null principal, keyed on its IP) gets exactly PUBLIC_CAP allowed, then fails closed.
    const anonAllowed = await consumeUntilThrottled(enforce, anon("1.1.1.1"), PUBLIC_CAP + 5);
    expect(anonAllowed).toBe(PUBLIC_CAP);
    await expect(enforce(anon("1.1.1.1"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // THE FAILSAFE: an AUTHED caller driven to the SAME count the anon just hit is still under budget —
    // proving the authed budget is the LOOSE bucket and anon never rode it. An inversion (anon → general)
    // would have let the anon caller sail past PUBLIC_CAP above.
    const authedAllowed = await consumeUntilThrottled(enforce, authed("user_a"), PUBLIC_CAP);
    expect(authedAllowed).toBe(PUBLIC_CAP); // all allowed — the authed cap (600) dwarfs the public (60)
    await expect(enforce(authed("user_a"))).resolves.toBeUndefined();
  });

  test("a null-IP anonymous caller STILL throttles (the `unknown` sentinel — no un-keyed hole)", async () => {
    const { enforce } = gate(await freshDb());

    // No principal AND no clientIp: the gate keys the shared `unknown` sentinel — a fail-closed shared
    // throttle, NOT a silent un-limited pass. It caps at the public cap like any other IP.
    const allowed = await consumeUntilThrottled(enforce, anon(null), PUBLIC_CAP + 5);
    expect(allowed).toBe(PUBLIC_CAP);
    await expect(enforce(anon(null))).rejects.toBeInstanceOf(DomainRateLimitError);
  });

  test("anon and authed write to DISTINCT bucket scopes (public-ip: vs general:) — never shared rows", async () => {
    const db = await freshDb();
    const { enforce } = gate(db);

    await enforce(anon("2.2.2.2"));
    await enforce(authed("user_b"));

    const publicRows = await db
      .select({ key: rateLimitBuckets.key })
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.key, "public-ip:%"));
    const authedRows = await db
      .select({ key: rateLimitBuckets.key })
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.key, "general:%"));

    // Exactly one row in each scope — the anon call keyed public-ip, the authed call keyed general. A gate
    // that keyed the anon call into `general:` (the inversion) would leave `public-ip:` empty.
    expect(publicRows).toHaveLength(1);
    expect(authedRows).toHaveLength(1);
    // The authed row is keyed on the userId, never on an "anon" literal or the IP.
    expect(authedRows[0]?.key).toContain("user_b");
  });
});
