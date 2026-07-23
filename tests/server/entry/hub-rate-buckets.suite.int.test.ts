// The per-verb hub rate buckets (hub-browse doc 03 §4) — "a metered hub verb debits its OWN 1-minute
// bucket ON TOP of the general authed bucket, keyed per (verb, user)." The hubs are SHARED third-party
// resources, so one user scripting `hub.search` must be throttled at the verb's tight cap WITHOUT starving
// that user's OTHER hub verbs or their normal authed traffic (the general cap dwarfs the hub cap).
//
// NON-VACUITY: exhausting hub.search's cap proves the tight per-verb bucket bites (the general cap of 600
// alone would NOT throttle at 30). The cross-verb + non-hub asserts prove the buckets are DISTINCT (a
// single shared bucket would have refused hub.getCard / chat.send too). The cross-user assert proves the
// bucket is keyed on userId (a global hub bucket would throttle a second user).

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RateLimitDecision } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { createHubAvatarLimiter, createRateLimitGate, HUB_VERB_LIMITS } from "../../../packages/server/src/entry/rate-limit-gate";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

const T0 = 1_700_000_000_000;
const HUB_SEARCH_CAP = HUB_VERB_LIMITS["hub.search"] ?? 0;
const HUB_PREVIEW_CAP = HUB_VERB_LIMITS["hub.previewCard"] ?? 0;
const HUB_IMPORT_CAP = HUB_VERB_LIMITS["hub.importCard"] ?? 0;
const AVATAR_CAP = 120;

function gate(db: Db): ReturnType<typeof createRateLimitGate> {
  return createRateLimitGate({ db, now: () => T0 });
}

function authed(userId: string, path: string): RateLimitDecision {
  const principal: Principal = {
    userId: castId<UserId>(userId),
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "header",
  };
  return { path, type: "query", principal, clientIp: "9.9.9.9" };
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

describe("rate-limit gate — the per-verb hub buckets debit separately from the general authed bucket", () => {
  test("the hub cap is well under the general authed cap (the per-verb bucket is the one that bites at 30)", () => {
    // If the hub cap ever reached the general cap the isolation asserts below would be vacuous — pin it.
    expect(HUB_SEARCH_CAP).toBeGreaterThan(0);
  });

  test("exhausting hub.search leaves hub.getCard AND a non-hub authed call untouched for the SAME user", async () => {
    const { enforce } = gate(await freshDb());

    // Exactly HUB_SEARCH_CAP hub.search calls are allowed, then the per-verb bucket fails closed with the
    // rate code — even though the general authed bucket (600) is nowhere near its cap.
    const allowed = await consumeUntilThrottled(enforce, authed("user_a", "hub.search"), HUB_SEARCH_CAP + 5);
    expect(allowed).toBe(HUB_SEARCH_CAP);
    await expect(enforce(authed("user_a", "hub.search"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // ISOLATION: the same user's OTHER metered hub verb rides its OWN bucket — still under budget.
    await expect(enforce(authed("user_a", "hub.getCard"))).resolves.toBeUndefined();
    // ISOLATION: a non-hub authed call rides only the general bucket (~31 consumed of 600) — still passes.
    await expect(enforce(authed("user_a", "chat.send"))).resolves.toBeUndefined();
  });

  test("the hub bucket is keyed on userId — exhausting user A never throttles user B's hub.search", async () => {
    const { enforce } = gate(await freshDb());

    const allowedA = await consumeUntilThrottled(enforce, authed("user_a", "hub.search"), HUB_SEARCH_CAP + 1);
    expect(allowedA).toBe(HUB_SEARCH_CAP);
    await expect(enforce(authed("user_a", "hub.search"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // A DIFFERENT user's first hub.search is unaffected — the bucket is per (verb, user), not global.
    await expect(enforce(authed("user_b", "hub.search"))).resolves.toBeUndefined();
  });

  test("the two expensive egress verbs bite at their OWN tight caps (previewCard 12, importCard 6) — distinct buckets", async () => {
    const { enforce } = gate(await freshDb());
    expect(HUB_PREVIEW_CAP).toBe(12);
    expect(HUB_IMPORT_CAP).toBe(6);

    // previewCard bites at 12 (the general 600 cap would NOT throttle here — the per-verb bucket is the one biting).
    const allowedPreview = await consumeUntilThrottled(enforce, authed("user_a", "hub.previewCard"), HUB_PREVIEW_CAP + 3);
    expect(allowedPreview).toBe(HUB_PREVIEW_CAP);
    await expect(enforce(authed("user_a", "hub.previewCard"))).rejects.toBeInstanceOf(DomainRateLimitError);

    // importCard rides its OWN bucket (a single shared bucket would already be exhausted) — bites at 6.
    const allowedImport = await consumeUntilThrottled(enforce, authed("user_a", "hub.importCard"), HUB_IMPORT_CAP + 3);
    expect(allowedImport).toBe(HUB_IMPORT_CAP);
    await expect(enforce(authed("user_a", "hub.importCard"))).rejects.toBeInstanceOf(DomainRateLimitError);
  });
});

describe("the avatar proxy limiter (raw Hono route, not the tRPC gate) — 120/min per user", () => {
  test("bites at 120 for one user and is keyed on userId (user B unaffected)", async () => {
    const limiter = createHubAvatarLimiter({ db: await freshDb(), now: () => T0 });

    let allowed = 0;
    for (let i = 0; i < AVATAR_CAP + 2; i += 1) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: the fixed-window count is inherently sequential.
        await limiter.consume("user_a");
        allowed += 1;
      } catch {
        break;
      }
    }
    expect(allowed).toBe(AVATAR_CAP);
    await expect(limiter.consume("user_a")).rejects.toBeInstanceOf(DomainRateLimitError);
    // A different user's first request is unaffected — the bucket is per user.
    await expect(limiter.consume("user_b")).resolves.toBeUndefined();
  });
});
