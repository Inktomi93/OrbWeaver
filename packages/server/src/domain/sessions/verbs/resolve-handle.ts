// verb: resolveHandle (PD-66) — the EXACT handle→userId lookup for targeted chat invites (chat.md §2:
// "targeted-by-handle (exact resolveHandle, no listing, rate-limited)"). Sessions is the sanctioned
// `users` reader (the no-direct-users-read chokepoint — the loadUserById/PD-73 precedent); chat receives
// this as an injected op. A DISABLED row collapses to null (an un-invitable account is indistinguishable
// from an unknown handle — the provisionIdentity/authenticate posture). Exact match only — no listing,
// no prefix search (the transport rate-limits the probe surface).

import type { Handle, UserId } from "@orb/kit/ids";
import type { SessionsContext, SessionsService } from "../contract/service";
import { selectForProvisionByHandle } from "../persistence/users";

export function createResolveHandle(ctx: SessionsContext): Pick<SessionsService, "resolveHandle"> {
  async function resolveHandle(handle: Handle): Promise<UserId | null> {
    const row = await selectForProvisionByHandle(ctx.db, handle);
    if (row === undefined || !row.enabled) {
      return null;
    }
    return row.id;
  }
  return { resolveHandle };
}
