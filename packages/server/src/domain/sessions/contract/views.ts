// domain/sessions — read-model views. `SessionView` (the admin device-list projection) is a cross-boundary
// DTO whose canonical home is `@orb/contracts/session` (produced here by `toSessionView`, consumed by
// `admin` via the injected port + the client device table). Re-exported type-only here so domain callers
// name it through the feature's contract surface — NEVER re-declared (one home, §7.4).
//
// `ViewerView` is the canonical "who am I" read — the lean caller-identity projection every client surface
// dedupes on (`sessions.me`; client `data/use-viewer.ts`). It is PROJECTED from the request `Principal` at
// the transport seam (`transport/trpc/routers/sessions.ts`), NOT a persistence read: identity is resolved
// ONCE at `entry/auth/seam.ts` (Spine-Identity-and-Auth invariant #2 — nothing below the seam re-queries
// identity), and the cookie path already RE-READS `role`/`handle` from the `users` row each request when
// building the `Principal`, so the fields are request-fresh with zero extra DB round-trip (the same "gate on
// plain `Principal` fields, NO db round-trip" posture `transport/trpc/trpc.ts` states). No persona join here
// (v1) — the client composes the current persona from its already-cached `persona.list` + user settings.

import type { UserRole } from "@orb/contracts/identity";
import type { Handle, UserId } from "@orb/kit/ids";

export type { SessionView } from "@orb/contracts/session";

/** The canonical viewer identity — projected from the request `Principal` (see file header). `handle` is the
 *  display identity (the `users` table carries no separate display-name column today); `globalRole` is the
 *  global-role axis (USER_ROLES — distinct from a chat resource-role). Immutable within a session (a handle
 *  rename re-mints the session; a `role` grant/revoke reflects on the next full load — server authz always
 *  re-reads the live row, so a stale client `globalRole` is a UI hint, never an authorization). */
export interface ViewerView {
  readonly userId: UserId;
  readonly handle: Handle;
  readonly globalRole: UserRole;
}
