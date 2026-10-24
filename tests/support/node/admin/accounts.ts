// Every stored account as the owner's admin surface returns it over the wire, each role as its public code.

import type { AdminUserView } from "@orb/contracts/identity";
import type { ServerTestHarness } from "../server.ts";

/** The owner's `admin.listUsers` page: the service hands back captured role data, the router its role code. */
export async function readAccounts(root: Pick<ServerTestHarness, "internalCallerFor" | "ownerId">): Promise<readonly AdminUserView[]> {
  return await (await root.internalCallerFor(root.ownerId)).admin.listUsers();
}
