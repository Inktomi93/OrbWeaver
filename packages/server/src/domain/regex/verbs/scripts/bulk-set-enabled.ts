// verb: bulkSetScriptsEnabled — switch many owned scripts on or off in ONE owner-scoped statement (REGX2).
// `enabled` is a promoted column, so this never touches the behavior blob and cannot disturb a placement set.
//
// Foreign / already-deleted ids simply do not match the WHERE: no throw, no partial abort, and no ownership
// oracle over a list (the `applyScopeOrder` posture). ONE audit row carrying the count and ONE `regexChanged`
// emit — the character `bulkArchive` precedent — because the library's live-freshness arm is a single
// per-owner event (O-7 arm (a)), and N emits for one user gesture would be N refetches of the same list.

import type { RegexContext } from "../../context.ts";
import type { BulkSetScriptsEnabledParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { setScriptsEnabledBulk } from "../../persistence/queries.ts";

export function createBulkSetEnabled(ctx: RegexContext): RegexService["bulkSetScriptsEnabled"] {
  return async ({ principal, scriptIds, enabled }: BulkSetScriptsEnabledParams) => {
    const ownerId = principal.userId;
    // ONE clock read for the whole operation: the write's `updatedAt` and the audit's timestamp are the same
    // instant, so the list stamp can never disagree with the audit row that explains it.
    const at = ctx.now();
    const written = await setScriptsEnabledBulk(ctx.db, ownerId, scriptIds, { enabled, at });
    if (written.length > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: enabled ? "regex.bulkEnableScripts" : "regex.bulkDisableScripts",
          entityType: "regex_script",
          metadata: { count: written.length, bulk: true },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "regexChanged" });
    }
    return { affected: written.length };
  };
}
