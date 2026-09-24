// entry/rate-limit-gate — the mirror pin for the composition-root bucket adapter (#772 cluster D). The
// SIBLING suite `rate-limiter-inversion.suite.int.test.ts` already owns the two CAP failsafes (anon never
// rides the loose authed bucket; a turn trips at the ai-turn cap) and the live-admin-override read. This
// file pins the three properties that suite structurally cannot see, each of which is a silent throttle
// hole when it breaks:
//
//   1. THE $-SPENDING CLASSIFICATION IS EXACT. `AI_TURN_PATHS` is the ONE home for "which verb spends
//      GPU/$" (Tier-4-Transport §aiTurn). The sibling suite exercises exactly ONE member (`chat.send`) and
//      ONE non-member (`chat.listChats`), so dropping `chat.impersonateStream` from the map — a free-turn
//      leak — is invisible today, and so is ADDING a control verb (`chat.fork`/`abort`/`undoContinue`/
//      `revertContinue` spend nothing and must stay cheap). Every member and every deliberately-excluded
//      path is asserted here by BUCKET ROW, not by cap arithmetic.
//   2. PER-PRINCIPAL / PER-IP ISOLATION. The buckets are keyed on the userId (authed) and the clientIp
//      (anon). A gate that keyed a CONSTANT — or shared the `unknown` sentinel with a real IP — would let
//      one caller's flood throttle everybody else (a trivial DoS on the whole box). Nothing pins that today.
//   3. THE WINDOW IS THE ENV WINDOW. `windowMs: env.RATE_LIMIT_WINDOW_MS` is wired three times by hand; a
//      zero/absent window makes every request its own bucket (the limiter becomes a no-op) and a huge one
//      makes the throttle permanent. Pinned by rolling the injected clock across the boundary.
//
// Plus the debit ORDER consequence: a turn consumes ai-turn BEFORE general, so a turn REFUSED by the
// ai-turn cap does not also burn the caller's general request budget.

import type { Principal } from "@orb/contracts/identity";
import type { AppSettings } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { rateLimitBuckets } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { env } from "@orb/server/foundation/env";
import type { RateLimitDecision } from "@orb/server/transport/trpc";
import { like } from "drizzle-orm";
import { describe } from "vitest";
import { layer } from "../../../packages/server/src/domain/settings/effective-config/layer.ts";
import { createRateLimitGate } from "../../../packages/server/src/entry/rate-limit-gate.ts";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

const WINDOW = env.RATE_LIMIT_WINDOW_MS;
// ALIGNED to a fixed-window boundary on purpose: the limiter floors `now` to `windowStart`, so an arbitrary
// epoch lands mid-window and `T0 + WINDOW - 1` would already have rolled over — the boundary assertions
// below only mean what they say from a bucket start.
const T0 = Math.floor(1_700_000_000_000 / WINDOW) * WINDOW;
const PUBLIC_CAP = env.RATE_LIMIT_PUBLIC_IP;

/** Every path the map classifies as $/GPU-spending — the union `AI_TURN_PATHS` declares. */
const SPENDING_PATHS = [
  "chat.send",
  "chat.swipe",
  "chat.continueTurn",
  "chat.impersonateStream",
  "chat.generate",
  "chat.forceCharacterTurn",
  "chat.generateImage",
] as const;

/** The chat-router verbs the header names as DELIBERATELY excluded (no generation at call time) plus a
 *  plain read — a regression that widened the map would debit these and silently halve the real caps. */
const NON_SPENDING_PATHS = ["chat.fork", "chat.abort", "chat.undoContinue", "chat.revertContinue", "chat.listChats"] as const;

/** A gate over `db` whose clock the test drives (fixed-window rollover) and whose caps are the env floor
 *  unless `overrides` tightens one (the same AppSettings layer an admin edit writes). */
function gateAt(db: Db, clock: { now: number }, overrides: AppSettings = {}): ReturnType<typeof createRateLimitGate> {
  return createRateLimitGate({ db, now: () => clock.now, resolveRateLimits: () => layer(overrides).rateLimits });
}

function principalFor(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "header" };
}

function authedCall(userId: UserId, path: string): RateLimitDecision {
  return { path, type: "mutation", principal: principalFor(userId), clientIp: "9.9.9.9" };
}

