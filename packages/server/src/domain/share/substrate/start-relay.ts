// The seating-then-relay step every start runs, by the owner's card or at boot. A relay that fails to start puts the
// seating back as it found it, so a refused start leaves no public-link setting switched on behind it.

import type { RelayStatus } from "@orb/contracts/identity";
import { getLog } from "#foundation/observability";
import type { ShareContext } from "../contract/service.ts";

export async function startSeatedRelay(ctx: Pick<ShareContext, "enableSeating" | "relay">): Promise<RelayStatus> {
  const restoreSeating = await ctx.enableSeating();
  try {
    return await ctx.relay.start();
  } catch (err) {
    // The relay's own error is the answer: the card shows its code and the boot start matches its class. A restore
    // that also fails is logged, never allowed to replace it.
    await restoreSeating().catch((restoreErr: unknown) => {
      getLog().error({ share: true, err: restoreErr }, "share: the relay did not start and the seating could not be put back; check Multi-user");
    });
    throw err;
  }
}
