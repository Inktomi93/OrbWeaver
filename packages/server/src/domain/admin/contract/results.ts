// domain/admin/contract/results — every verb's *Result. Most return the secret-free AdminUserData; the
// session verbs return the port-shaped views or coded primitives.

import type { SessionAdminView } from "@orb/contracts/session";
import { z } from "zod";
import type { AdminUserData } from "./views.ts";

export type ListUsersResult = readonly AdminUserData[];
export type SetRoleResult = AdminUserData;
export type SetEnabledResult = AdminUserData;
export type CreateUserResult = AdminUserData;
export type LinkSsoIdentityResult = AdminUserData;
export type ListSessionsResult = readonly SessionAdminView[];

export interface RevokeUserSessionsResult {
  readonly revoked: number;
}

export const revokeUserSessionsResultSchema = z.strictObject({ revoked: z.int().nonnegative() }) satisfies z.ZodType<RevokeUserSessionsResult>;
