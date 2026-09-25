// verb: start — the owner starts the relay. The preconditions run first and refuse with a coded error that names the
// fix; nothing is spawned until every one holds.

import { DomainOperationError } from "@orb/kit/errors";
import type { ShareParams } from "../contract/params.ts";
import type { ShareContext, ShareService } from "../contract/service.ts";

export function createStart(ctx: Pick<ShareContext, "requireOwner" | "refusal" | "relay" | "liveSocketCount" | "audit" | "now">): ShareService["start"] {
  return async ({ principal }: ShareParams) => {
    ctx.requireOwner(principal);
    const refusal = await ctx.refusal();
    if (refusal !== null) {
      throw new DomainOperationError(refusal.code, refusal.message);
    }
    const relay = await ctx.relay.start();
    await ctx.audit({ actorUserId: principal.userId, action: "share.start", entityType: "server", metadata: { relay: relay.state } }, ctx.now());
    return { relay, liveSocketCount: ctx.liveSocketCount() };
  };
}
