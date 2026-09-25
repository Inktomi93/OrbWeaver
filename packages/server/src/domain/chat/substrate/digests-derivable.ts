// Can this funder's memory make digests? Digests need the summarize task. With no summarize connection bound they
// are not derivable, the same as Memory off: segments still build, digests pause, and nothing reports a failure.
// The user sees why on the Model roles pane (the Utility model row). Any other unavailability is a real fault.

import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";

export async function digestsDerivable(ctx: Pick<ChatContext, "summarizeAvailability">, funderUserId: UserId): Promise<boolean> {
  const availability = await ctx.summarizeAvailability(funderUserId);
  return availability.available || availability.cause !== "no-connection";
}
