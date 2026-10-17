// Internal domain identity comes from the production row resolver, not a fabricated authentication claim.
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { ServerTestHarness } from "../server.ts";

/** Resolve the actual stored role for internal domain work; this does not prove request authentication or enabled admission. */
export async function principal(root: Pick<ServerTestHarness, "principalFor">, userId: UserId): Promise<Principal> {
  return await root.principalFor(userId);
}
