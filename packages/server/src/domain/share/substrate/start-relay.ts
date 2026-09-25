// The seating-then-relay step every start runs, by the owner's card or at boot. A relay that fails to start puts the
// seating back as it found it, so a refused start leaves no public-link setting switched on behind it.

import type { RelayStatus } from "@orb/contracts/identity";
import type { ShareContext } from "../contract/service.ts";

export async function startSeatedRelay(ctx: Pick<ShareContext, "enableSeating" | "relay">): Promise<RelayStatus> {
  const restoreSeating = await ctx.enableSeating();
  try {
    return await ctx.relay.start();
  } catch (err) {
    await restoreSeating();
    throw err;
  }
}
