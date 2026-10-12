// A redeem rechecks both live admission and row-derived global authority; disabling the minter closes old invites.

import type { SignupMinterCheckOp } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import { isAdmin } from "../guard.ts";

/** D259 — the minter re-check a signup redeem runs before its batch: the live row must be enabled, and its
 *  row-derived Principal (invariant 1) must pass the same global-admin `can()` the mint asked. */

export function createSignupMinterCheck(
  sessions: Pick<SessionsService, "loadUserById">,
  resolvePrincipal: (userId: UserId) => Promise<Principal>,
): SignupMinterCheckOp {
  return async (minterUserId): ReturnType<SignupMinterCheckOp> => {
    const row = await sessions.loadUserById(minterUserId);
    return row?.enabled === true && isAdmin(await resolvePrincipal(minterUserId));
  };
}
