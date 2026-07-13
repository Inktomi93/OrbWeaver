import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DUMMY_PASSWORD_HASH } from "#infra/auth";
import type { SessionsContext, SessionsService } from "../contract/service";
import { selectAuthByHandle } from "../persistence/users";

// Local password login resolution: (handle, password) → the row's UserId, or null. Four failure shapes
// (unknown handle, SSO-only row, wrong password, disabled row) collapse into one leak-free null, and every
// path burns the same scrypt KDF time (no user-enumeration timing oracle). This verb only resolves; the
// route mints the session + cookie.

export function createAuthenticate(ctx: SessionsContext): Pick<SessionsService, "authenticate"> {
  async function authenticate(rawHandle: string, password: string): Promise<UserId | null> {
    const handle = castId<Handle>(rawHandle.trim());
    const row = await selectAuthByHandle(ctx.db, handle);
    // Constant-time floor: always run the KDF, even for a missing/SSO-only row, against the dummy hash.
    const ok = await ctx.verifyPassword(password, row?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!ok || row === undefined || !row.enabled) {
      return null;
    }
    return row.id;
  }
  return { authenticate };
}