/** A test-local UserId mint — the buckets key on it, so the pins below name their callers by brand. */
function uid(raw: string): UserId {
  return castId<UserId>(raw);
}

function anonCall(clientIp: string | null): RateLimitDecision {
  return { path: "chat.listChats", type: "query", principal: null, clientIp };
}

/** Every bucket key under `scope:` — the row is the evidence that the bucket was debited AND how it was keyed. */
async function keysInScope(db: Db, scope: string): Promise<string[]> {
  const rows = await db
    .select({ key: rateLimitBuckets.key })
    .from(rateLimitBuckets)
    .where(like(rateLimitBuckets.key, `${scope}:%`));
  return rows.map((r) => r.key).sort();
}

describe("rate-limit gate — the $/GPU classification is exact (no free-turn leak, no cheap-verb tax)", () => {
  test("EVERY declared spending verb debits the ai-turn bucket (a dropped member is a free turn)", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);

    // One call per spending path, each by its OWN user so a per-path miss is visible as a missing row
    // rather than being absorbed into a shared counter.
    for (const [i, path] of SPENDING_PATHS.entries()) {
      await enforce(authedCall(uid(`user_spend_${i}`), path));
    }

    const aiTurnKeys = await keysInScope(db, "ai-turn");
    expect(aiTurnKeys).toHaveLength(SPENDING_PATHS.length);
    for (const [i] of SPENDING_PATHS.entries()) {
      expect(aiTurnKeys.some((k) => k.includes(`user_spend_${i}`))).toBe(true);
    }
  });

  test("the excluded control + read verbs NEVER debit ai-turn (they stay on the general bucket only)", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);

    for (const [i, path] of NON_SPENDING_PATHS.entries()) {
      await enforce(authedCall(uid(`user_cheap_${i}`), path));
    }

    expect(await keysInScope(db, "ai-turn")).toEqual([]);
    // …but they DID pass through the gate: each landed exactly one general-bucket row.
    expect(await keysInScope(db, "general")).toHaveLength(NON_SPENDING_PATHS.length);
  });

  test("an unknown/new path is NOT classified as spending (classification is opt-IN, never a prefix guess)", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);

    // `chat.sendSomethingElse` shares the `chat.send` PREFIX — a `startsWith` classifier would tax it.
    await enforce(authedCall(uid("user_unknown"), "chat.sendSomethingElse"));
    await enforce(authedCall(uid("user_unknown"), "character.list"));

    expect(await keysInScope(db, "ai-turn")).toEqual([]);
  });

  test("a turn REFUSED by the ai-turn cap does not also burn the caller's general budget (debit order)", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);
    const cap = env.RATE_LIMIT_AI_TURN;

    for (let i = 0; i < cap; i += 1) {
      await enforce(authedCall(uid("user_order"), "chat.send"));
    }
    await expect(enforce(authedCall(uid("user_order"), "chat.send"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // `cap` allowed turns debited general `cap` times; the REFUSED one threw out of ai-turn.consume before
    // the general consume ran, so the general count is still exactly `cap`.
    const rows = await db
      .select({ key: rateLimitBuckets.key, count: rateLimitBuckets.count })
      .from(rateLimitBuckets)
      .where(like(rateLimitBuckets.key, "general:%"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(cap);
  });
});

describe("rate-limit gate — per-principal / per-IP isolation (one caller's flood is not everyone's throttle)", () => {
  test("an EXHAUSTED user does not throttle a second user (buckets are keyed on the userId)", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);
    const cap = env.RATE_LIMIT_AI_TURN;

    for (let i = 0; i < cap; i += 1) {
      await enforce(authedCall(uid("user_flood"), "chat.send"));
    }
    await expect(enforce(authedCall(uid("user_flood"), "chat.send"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // The victim of a shared/constant key would already be refused here.
    await expect(enforce(authedCall(uid("user_bystander"), "chat.send"))).resolves.toBeUndefined();
  });

  // The arm above rides the AI-TURN bucket, which trips first and therefore hides how `general` is keyed —
  // a planted `authedGeneral.consume("all")` passed it (measured). This one tightens the AUTHED cap so the
  // GENERAL bucket is the one that refuses, which is the only way to see its key.
  test("an EXHAUSTED user's GENERAL request budget does not throttle a second user", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock, { rateLimits: { authed: 2 } });

    await enforce(authedCall(uid("user_gen_flood"), "chat.listChats"));
    await enforce(authedCall(uid("user_gen_flood"), "chat.listChats"));
    await expect(enforce(authedCall(uid("user_gen_flood"), "chat.listChats"))).rejects.toBeInstanceOf(DomainRateLimitError);

    await expect(enforce(authedCall(uid("user_gen_bystander"), "chat.listChats"))).resolves.toBeUndefined();
    // …and the rows say why: one bucket per userId, never one shared row.
    const keys = await keysInScope(db, "general");
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k.includes("user_gen_flood"))).toBe(true);
    expect(keys.some((k) => k.includes("user_gen_bystander"))).toBe(true);
  });

  test("an EXHAUSTED IP does not throttle a second IP, and neither shares the `unknown` sentinel", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);

    for (let i = 0; i < PUBLIC_CAP; i += 1) {
      await enforce(anonCall("1.1.1.1"));
    }
    await expect(enforce(anonCall("1.1.1.1"))).rejects.toBeInstanceOf(DomainRateLimitError);

    await expect(enforce(anonCall("2.2.2.2"))).resolves.toBeUndefined();
    // A null-IP caller keys the shared `unknown` sentinel — a SEPARATE bucket from the exhausted IP, so the
    // fail-closed sentinel is not a way to inherit (or to poison) a real IP's budget.
    await expect(enforce(anonCall(null))).resolves.toBeUndefined();

    const keys = await keysInScope(db, "public-ip");
    expect(keys.some((k) => k.includes("1.1.1.1"))).toBe(true);
    expect(keys.some((k) => k.includes("2.2.2.2"))).toBe(true);
    expect(keys.some((k) => k.includes("unknown"))).toBe(true);
  });
});

