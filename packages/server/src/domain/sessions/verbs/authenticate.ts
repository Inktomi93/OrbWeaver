import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { DUMMY_PASSWORD_HASH } from "#infra/auth";
import type { SessionsContext, SessionsService } from "../contract/service";
import { selectAuthByHandle } from "../persistence/users";

// LOCAL password login resolution (PD-83 — the `authenticate` verb the entry login route was waiting on).
// `(handle, password)` → the row's `UserId`, or `null`. Four failure shapes collapse into ONE leak-free
// null: unknown handle, SSO-only (null-hash) row, wrong password, DISABLED row — and every path burns the
// SAME scrypt KDF time (an unknown/hashless row verifies against `DUMMY_PASSWORD_HASH`, which can never
// match), so there is no user-enumeration timing oracle. The handle is trimmed before lookup (the
// `ensureUser` discipline — a stored row never carries whitespace). The DISABLED gate is checked AFTER the
// verify (constant work) and mirrors `provisionIdentity`'s "disabled → unauthenticated" posture; note the
// session `validate` gate would catch a disabled row on the next request anyway — this just refuses the
// mint up front. This verb only RESOLVES; the route mints the session (`sessions.create`) + the cookie.

export function createAuthenticate(ctx: SessionsContext): Pick<SessionsService, "authenticate"> {
  async function authenticate(rawHandle: string, password: string): Promise<UserId | null> {
    const handle = castId<Handle>(rawHandle.trim());
    const row = await selectAuthByHandle(ctx.db, handle);
    // The constant-time floor: ALWAYS run the KDF — a missing row / SSO-only null hash verifies against
    // the well-formed all-zero dummy (burns the same scrypt cost, can never match).
    const ok = await ctx.verifyPassword(password, row?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!ok || row === undefined || !row.enabled) {
      return null;
    }
    return row.id;
  }
  return { authenticate };
}
