// transport/trpc/routers/stream — the ONE multiplexed subscription surface (SSE-1 §3.1). Three procedures:
//   • `connect` — THE EventSource. One per browser tab, for every room that tab cares about.
//   • `attach` / `detach` — ordinary MUTATIONS on the batched HTTP link. They cost ZERO connections and
//     inherit the CSRF header + rate limit + domain-error middleware every mutation gets.
//
// DELIVERY NEVER RIDES A MUTATION RETURN. `attach` returns `void`; everything a subscriber sees arrives as a
// frame on the socket. That is not stylistic — a replay returned from a BATCHED mutation could interleave
// ahead of live frames already queued on the socket, which is precisely the ordering bug the single-queue
// design exists to make impossible.
//
// AUTHZ: `authedProcedure`, deliberately NOT `multiHumanProcedure` — a single-user deployment must still get
// its user/rpg rooms (the belt is a per-ROOM concern and lives on that room's `authorizeAttach`). The socket
// is bound to ONE principal for its lifetime; a foreign `socketId` collapses to a leak-free NOT_FOUND inside
// the registry, and the per-room verdict is the room source's, unchanged by the fold.
//
// PRESENCE IS THE SOCKET'S (SSE-1 §5.6, owner-ruled §14.4). Device liveness ref-counts the tab's ONE
// connection here, where it used to ref-count the notifications subscription. That is strictly more accurate
// and it is the behavior change the owner took: liveness stops being coupled to the multi-human capability
// belt, so a single-user deployment (which refused the whole notifications router) now registers presence at
// all. The offline→online host-return drain (`drainDeferredTurns` — chat Part III §5) rides the same edge and
// moved with it, unchanged: only on the genuine offline→online transition, fire-and-forget.
//
// CROSS-TENANT SWEEP: all three are PROBED (a stranger attaching a foreign chatId / a foreign socketId).

import { streamAttachInputSchema, streamConnectInputSchema, streamDetachInputSchema } from "@orb/contracts/stream";
import { getLog } from "#foundation/observability";
import { roomSourceFor } from "../stream/room-sources.ts";
import { runSocket } from "../stream/socket.ts";
import { withSubscriptionErrors } from "../subscriptions.ts";
import { authedProcedure, t } from "../trpc.ts";

export const streamRouter = t.router({
  // The ONE socket. `withSubscriptionErrors` wraps it for a genuine SOCKET-level fault; a single room's
  // fault never gets here — it is a `roomFailed` control frame and the socket survives (§5.2).
  connect: authedProcedure.input(streamConnectInputSchema).subscription(({ ctx, input, signal }) => {
    // Adopt EAGERLY, in the RESOLVER: a generator's body does not run until the first pull, which is far too
    // late to refuse a connection. A foreign socketId therefore rejects the subscription with the leak-free
    // NOT_FOUND (and the 9th socket with TOO_MANY_REQUESTS) instead of becoming a frame to interpret.
    const cell = ctx.sockets.adopt(ctx.auth.userId, input.socketId);
    const sig = signal ?? new AbortController().signal;
    // Presence + the host-return drain, in the RESOLVER for the same reason as the adopt: they must happen
    // when the connection is ACCEPTED, not on the consumer's first pull. That is also exactly where the
    // deleted `notifications.notifications` handler ran them, so the ref-count edge is unchanged in timing —
    // only in which stream it counts (§5.6). Released on `sig` abort, so a reconnect re-counts.
    const wasOnline = ctx.presence.read(ctx.auth.userId).online;
    ctx.presence.connect(ctx.auth.userId, sig);
    // Host-return drain (chat Part III §5): a genuinely-offline host reconnecting reclaims the AI turns that
    // DEFERRED onto their box while it was dark. Only on the offline→online edge (not a within-grace
    // reconnect, not a second device/tab). Fire-and-forget — real generation must not block the connect, and
    // an empty queue is a cheap no-op.
    if (!wasOnline) {
      void ctx.services.chat
        .drainDeferredTurns({ hostUserId: ctx.auth.userId })
        .catch((err: unknown) => getLog().error({ err, userId: ctx.auth.userId }, "host-return: deferred-turn drain failed"));
    }
    return withSubscriptionErrors(
      runSocket({
        registry: ctx.sockets,
        cell,
        principal: ctx.auth,
        services: ctx.services,
        multiHumanCapable: ctx.multiHumanCapable,
        signal: sig,
      }),
    );
  }),

  // Authorize FIRST (the room's own gate, at the same moment relative to the live attach it runs today),
  // then record the room. A refusing room throws before anything is recorded.
  attach: authedProcedure.input(streamAttachInputSchema).mutation(async ({ ctx, input }) => {
    await roomSourceFor(input.ref).authorizeAttach({
      ref: input.ref,
      principal: ctx.auth,
      services: ctx.services,
      multiHumanCapable: ctx.multiHumanCapable,
    });
    ctx.sockets.attach(ctx.auth.userId, input.socketId, input.ref, input.sinceSeq ?? null);
  }),

  // Idempotent: detaching an unattached room (or an unknown socket) is a no-op, never an error — a client
  // tearing down after a reconnect must not see a failure for work the server already did.
  detach: authedProcedure.input(streamDetachInputSchema).mutation(({ ctx, input }) => {
    ctx.sockets.detach(ctx.auth.userId, input.socketId, input.ref);
  }),
});
