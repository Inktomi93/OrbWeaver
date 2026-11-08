// Every stored account as the owner's admin surface returns it over the wire, each role as its public code.

import type { AdminUserView } from "@orb/contracts/identity";
import type { ServerTestHarness } from "../server.ts";

/** The owner's `admin.listUsers` page: the service hands back captured role data, the router its role code. It
 *  settles the root's background work first, so a read after an authed request never races the seed it started. */
export async function readAccounts(root: Pick<ServerTestHarness, "internalCallerFor" | "ownerId" | "settleBackground">): Promise<readonly AdminUserView[]> {
  await root.settleBackground();
  return await (await root.internalCallerFor(root.ownerId)).admin.listUsers();
}
