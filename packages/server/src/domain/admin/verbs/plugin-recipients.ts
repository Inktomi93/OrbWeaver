import type { Principal } from "@orb/contracts/identity";
import type { ListPluginRecipients, ListPluginUserHandles } from "@orb/contracts/plugin";
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

/** Every account's handle, read through the acting administrator's enumeration gate. */
export function createPluginUserHandles(admin: Pick<AdminService, "listUsers">): ListPluginUserHandles {
  return async (caller): Promise<ReadonlyMap<UserId, string>> => {
    const rows = await admin.listUsers({ principal: caller });
    return new Map(rows.map((row) => [row.id, row.handle]));
  };
}
