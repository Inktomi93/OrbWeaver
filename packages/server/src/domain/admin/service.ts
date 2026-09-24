// domain/admin — COMPOSITION ROOT. Wires the verbs over the injected `AdminContext`. ZERO logic: it
// only calls the verb factories and assembles the `AdminService` (the grouped `sessions` factory
// each return their slice). The `AdminContext` is built at the entry composition root and passed in.

import type { AdminContext } from "./context.ts";
import type { AdminService } from "./contract/service.ts";
import { createCreateUser } from "./verbs/create-user.ts";
import { createEmbed } from "./verbs/embed.ts";
import { createLinkSsoIdentity } from "./verbs/link-sso-identity.ts";
import { createListUsers } from "./verbs/list-users.ts";
import { createResetPassword } from "./verbs/reset-password.ts";
import { createRestart } from "./verbs/restart.ts";
import { createSessions } from "./verbs/sessions.ts";
import { createSetEnabled } from "./verbs/set-enabled.ts";
import { createSetRole } from "./verbs/set-role.ts";

export function createAdminService(ctx: AdminContext): AdminService {
  const sessions = createSessions(ctx);
  return {
    listUsers: createListUsers(ctx),
    setRole: createSetRole(ctx),
    setEnabled: createSetEnabled(ctx),
    createUser: createCreateUser(ctx),
    resetPassword: createResetPassword(ctx),
    linkSsoIdentity: createLinkSsoIdentity(ctx),
    listSessions: sessions.listSessions,
    revokeSession: sessions.revokeSession,
    revokeUserSessions: sessions.revokeUserSessions,
    ...createEmbed(ctx),
    restart: createRestart(ctx),
  };
}
