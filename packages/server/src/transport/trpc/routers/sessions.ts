// transport/trpc/routers/sessions — the auth-session surface (core/Tier-4-Transport.md). Two procedures:
//   • `me` — the canonical viewer-identity read ("who am I": `userId`/`handle`/`globalRole`). Projected
//     DIRECTLY from the request `Principal` (`ctx.auth`), NOT a `ctx.services.sessions` verb — identity is
//     resolved ONCE at `entry/auth/seam.ts` (Spine-Identity-and-Auth invariant #2: nothing below the seam
//     re-queries identity), and the cookie path already re-reads `role`/`handle` from the `users` row when
//     minting the `Principal`, so the fields are request-fresh with ZERO extra DB round-trip (the same
//     "gate on plain `Principal` fields, no db round-trip" posture `../trpc.ts` states). The `ViewerView`
//     SHAPE homes in `#domain/sessions`; this router only projects into it. Many client surfaces dedupe on
//     this one query (`data/use-viewer.ts`) instead of smearing viewer info onto every per-chat read.
//   • `streamUserEvents` — the per-user "an entity you own changed" live stream (PD user-bus lane). The
//     `sessions` domain owns identity/BFF sessions; this stream is TRANSPORT state (the process-local
//     `user-events-bus`), homed here because the channel key IS the session's principal `userId`.
//
// Both are STANDARD authed procedures — NOT `multiHumanProcedure`. Cross-device freshness is the whole point
// of the stream lane, so a `single-user` deployment MUST get it (a user with two browsers is not a
// multi-human deployment). The stream is LIVE-ONLY: no `lastEventId`, no durable replay — it attaches the
// process-local channel for `ctx.auth.userId` and relays. The client gap-heals every (re)connect with a
// blanket invalidate (`use-user-bus.ts`); a dropped tick costs one refetch, so no durable log is warranted.
//
// SCOPE: `me` reflects ONLY the caller (`ctx.auth`); the stream channel `userId` is `ctx.auth.userId` —
// both derived from the request principal, NEVER from client input. A caller can only ever read/receive its
// OWN identity/channel; there is no input to widen either.

import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { UserId } from "@orb/kit/ids";
import type { ViewerView } from "#domain/sessions";
import { authedProcedure, t } from "../trpc";
import { subscribeUserEvents } from "../user-events-bus";

export const sessionsRouter = t.router({
  // The canonical viewer read — a pure projection of the resolved `Principal` (see file header). No verb,
  // no db round-trip: `role`→`globalRole` and `handle` are already request-fresh on `ctx.auth`.
  me: authedProcedure.query(
    ({ ctx }): ViewerView => ({
      userId: ctx.auth.userId,
      handle: ctx.auth.handle,
      globalRole: ctx.auth.role,
    }),
  ),

  // The per-user entity-changed stream (PD user-bus lane). No input (the channel is the principal's own
  // `userId`); no `withSubscriptionErrors` wrapper — the source is a pure in-memory relay that reads no
  // domain (nothing throws a `DomainError` mid-stream), and no `tracked()` — live-only, resume is
  // deliberately unsupported (the client blanket-invalidates on reconnect).
  streamUserEvents: authedProcedure.subscription(({ ctx, signal }) => streamUserEventsFor(ctx.auth.userId, signal ?? new AbortController().signal)),
});

async function* streamUserEventsFor(userId: UserId, signal: AbortSignal): AsyncGenerator<UserBusEvent> {
  yield* subscribeUserEvents(userId, signal);
}
