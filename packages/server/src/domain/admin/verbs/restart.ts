// verb: restart — the owner ends this process so its supervisor spawns it again. The single-flight latch is set before
// the first await, so two concurrent calls can never both restart; the process is ending, so it never resets.

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { AdminContext } from "../context.ts";
import type { RestartParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireOwner } from "../guard.ts";

const RESTART_UNSUPERVISED = "restart_unsupervised";
const RESTART_INSTANCE_CHANGED = "restart_instance_changed";

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
    // HTTP can reach a new process before the old live connection reports down. Admission binds both observations.
    if (params.expectedServerInstanceId !== ctx.serverRestart.serverInstanceId) {
      throw new DomainOperationError(
        RESTART_INSTANCE_CHANGED,
        "The server changed before this request arrived. Wait for live updates, then confirm the restart again.",
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
