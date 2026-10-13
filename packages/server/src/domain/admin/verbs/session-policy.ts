import type { AdminSessionPolicyDeps } from "../contract/ops.ts";
import type { AdminContext } from "../contract/service.ts";

/** Admin kicks are per-user, including single-device revokes, so session-less SSO sockets also end. */
export function createAdminSessionPort(deps: AdminSessionPolicyDeps): AdminContext["sessions"] {
  return {
    listForUser: async (userId) => (await deps.listForUser(userId)).map((view) => ({ ...view, userId })),
    revoke: async (sessionId): Promise<void> => {
      const owner = await deps.revoke(sessionId);
      if (owner !== null) {
        deps.evictUserSockets(owner);
      }
    },
    revokeAllForUser: async (userId): Promise<number> => {
      const revoked = await deps.revokeAllForUser(userId);
      deps.evictUserSockets(userId);
      return revoked;
    },
    // Privileged verbs batch the unexecuted revoke, then evict only after commit.
    revokeAllForUserStatement: deps.revokeAllForUserStatement,
    evictUserSockets: (userId): void => {
      deps.evictUserSockets(userId);
    },
    linkExternalIdStatement: deps.linkExternalIdStatement,
    settleUnclaimedLink: deps.settleUnclaimedLink,
    localUserInsertStatement: deps.localUserInsertStatement,
    isReservedHandle: deps.isReservedHandle,
  };
}
