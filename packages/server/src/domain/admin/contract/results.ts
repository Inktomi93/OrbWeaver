// domain/admin/contract/results — every verb's *Result. Most return the secret-free AdminUserView; the
// session/vllm verbs return the port-shaped views or coded primitives.

import type { UserId } from "@orb/kit/ids";
import type { AdminEngineStatus, AdminUserView, SessionAdminView } from "./views.ts";

export type ListUsersResult = readonly AdminUserView[];
export type SetRoleResult = AdminUserView;
export type SetEnabledResult = AdminUserView;
export type CreateUserResult = AdminUserView;
export type LinkSsoIdentityResult = AdminUserView;
export type ListSessionsResult = readonly SessionAdminView[];

/** B5 — the outcome shape of the INJECTED sessions `linkExternalId` op (the bind-once capability lives in
 *  domain/sessions; admin declares the cross-feature op's TYPE here per the injected-op rule and gates +
 *  audits around it). Structurally mirrors `LinkExternalIdResult` (domain/sessions/contract/results.ts) —
 *  the composition root maps the real verb into this shape. */
export type LinkExternalIdOutcome =
  | { readonly outcome: "linked"; readonly userId: UserId }
  | { readonly outcome: "already-linked"; readonly userId: UserId }
  | { readonly outcome: "not-found" }
  | { readonly outcome: "target-bound" }
  | { readonly outcome: "subject-taken" };

export interface RevokeUserSessionsResult {
  readonly revoked: number;
}

export type VllmEnginesResult = Readonly<Record<string, AdminEngineStatus>>;

// `restartVllmEngine` has NO result alias on purpose: it returns the supervisor's own free-form line
// (or "vllm supervisor not running"), which the admin surface renders as toast prose. There is nothing
// to brand — it is not an identifier — and nothing to narrow, so an alias would add a name and no
// information. Its sibling one tier down already spells it bare (`contract/service.ts` restartEngine).
// An alias must NARROW or BRAND; `pnpm ast stringy` finds the ones that do neither.