describe("rate-limit gate — the window is the ENV window (a wrong window silently disables the throttle)", () => {
  test("a throttled caller is STILL throttled one ms before the window boundary, and freed exactly on it", async () => {
    const db = await freshDb();
    const clock = { now: T0 };
    const { enforce } = gateAt(db, clock);
    const cap = env.RATE_LIMIT_AI_TURN;

    for (let i = 0; i < cap; i += 1) {
      await enforce(authedCall(uid("user_window"), "chat.send"));
    }
    await expect(enforce(authedCall(uid("user_window"), "chat.send"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // Fixed window: T0 and T0+WINDOW-1 floor to the SAME bucket start, so the refusal must survive.
    clock.now = T0 + WINDOW - 1;
    await expect(enforce(authedCall(uid("user_window"), "chat.send"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // …and the very next ms opens a fresh bucket. A gate wired with windowMs=0 (or a per-request window)
    // would already have passed the assertion above; a window far larger than env's would fail this one.
    clock.now = T0 + WINDOW;
    await expect(enforce(authedCall(uid("user_window"), "chat.send"))).resolves.toBeUndefined();
  });
});

describe("rate-limit gate — the restart bucket outlives the restart it throttles", () => {
  // The restart bucket's fixed cap and window, mirrored so the test can step to them (`entry/rate-limit-gate.ts`).
  const RestartCap = 3;
  const RestartWindowMs = 600_000;
  const RestartT0 = Math.floor(1_700_000_000_000 / RestartWindowMs) * RestartWindowMs;

  test("past the cap a restart is refused, by a fresh gate over the same db too, until the window rolls", async () => {
    const db = await freshDb();
    const clock = { now: RestartT0 };
    for (let i = 0; i < RestartCap; i += 1) {
      // Each restart ends the process, so every call rides a new gate: only the durable rows carry the count.
      await gateAt(db, clock).enforce(authedCall(uid("user_owner"), "admin.restart"));
    }
    await expect(gateAt(db, clock).enforce(authedCall(uid("user_owner"), "admin.restart"))).rejects.toBeInstanceOf(DomainRateLimitError);
    // Control: the owner's ordinary requests still pass, and the restart bucket reopens with the next window.
    await expect(gateAt(db, clock).enforce(authedCall(uid("user_owner"), "admin.listUsers"))).resolves.toBeUndefined();
    clock.now = RestartT0 + RestartWindowMs;
    await expect(gateAt(db, clock).enforce(authedCall(uid("user_owner"), "admin.restart"))).resolves.toBeUndefined();
    expect(await keysInScope(db, "restart")).toHaveLength(2);
  });
});
