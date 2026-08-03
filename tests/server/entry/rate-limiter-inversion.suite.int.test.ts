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
import type { AppSettings } from "@orb/contracts/settings";
import { parseAppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { rateLimitBuckets } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "@orb/server/foundation/env";
import type { RateLimitDecision } from "@orb/server/transport/trpc";
import { like } from "drizzle-orm";
import { describe } from "vitest";
import { layer } from "../../../packages/server/src/domain/settings/effective-config/layer";
import { createRateLimitGate } from "../../../packages/server/src/entry/rate-limit-gate";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

const T0 = 1_700_000_000_000;
const PUBLIC_CAP = env.RATE_LIMIT_PUBLIC_IP;
const AUTHED_CAP = env.RATE_LIMIT_AUTHED;

// The production gate resolves its caps from the effective-config; with no admin override that is the env
// floor (`layer({}).rateLimits`), so these failsafe assertions still key on the env caps above.
function gate(db: Db): ReturnType<typeof createRateLimitGate> {
  return createRateLimitGate({ db, now: () => T0, resolveRateLimits: () => layer({}).rateLimits });
}

function anon(clientIp: string | null): RateLimitDecision {
  return { path: "chat.send", type: "mutation", principal: null, clientIp };
}

function principalFor(userId: UserId): Principal {
  return {
    userId: castId<UserId>(userId),
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "header",
  };
}

// A NON-turn authed request (a plain query) — hits ONLY the general per-user bucket, never the ai-turn one.
function authed(userId: UserId, clientIp: string | null = "9.9.9.9"): RateLimitDecision {
  return { path: "chat.listChats", type: "query", principal: principalFor(userId), clientIp };
}

// A $/GPU turn request — hits the STRICTER ai-turn bucket AND the general bucket.
function turn(userId: UserId, clientIp: string | null = "9.9.9.9"): RateLimitDecision {
  return { path: "chat.send", type: "mutation", principal: principalFor(userId), clientIp };
}

/** Drive `enforce` `n` times, swallowing throws — returns how many were ALLOWED before the first reject. */
async function consumeUntilThrottled(enforce: (d: RateLimitDecision) => Promise<void>, decision: RateLimitDecision, n: number): Promise<number> {
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
    const authedAllowed = await consumeUntilThrottled(enforce, authed(castId<UserId>("user_a")), PUBLIC_CAP);
    expect(authedAllowed).toBe(PUBLIC_CAP); // all allowed — the authed cap (600) dwarfs the public (60)
    await expect(enforce(authed(castId<UserId>("user_a")))).resolves.toBeUndefined();
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
    await enforce(authed(castId<UserId>("user_b")));

    const publicRows = await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets).where(like(rateLimitBuckets.key, "public-ip:%"));
    const authedRows = await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets).where(like(rateLimitBuckets.key, "general:%"));

    // Exactly one row in each scope — the anon call keyed public-ip, the authed call keyed general. A gate
    // that keyed the anon call into `general:` (the inversion) would leave `public-ip:` empty.
    expect(publicRows).toHaveLength(1);
    expect(authedRows).toHaveLength(1);
    // The authed row is keyed on the userId, never on an "anon" literal or the IP.
    expect(authedRows[0]?.key).toContain("user_b");
  });
});

describe("rate-limit gate — the ai-turn ($/GPU) bucket (stricter than the general request bucket)", () => {
  const aiTurnCap = env.RATE_LIMIT_AI_TURN;

  test("premise: the ai-turn cap is STRICTER than the general (authed) cap", () => {
    expect(aiTurnCap).toBeLessThan(AUTHED_CAP);
  });

  test("a $/GPU turn verb throttles at the ai-turn cap while a plain query at the same count still has headroom", async () => {
    const { enforce } = gate(await freshDb());

    // A stream of `chat.send` (a turn) trips at the ai-turn cap (30), NOT the looser general cap (600).
    const turnsAllowed = await consumeUntilThrottled(enforce, turn(castId<UserId>("user_t")), aiTurnCap + 5);
    expect(turnsAllowed).toBe(aiTurnCap);
    await expect(enforce(turn(castId<UserId>("user_t")))).rejects.toBeInstanceOf(DomainRateLimitError);

    // A DIFFERENT user's plain query driven to the same count is still under the general cap — proving the
    // turn was throttled by the ai-turn bucket, not the general one.
    const queriesAllowed = await consumeUntilThrottled(enforce, authed(castId<UserId>("user_q")), aiTurnCap);
    expect(queriesAllowed).toBe(aiTurnCap);
    await expect(enforce(authed(castId<UserId>("user_q")))).resolves.toBeUndefined();
  });

  test("a turn debits BOTH buckets — it lands rows in ai-turn: AND general: for the same user", async () => {
    const db = await freshDb();
    const { enforce } = gate(db);

    await enforce(turn(castId<UserId>("user_both")));

    const aiTurnRows = await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets).where(like(rateLimitBuckets.key, "ai-turn:%"));
    const generalRows = await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets).where(like(rateLimitBuckets.key, "general:%"));
    expect(aiTurnRows).toHaveLength(1);
    expect(generalRows).toHaveLength(1);
    expect(aiTurnRows[0]?.key).toContain("user_both");
    expect(generalRows[0]?.key).toContain("user_both");
  });

  test("a plain authed query never touches the ai-turn bucket (no free-turn leak the OTHER way — a non-turn stays cheap)", async () => {
    const db = await freshDb();
    const { enforce } = gate(db);

    await enforce(authed(castId<UserId>("user_qonly")));

    const aiTurnRows = await db.select({ key: rateLimitBuckets.key }).from(rateLimitBuckets).where(like(rateLimitBuckets.key, "ai-turn:%"));
    expect(aiTurnRows).toHaveLength(0);
  });
});

