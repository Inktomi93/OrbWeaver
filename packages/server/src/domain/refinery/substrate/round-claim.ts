// domain/refinery/substrate/round-claim — the LEASED in-flight claim on a refinery session (#1568, the
// deferred serializing half of #1445). `iterate` takes it BEFORE it pays for a single model call and clears
// it on both the commit and the failure arm; a second round that cannot take it is refused typed and free.
//
// WHY A LEASE DEADLINE AND NOT A BOOLEAN. A flag says "busy" and nothing ever says otherwise if the process
// holding it dies mid-round — the session is wedged for good, and un-wedging it needs a reaper, a heartbeat,
// or a boot sweep, i.e. exactly the subsystem `verbs/iterate.ts`'s header refused to improvise. A DEADLINE is
// self-clearing: a claim in the past is indistinguishable from no claim, so a crash costs at most the TTL and
// costs it WITHOUT any machinery. `refinery_sessions.inflight_until` is that deadline in epoch ms.
//
// WHY THE COUNTER COULD NOT BE THE CLAIM (the alternative this replaces): pre-bumping `iteration_count` would
// convert it from COMPLETED rounds to STARTED rounds, and a failed round would inflate it permanently —
// `db.transaction` is banned in product code and a compensating decrement can itself fail. This column has no
// such duty: it means one thing, it is never read for a tally, and a stale value expires.
//
// THE TAKE IS ONE CONDITIONAL UPDATE, NEVER A READ-THEN-WRITE. `@orb/db/kit::batch` is the only atomic unit
// and it may not read before it writes, so the predicate rides the write (`inflight_until IS NULL OR
// inflight_until < now`) and the RETURNED ROW COUNT is the verdict — the same shape the invite redeem and the
// standalone variable CAS use. A read-then-write would reopen precisely the window this closes.
//
// THE RELEASE IS GUARDED ON OUR OWN DEADLINE, so a round whose lease already EXPIRED (and whose session was
// legitimately re-claimed by somebody else) cannot clear the new holder's claim on its way out. Two claims can
// never carry the same deadline value: a re-claim happens only at or after our deadline, so its own deadline
// is at least one TTL further out.

import type { Db } from "@orb/db";
import { refinerySessions } from "@orb/db";
import type { RefinerySessionId } from "@orb/kit/ids";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { RefineryRoundClaim } from "../contract/results.ts";

/**
 * How long a taken round claim stays valid without being released.
 *
 * THIS IS A CRASH BACKSTOP, NOT A CORRECTNESS BOUND, and that is what makes the number safe to choose: if it
 * expires while a round is genuinely still running, the session degrades to EXACTLY the pre-#1568 behaviour
 * (two rounds refining off the same analysis) — never to a corrupt tally or a lost run, because the counter is
 * still incremented in SQL and the run log is still append-only. So it is set generously above a real round
 * and read as "how long a crashed process may hold a session".
 *
 * FIFTEEN MINUTES is that generous bound. One round is up to four structured model calls (rewrite + its
 * bounded retry, analyze + its bounded retry), and a streaming runner tolerates a 180s IDLE window per call
 * before it aborts a stalled socket — so ~12 minutes of stall tolerance is reachable by a round that is slow
 * but alive, and a shorter lease would expire underneath it. Fifteen clears that with margin while keeping a
 * genuinely dead round's hold to something a person will wait out rather than report as a stuck session.
 */
export const REFINERY_ROUND_LEASE_MS = 900_000;

/**
 * Take the session's round claim, or `undefined` when another round holds a LIVE one. One conditional UPDATE:
 * the row is claimed iff it currently has no claim or a lapsed one, and the returned row count is the verdict.
 *
 * `updated_at` is deliberately NOT bumped: it is the roster's newest-first sort key, and taking a claim is not
 * a user-visible edit to the session — the round bumps it when it lands its counter.
 */
export async function takeRoundClaim(db: Db, sessionId: RefinerySessionId, now: number): Promise<RefineryRoundClaim | undefined> {
  const leaseUntil = now + REFINERY_ROUND_LEASE_MS;
  const claimed = await db
    .update(refinerySessions)
    .set({ inflightUntil: leaseUntil })
    .where(and(eq(refinerySessions.id, sessionId), or(isNull(refinerySessions.inflightUntil), lt(refinerySessions.inflightUntil, now))))
    .returning({ id: refinerySessions.id });
  return claimed.length > 0 ? { leaseUntil } : undefined;
}

/**
 * Release a claim this round holds. Guarded on the claim's own deadline (see the header): a no-op when the
 * lease already lapsed and somebody else re-claimed, which is the correct outcome — the TTL is what freed the
 * session, and clearing the successor's claim would hand two rounds the same session.
 */
export async function releaseRoundClaim(db: Db, sessionId: RefinerySessionId, claim: RefineryRoundClaim): Promise<void> {
  await db
    .update(refinerySessions)
    .set({ inflightUntil: null })
    .where(and(eq(refinerySessions.id, sessionId), eq(refinerySessions.inflightUntil, claim.leaseUntil)));
}
