// verb: restart — the owner ends this process so its supervisor spawns it again. The single-flight latch is set before
// the first await, so two concurrent calls can never both restart; the process is ending, so it never resets.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { AdminContext } from "../context.ts";
import type { RestartParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireOwner } from "../guard.ts";

const RESTART_UNSUPERVISED = "restart_unsupervised";

export function createRestart(ctx: Pick<AdminContext, "now" | "audit" | "serverRestart">): AdminService["restart"] {
  let requested = false;
  return async (params: RestartParams) => {
    requireOwner(params.principal);
    if (!ctx.serverRestart.supervised) {
      throw new DomainOperationError(
        RESTART_UNSUPERVISED,
        "This server was not started by pnpm start, so nothing would start it again. Restart it the way you started it.",
      );
    }
    if (requested) {
      throw new DomainConflictError("The server is already restarting.");
    }
    requested = true;
    await ctx.audit({ actorUserId: params.principal.userId, action: "admin.restart", entityType: "server" }, ctx.now());
    ctx.serverRestart.restart();
  };
}
