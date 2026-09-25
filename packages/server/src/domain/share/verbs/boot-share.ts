// verb group: the `SHARE_RELAY` boot start and its resume. They run the same preconditions as `start`, with no caller:
// the launcher asked before any request. A start refused for an unclaimed owner waits for the first-run claim, which
// resumes it in-process, with no restart and no polling.

import { DomainOperationError } from "@orb/kit/errors";
import type { ShareBootOutcome, ShareContext, ShareService } from "../contract/service.ts";

export function createBootShare(ctx: Pick<ShareContext, "refusal" | "relay">): Pick<ShareService, "startAtBoot" | "resumeAfterOwnerClaim"> {
  let waitingForOwner = false;
  const attempt = async (): Promise<ShareBootOutcome> => {
    const refusal = await ctx.refusal();
    waitingForOwner = refusal?.code === "share_owner_unclaimed";
    if (refusal !== null) {
      return { kind: "refused", refusal };
    }
    try {
      return { kind: "started", relay: await ctx.relay.start() };
    } catch (err) {
      if (err instanceof DomainOperationError) {
        return { kind: "failed", code: err.code, message: err.message };
      }
      throw err;
    }
  };
  return {
    startAtBoot: attempt,
    resumeAfterOwnerClaim: (): Promise<ShareBootOutcome> => (waitingForOwner ? attempt() : Promise.resolve({ kind: "not_waiting" })),
  };
}
