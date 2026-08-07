// verb: bulkRemoveScripts — delete many owned scripts in ONE owner-scoped statement (REGX2). The DB CASCADE
// clears every junction row (global / character / preset / chat) for each deleted script, exactly as the
// single `removeScript` relies on, so a bulk delete cannot leave a dangling attachment anywhere.
//
// Unlike `removeScript` this does NOT throw on a foreign/absent id — a bulk gesture over a list the user can
// see is routinely raced by another device, and a whole-batch abort because one row vanished would be worse
// than the honest count. The `affected` answer is what the caller reports.

import type { RegexContext } from "../../context.ts";
import type { BulkRemoveScriptsParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { removeScriptsBulk } from "../../persistence/queries.ts";

export function createBulkRemove(ctx: RegexContext): RegexService["bulkRemoveScripts"] {
  return async ({ principal, scriptIds }: BulkRemoveScriptsParams) => {
    const ownerId = principal.userId;
    const deleted = await removeScriptsBulk(ctx.db, ownerId, scriptIds);
    if (deleted.length > 0) {
      await ctx.audit(
        { actorUserId: ownerId, action: "regex.bulkRemoveScripts", entityType: "regex_script", metadata: { count: deleted.length, bulk: true } },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
    }
    return { affected: deleted.length };
  };
}
