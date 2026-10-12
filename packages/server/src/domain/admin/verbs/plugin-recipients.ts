import type { Principal } from "@orb/contracts/identity";
import type { ListPluginRecipients } from "@orb/contracts/plugin";
import type { UserId } from "@orb/kit/ids";
import type { AdminService } from "../contract/service.ts";

/** Resolve only human recipients after the acting administrator's enumeration gate. */

export function createPluginDistributionRecipients(
  admin: Pick<AdminService, "listUsers">,
  resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>,
): ListPluginRecipients {
  return async (caller): Promise<readonly Principal[]> => {
    const rows = await admin.listUsers({ principal: caller, kind: "human" });
    return await Promise.all(rows.map((row) => resolveOwnerPrincipal(row.id)));
  };
}
