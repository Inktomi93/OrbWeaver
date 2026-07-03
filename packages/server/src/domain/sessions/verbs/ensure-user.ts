import { isReservedAgentHandle } from "@orb/contracts/identity";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, newId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { SessionsContext, SessionsService } from "../contract/service";
import { insertUser, selectIdByHandle } from "../persistence/users";
import { determineRole } from "../substrate/role-policy";

// Resolve a handle → `UserId`, JIT-creating the row on first sight: the single-user / owner-fallback path
// (keys on `handle`; `externalId` stays NULL — `provisionIdentity` owns the SSO/externalId path). Trim
// before lookup/insert — local login trims the submitted handle, so a row stored with surrounding
// whitespace would never match (silent duplicate user). Race-tolerant: `insertUser` does
// `onConflictDoNothing` on the unique handle, then we re-read to absorb a concurrent first-login winner.

export function createEnsureUser(ctx: SessionsContext): Pick<SessionsService, "ensureUser"> {
  async function ensureUser(rawHandle: string): Promise<UserId> {
    const handle = castId<Handle>(rawHandle.trim());
    // FLAG[PD-17] / agent-principal-design/01 §3.2: refuse the reserved `__agent__` namespace. A forward-header
    // deployment forwarding `X-User: __agent__buddy__<id>` must get a HARD refusal — never a JIT-create, never a
    // match against an agent's row. The impersonation hole the `kind` column would otherwise open.
    if (isReservedAgentHandle(handle)) {
      throw new DomainForbiddenError(
        "the __agent__ handle namespace is reserved for agent principals",
      );
    }
    const existing = await selectIdByHandle(ctx.db, handle);
    if (existing !== undefined) {
      return existing;
    }
    const id = newId<UserId>();
    const now = ctx.now();
    // No groups on this path; `determineRole` yields `owner` for the owner handle, else `user` (D17 —
    // `admin` is never env-derived).
    const role = determineRole(handle, []);
    await insertUser(ctx.db, {
      id,
      handle,
      externalId: null,
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