describe("rate-limit gate — LIVE admin override (the gate reads the RESOLVED cap fresh per request)", () => {
  test("an admin override to the ai-turn cap takes effect on the next request (no restart)", async () => {
    // The production gate reads `resolveRateLimits()` per consume. Simulate an admin edit by flipping which
    // resolved config the accessor returns mid-session — the very next enforce sees the new cap.
    const db = await freshDb();
    // A mutable holder the accessor closes over — an admin PATCH would flip the resolved config the same way
    // (reloadEffectiveConfig swaps the cached blob); the gate reads it fresh per consume.
    const state: { override: AppSettings } = { override: {} };
    const enforce = createRateLimitGate({
      db,
      now: () => T0,
      resolveRateLimits: () => layer(state.override).rateLimits,
    }).enforce;

    // Admin tightens the ai-turn cap to 2. The next two turns pass; the third trips — proving the new cap
    // was read live, not baked at construction.
    state.override = { rateLimits: { aiTurn: 2 } };
    await expect(enforce(turn(castId<UserId>("user_live")))).resolves.toBeUndefined();
    await expect(enforce(turn(castId<UserId>("user_live")))).resolves.toBeUndefined();
    await expect(enforce(turn(castId<UserId>("user_live")))).rejects.toBeInstanceOf(DomainRateLimitError);
  });

  test("at UNSET override the gate's caps are BYTE-IDENTICAL to the env floor (no silent loosen/tighten)", () => {
    // The security invariant: wiring the settings layer in must not change behavior when no admin override
    // exists. `layer({}).rateLimits` (what the gate resolves with no override) equals the env floors 1:1.
    const resolved = layer({}).rateLimits;
    expect(resolved.publicIp).toBe(env.RATE_LIMIT_PUBLIC_IP);
    expect(resolved.authed).toBe(env.RATE_LIMIT_AUTHED);
    expect(resolved.aiTurn).toBe(env.RATE_LIMIT_AI_TURN);
    expect(resolved.login).toBe(env.RATE_LIMIT_LOGIN);
  });

  test("a set override WINS over the floor", () => {
    expect(layer({ rateLimits: { authed: 42 } }).rateLimits.authed).toBe(42);
    expect(layer({ rateLimits: { aiTurn: 7 } }).rateLimits.aiTurn).toBe(7);
    // an unset field in a partial override still falls to its floor
    expect(layer({ rateLimits: { authed: 42 } }).rateLimits.aiTurn).toBe(env.RATE_LIMIT_AI_TURN);
  });
});

describe("rate-limit gate — bounds/clamp (an absurd or hostile override never LOOSENS or breaks the limiter)", () => {
  test("a 0 / negative cap fails parse → the field drops → the resolver reads the env floor (fail-safe)", () => {
    // 0 and negatives are below the `.int().min(RATE_LIMIT_CAP_MIN)` bound — parse rejects, the whole
    // rateLimits object (the field's `.catch(undefined)` parent) drops, and the floor reads back. An admin
    // can NEVER set an un-capped (0/absurd) limiter through the override.
    expect(parseAppSettings({ rateLimits: { authed: 0 } }).rateLimits).toBeUndefined();
    expect(parseAppSettings({ rateLimits: { aiTurn: -5 } }).rateLimits).toBeUndefined();
    // and the resolver therefore reads the floor, unchanged:
    expect(layer(parseAppSettings({ rateLimits: { authed: 0 } })).rateLimits.authed).toBe(env.RATE_LIMIT_AUTHED);
  });

  test("an absurdly-low cap (below MIN) fails parse → floor (no self-lock at 1/min)", () => {
    // A cap of 1 is technically positive but would DoS the deployment; it's below MIN (5), so it drops.
    expect(parseAppSettings({ rateLimits: { authed: 1 } }).rateLimits).toBeUndefined();
  });

  test("an absurdly-high cap (above MAX) fails parse → floor (no effectively-uncapped hole)", () => {
    expect(parseAppSettings({ rateLimits: { publicIp: 10_000_000 } }).rateLimits).toBeUndefined();
  });

  test("a non-integer / non-number cap fails parse → floor", () => {
    expect(parseAppSettings({ rateLimits: { authed: 42.5 } }).rateLimits).toBeUndefined();
    expect(parseAppSettings({ rateLimits: { authed: "600" } }).rateLimits).toBeUndefined();
  });

  test("a value WITHIN bounds is accepted", () => {
    expect(parseAppSettings({ rateLimits: { authed: 300 } }).rateLimits?.authed).toBe(300);
  });
});
