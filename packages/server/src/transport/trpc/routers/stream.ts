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
// CROSS-TENANT SWEEP: all three are PROBED (a stranger attaching a foreign chatId / a foreign socketId).

import { streamAttachInputSchema, streamConnectInputSchema, streamDetachInputSchema } from "@orb/contracts/stream";
import { roomSourceFor } from "../stream/room-sources";
import { runSocket } from "../stream/socket";
import { withSubscriptionErrors } from "../subscriptions";
import { authedProcedure, t } from "../trpc";

export const streamRouter = t.router({
  // The ONE socket. `withSubscriptionErrors` wraps it for a genuine SOCKET-level fault; a single room's
  // fault never gets here — it is a `roomFailed` control frame and the socket survives (§5.2).
  connect: authedProcedure.input(streamConnectInputSchema).subscription(({ ctx, input, signal }) => {
    // Adopt EAGERLY, in the RESOLVER: a generator's body does not run until the first pull, which is far too
    // late to refuse a connection. A foreign socketId therefore rejects the subscription with the leak-free
    // NOT_FOUND (and the 9th socket with TOO_MANY_REQUESTS) instead of becoming a frame to interpret.
    const cell = ctx.sockets.adopt(ctx.auth.userId, input.socketId);
    return withSubscriptionErrors(
      runSocket({
        registry: ctx.sockets,
        cell,
        principal: ctx.auth,
        services: ctx.services,
        signal: signal ?? new AbortController().signal,
      }),
    );
  }),

  // Authorize FIRST (the room's own gate, at the same moment relative to the live attach it runs today),
  // then record the room. A refusing room throws before anything is recorded.
  attach: authedProcedure.input(streamAttachInputSchema).mutation(async ({ ctx, input }) => {
    await roomSourceFor(input.ref).authorizeAttach({ ref: input.ref, principal: ctx.auth, services: ctx.services });
    ctx.sockets.attach(ctx.auth.userId, input.socketId, input.ref, input.sinceSeq ?? null);
  }),

  // Idempotent: detaching an unattached room (or an unknown socket) is a no-op, never an error — a client
  // tearing down after a reconnect must not see a failure for work the server already did.
  detach: authedProcedure.input(streamDetachInputSchema).mutation(({ ctx, input }) => {
    ctx.sockets.detach(ctx.auth.userId, input.socketId, input.ref);
  }),
});
