// verb: stop — the owner ends the relay; its host leaves the allowlist at once. Sessions minted through it stay valid
// until they expire, so the card offers the per-user sign-out beside this.

import type { ShareParams } from "../contract/params.ts";
import type { ShareContext, ShareService } from "../contract/service.ts";

export function createStop(ctx: Pick<ShareContext, "requireOwner" | "relay" | "statusFor" | "audit" | "now">): ShareService["stop"] {
  return async ({ principal }: ShareParams) => {
    ctx.requireOwner(principal);
    ctx.relay.stop();
    await ctx.audit({ actorUserId: principal.userId, action: "share.stop", entityType: "server" }, ctx.now());
    return ctx.statusFor(principal, ctx.relay.status());
  };
}
