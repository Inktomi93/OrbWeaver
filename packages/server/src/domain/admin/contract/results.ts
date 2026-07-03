// domain/admin/contract/results — every verb's *Result. Most return the secret-free `AdminUserView`;
// the session/vllm verbs return the port-shaped views or coded primitives.

import type { AdminEngineStatus, AdminUserView, SessionAdminView } from "./views";

// `resetPassword` / `revokeSession` carry no payload — the AdminService interface returns `Promise<void>`
// directly for those (a bare `= void` type alias trips biome's noConfusingVoidType; void belongs in the
// return position, not aliased).
export type ListUsersResult = readonly AdminUserView[];
export type SetRoleResult = AdminUserView;
export type SetEnabledResult = AdminUserView;
export type CreateUserResult = AdminUserView;
export type ListSessionsResult = readonly SessionAdminView[];

/** `{ revoked }` — the count of live sessions the kick-all sweep revoked. */
export interface RevokeUserSessionsResult {
  readonly revoked: number;
}

export type VllmEnginesResult = Readonly<Record<string, AdminEngineStatus>>;

/** A human-oriented status line from the supervisor (e.g. "restart 1/3", "already down — no-op"). */
export type RestartVllmEngineResult = string;
