// domain/admin/contract/results — every verb's *Result. Most return the secret-free AdminUserView; the
// session/vllm verbs return the port-shaped views or coded primitives.

import type { AdminEngineStatus, AdminUserView, SessionAdminView } from "./views";

export type ListUsersResult = readonly AdminUserView[];
export type SetRoleResult = AdminUserView;
export type SetEnabledResult = AdminUserView;
export type CreateUserResult = AdminUserView;
export type ListSessionsResult = readonly SessionAdminView[];

export interface RevokeUserSessionsResult {
  readonly revoked: number;
}

export type VllmEnginesResult = Readonly<Record<string, AdminEngineStatus>>;

export type RestartVllmEngineResult = string;
