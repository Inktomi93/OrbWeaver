// verb: removeUnattachedScripts — delete the named owned scripts that sit on no junction, in one owner-scoped
// statement (`removeUnattachedScripts` in the persistence file re-tests every junction inside the DELETE). It serves
// the library's "attached nowhere" sweep and, injected, a preset delete's opt-in clean-up of the scripts only that
// preset used. A script on no junction reaches no room, so unlike `bulk-remove.ts` there is no room reach to fan.

import type { RemoveUnattachedScripts } from "@orb/contracts/regex";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RegexContext } from "#src/domain/regex/contract/service.ts";
import { removeUnattachedScripts } from "#src/domain/regex/persistence/queries.ts";

const REMOVE_UNATTACHED = "regex.removeUnattachedScripts";

export function createRemoveUnattachedScripts(input: DbAssemblyInput<Pick<RegexContext, "db" | "now" | "audit" | "emitUserEvent">>): RemoveUnattachedScripts {
  const ctx = { ...input, db: databaseForOwner(input.db) };
  return async ({ ownerId, scriptIds }) => {
    const deleted = await removeUnattachedScripts(ctx.db, ownerId, scriptIds);
    if (deleted.length > 0) {
      await ctx.audit(
        { actorUserId: ownerId, action: REMOVE_UNATTACHED, entityType: "regex_script", metadata: { count: deleted.length, bulk: true } },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
    }
    return { affected: deleted.length };
  };
}
