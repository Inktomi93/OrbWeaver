// domain/admin/contract/results — every verb's *Result. Most return the secret-free AdminUserData; the
// session verbs return the port-shaped views or coded primitives.

import type { SessionAdminView } from "@orb/contracts/session";
import type { UserId } from "@orb/kit/ids";
import { z } from "zod";
import type { AdminUserData } from "./views.ts";

export type ListUsersResult = readonly AdminUserData[];
export type SetRoleResult = AdminUserData;
export type SetEnabledResult = AdminUserData;
export type CreateUserResult = AdminUserData;
export type LinkSsoIdentityResult = AdminUserData;
export type ListSessionsResult = readonly SessionAdminView[];

/** B5/#1707 — the outcome shape of the INJECTED sessions link-settlement op: WHY a bind claim bound nothing
 *  (the bind-once capability lives in domain/sessions; admin declares the cross-feature op's TYPE here per
 *  the injected-op rule, and gates + audits around it). Structurally mirrors `UnclaimedLinkOutcome`
 *  (domain/sessions/contract/results.ts) — the composition root maps the real verb into this shape. There is
 *  no `linked` arm on purpose: a bind that LANDED is what the claim statement's own non-empty `RETURNING`
 *  reports inside the audited batch, never a settlement read. */
export type UnclaimedLinkOutcome =
  | { readonly outcome: "already-linked"; readonly userId: UserId }
  | { readonly outcome: "not-found" }
  | { readonly outcome: "target-bound" }
  | { readonly outcome: "subject-taken" };

export interface RevokeUserSessionsResult {
  readonly revoked: number;
}

export const revokeUserSessionsResultSchema = z.strictObject({ revoked: z.int().nonnegative() }) satisfies z.ZodType<RevokeUserSessionsResult>;
