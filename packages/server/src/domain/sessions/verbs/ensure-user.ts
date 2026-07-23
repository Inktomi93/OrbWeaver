import type { Handle, UserId } from "@orb/kit/ids";
import { castId, newId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { SessionsContext, SessionsService } from "../contract/service";
import { insertUser, selectIdByHandle } from "../persistence/users";
import { determineRole } from "../substrate/role-policy";

// Resolve a handle → UserId, JIT-creating the row on first sight (single-user/owner-fallback path;
// externalId stays null — provisionIdentity owns the SSO path). Race-tolerant: insertUser does
// onConflictDoNothing, then we re-read to absorb a concurrent first-login winner.

export function createEnsureUser(ctx: SessionsContext): Pick<SessionsService, "ensureUser"> {
  async function ensureUser(rawHandle: string): Promise<UserId> {
    const handle = castId<Handle>(rawHandle.trim());

    const existing = await selectIdByHandle(ctx.db, handle);
    if (existing !== undefined) {
      return existing;
    }
    const id = newId<UserId>();
    const now = ctx.now();
    const role = determineRole(handle, []);
    await insertUser(ctx.db, {
      id,
      handle,
      externalId: null,
      email: null,
      role,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    getLog().info({ handle }, "user: created tenant row");
    const settled = await selectIdByHandle(ctx.db, handle);
    return settled ?? id;
  }
  return { ensureUser };
}
