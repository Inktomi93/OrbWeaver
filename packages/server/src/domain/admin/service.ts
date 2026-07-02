// domain/admin — COMPOSITION ROOT. Wires the 11 verbs over the injected `AdminContext`. ZERO logic: it
// only calls the verb factories and assembles the `AdminService` (the grouped `sessions`/`vllm` factories
// each return their slice). The `AdminContext` is built at the entry composition root and passed in.

import type { AdminContext, AdminService } from "./contract/service";
import { createCreateUser } from "./verbs/create-user";
import { createEmbed } from "./verbs/embed";
import { createListUsers } from "./verbs/list-users";
import { createResetPassword } from "./verbs/reset-password";
import { createSessions } from "./verbs/sessions";
import { createSetEnabled } from "./verbs/set-enabled";
import { createSetRole } from "./verbs/set-role";
import { createVllm } from "./verbs/vllm";

export function createAdminService(ctx: AdminContext): AdminService {
  const sessions = createSessions(ctx);
  const vllm = createVllm(ctx);
  return {
    listUsers: createListUsers(ctx),
    setRole: createSetRole(ctx),
    setEnabled: createSetEnabled(ctx),
    createUser: createCreateUser(ctx),
    resetPassword: createResetPassword(ctx),
    listSessions: sessions.listSessions,
    revokeSession: sessions.revokeSession,
    revokeUserSessions: sessions.revokeUserSessions,
    vllmEngines: vllm.vllmEngines,
    restartVllmEngine: vllm.restartVllmEngine,
    ...createEmbed(ctx),
  };
}
