// transport/trpc/routers/sessions — the auth-session surface (core/Tier-4-Transport.md). Two procedures:
//   • `me` — the canonical viewer-identity read ("who am I": `userId`/`handle`/`globalRole`). Projected
//     DIRECTLY from the request `Principal` (`ctx.auth`), NOT a `ctx.services.sessions` verb — identity is
//     resolved ONCE at `entry/auth/seam.ts` (Spine-Identity-and-Auth invariant #2: nothing below the seam
//     re-queries identity), and the cookie path already re-reads `role`/`handle` from the `users` row when
//     minting the `Principal`, so the fields are request-fresh with ZERO extra DB round-trip (the same
//     "gate on plain `Principal` fields, no db round-trip" posture `../trpc.ts` states). The `ViewerView`
//     SHAPE homes in `#domain/sessions`; this router only projects into it. Many client surfaces dedupe on
//     this one query (`data/use-viewer.ts`) instead of smearing viewer info onto every per-chat read.
//
// The per-user entity-changed live stream used to live here as `streamUserEvents`. It FOLDED into the
// multiplexed socket at SSE-1 S1: it is now the `user` ROOM (`transport/trpc/stream/sources/user.ts`), which
// carries the same live-only relay with the same "the channel key IS the principal's own userId" scoping.
// Nothing about the stream's semantics changed; it stopped costing a browser connection.
//
// SCOPE: `me` reflects ONLY the caller (`ctx.auth`) — derived from the request principal, NEVER from client
// input. A caller can only ever read its OWN identity; there is no input to widen it.

import type { ViewerView } from "#domain/sessions";
import { authedProcedure, t } from "../trpc.ts";

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
});
