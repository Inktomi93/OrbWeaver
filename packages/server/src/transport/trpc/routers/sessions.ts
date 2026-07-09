// transport/trpc/routers/sessions — the auth-session surface. Today it carries ONE procedure: the per-user
// "an entity you own changed" live stream (PD user-bus lane; core/Tier-4-Transport.md). The `sessions` domain
// owns identity/BFF sessions; this stream is TRANSPORT state (the process-local `user-events-bus`), homed on
// the sessions router because the channel key IS the session's principal `userId`.
//
// STANDARD authed procedure — NOT `multiHumanProcedure`. Cross-device freshness is the whole point of the
// lane, so a `single-user` deployment MUST get this stream (a user with two browsers/devices is not a
// multi-human deployment). LIVE-ONLY: no `lastEventId`, no durable replay — the subscription attaches the
// process-local channel for `ctx.auth.userId` and relays. The client gap-heals every (re)connect with a
// blanket invalidate (`use-user-bus.ts`); a dropped tick costs one refetch, so no durable log is warranted.
//
// SCOPE: the channel `userId` is `ctx.auth.userId` — derived from the request principal, NEVER from client
// input. A subscriber can only ever receive its OWN channel; there is no input to widen it.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { UserId } from "@orb/kit/ids";
import { authedProcedure, t } from "../trpc";
import { subscribeUserEvents } from "../user-events-bus";

export const sessionsRouter = t.router({
  // The per-user entity-changed stream (PD user-bus lane). No input (the channel is the principal's own
  // `userId`); no `withSubscriptionErrors` wrapper — the source is a pure in-memory relay that reads no
  // domain (nothing throws a `DomainError` mid-stream), and no `tracked()` — live-only, resume is
  // deliberately unsupported (the client blanket-invalidates on reconnect).
  streamUserEvents: authedProcedure.subscription(({ ctx, signal }) =>
    streamUserEventsFor(ctx.auth.userId, signal ?? new AbortController().signal),
  ),
});

async function* streamUserEventsFor(
  userId: UserId,
  signal: AbortSignal,
): AsyncGenerator<UserBusEvent> {
  yield* subscribeUserEvents(userId, signal);
}
