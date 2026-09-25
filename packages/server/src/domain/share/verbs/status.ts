// verb: status — what the owner's Share card shows: the relay state, its URL when up, and the live socket count.

import type { ShareParams } from "../contract/params.ts";
import type { ShareContext, ShareService } from "../contract/service.ts";

export function createStatus(ctx: Pick<ShareContext, "requireOwner" | "relay" | "statusFor">): ShareService["status"] {
  // The gate runs inside the promise, so a refused caller gets a rejection like every other verb, never a sync throw.
  return ({ principal }: ShareParams) =>
    Promise.resolve().then(() => {
      ctx.requireOwner(principal);
      return ctx.statusFor(principal, ctx.relay.status());
    });
}
