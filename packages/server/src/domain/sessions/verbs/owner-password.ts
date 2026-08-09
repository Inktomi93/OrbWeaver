// B4 — the local-mode in-app FIRST-RUN owner-password capability. A fresh `AUTH_MODE=local` box seeds the
// owner row with a NULL password (LOCAL_INITIAL_PASSWORD is now optional); the unauthenticated first-run
// route claims it once. Two verbs, both single-homed here because they read/write the owner row's
// `password_hash` — the same column `admin.resetPassword` and boot's `seedOwnerPassword` write:
//
//   • ownerNeedsPassword — REPORT: is the owner row present AND passwordless? Drives the `localFirstRun`
//     config flag the client renders the setup screen on.
//   • claimOwnerPassword — ONE-SHOT WRITE: set the hash ONLY when currently null (atomic, `RETURNING`), so
//     it can NEVER overwrite an existing owner credential (that is resetPassword's owner-gated job) and two
//     concurrent claims can never both win. Takes an already-scrypt'd hash — the entry route hashes with the
//     injected PasswordHasher, keeping crypto out of the resolution tier.

import type { UserId } from "@orb/kit/ids";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { claimOwnerPasswordIfUnset, selectOwnerPasswordState } from "../persistence/users.ts";

export function createOwnerPassword(ctx: SessionsContext): Pick<SessionsService, "ownerNeedsPassword" | "claimOwnerPassword"> {
  async function ownerNeedsPassword(): Promise<boolean> {
    const state = await selectOwnerPasswordState(ctx.db);
    return state !== undefined && !state.hasPassword;
  }

  async function claimOwnerPassword(passwordHash: string): Promise<UserId | null> {
    const claimed = await claimOwnerPasswordIfUnset(ctx.db, passwordHash, ctx.now());
    return claimed ?? null;
  }

  return { ownerNeedsPassword, claimOwnerPassword };
}
