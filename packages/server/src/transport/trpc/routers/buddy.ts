// transport/trpc/routers/buddy — the buddy-agent surface (core/Tier-4-Transport.md). authed; owner-scoped (one
// buddy per user; the borrowed-owner posture, PD-17 deferred). Thin: validate → `ctx.services.buddy.<verb>`
// → map errors. `ask`/`confirm` drive tool-using agent turns; `confirm` is the SOLE executor of a proposal.
//
// `stream` is the observer's per-user live reaction feed (PD-45): the SSE half of the buddy bus (quip /
// moodChanged / evolved). The observer (an out-of-band supervisor started at `entry/`) PRODUCES onto the bus;
// this subscription is the pure CONSUMER — it attaches the live tail, ramps from the short replay ring, then
// yields. There is no durable resume (the bus is the ephemeral live bubble; the hover-history is a separate
// `buddy_quips` read), so events yield plain (no `tracked` cursor). `withSubscriptionErrors` converts a thrown
// frame into a typed error (a subscription bypasses the domain-error middleware — Esoteric #5).

import type { UserId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { BuddyBusEvent } from "#domain/buddy";
import { snapshotBuddy, subscribeBuddy } from "../buddy-bus";
import { withSubscriptionErrors } from "../subscriptions";
import { authedProcedure, t } from "../trpc";

export const buddyRouter = t.router({
  get: authedProcedure.query(({ ctx }) => ctx.services.buddy.get({ principal: ctx.auth })),

  hatch: authedProcedure.mutation(({ ctx }) => ctx.services.buddy.hatch({ principal: ctx.auth })),

  ask: authedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(({ ctx, input }) => ctx.services.buddy.ask({ principal: ctx.auth, message: input.message })),

  confirm: authedProcedure
    .input(
      z.object({
        // @orb-gate-ignore no-raw-id proposalId is the ephemeral in-memory proposal handle (5-min TTL, never persisted), not a branded entity id.
        proposalId: z.string().min(1),
        confirmed: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.buddy.confirm({
        principal: ctx.auth,
        proposalId: input.proposalId,
        confirmed: input.confirmed,
      }),
    ),

  history: authedProcedure.query(({ ctx }) => ctx.services.buddy.history({ principal: ctx.auth })),

  clearChat: authedProcedure.mutation(({ ctx }) => ctx.services.buddy.clearChat({ principal: ctx.auth })),

  setReactions: authedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.buddy.setReactions({ principal: ctx.auth, enabled: input.enabled })),

  setAgency: authedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.buddy.setAgency({ principal: ctx.auth, enabled: input.enabled })),

  // The observer's per-user live reaction feed (PD-45) — the SSE half of the buddy bus. Attaches the live
  // tail, ramps from the retained replay ring, then yields. No durable resume (the hover-history is the
  // separate `buddy_quips` read), so events yield plain.
  stream: authedProcedure.subscription(({ ctx, signal }) => {
    const sig = signal ?? new AbortController().signal;
    return withSubscriptionErrors(buddyStream(ctx.auth.userId, sig));
  }),
});

async function* buddyStream(userId: UserId, signal: AbortSignal): AsyncGenerator<TrackedEnvelope<BuddyBusEvent>> {
  // Attach the live listener FIRST (`on()` buffers from this point) so the snapshot→live gap loses nothing;
  // the overlap (an event in both the ring and the buffered live) is the consumer's dedup (by `quipId`/`at`).
  // The tracked id is a per-stream ordinal — the bus has NO durable resume (the hover-history is the separate
  // `buddy_quips` read), so a reconnect never resumes "from" it; it only satisfies the uniform-tracked rule.
  const live = subscribeBuddy(userId, signal);
  let seq = 0;
  for (const event of snapshotBuddy(userId)) {
    seq += 1;
    yield tracked(String(seq), event);
  }
  for await (const event of live) {
    seq += 1;
    yield tracked(String(seq), event);
  }
}
