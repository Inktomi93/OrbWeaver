// domain/plugin/persistence/distribution — the recipient read a distribution fan-out asks before it lands a copy;
// the consent posture of the copy itself is `substrate/distribution.ts`.

import type { Principal } from "@orb/contracts/identity";
import type { PluginContext } from "../contract/service.ts";
import { getByOwnerSlug } from "./plugins.ts";

/** Does `recipient` already hold `slug`, at ANY version? A distribution never overwrites a row a person
 *  already has — theirs may be newer, older, or simply their own choice, and all three are theirs. */
export async function alreadyHolds(ctx: PluginContext, recipient: Principal, slug: string): Promise<boolean> {
  return (await getByOwnerSlug(ctx.db, recipient.userId, slug)) !== undefined;
}
