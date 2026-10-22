// verb: detachGlobal — clear a script's GLOBAL attachment. Idempotent: an already-absent row returns
// `{detached:false}` rather than throwing (the world-info DetachResult posture).

import { globalRegexScripts } from "@orb/db";
import { eq } from "drizzle-orm";
import { RegexNotFoundError } from "#src/domain/regex/contract/errors.ts";
import type { DetachGlobalParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { loadOwnedScript } from "#src/domain/regex/persistence/queries.ts";

export function createDetachGlobal(ctx: RegexContext): RegexService["detachGlobal"] {
  return async ({ principal, scriptId }: DetachGlobalParams) => {
    const ownerId = principal.userId;
    const script = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (script === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    const result = await ctx.db.delete(globalRegexScripts).where(eq(globalRegexScripts.regexScriptId, scriptId));
    const detached = result.rowsAffected > 0;
    if (detached) {
      await ctx.audit({ actorUserId: ownerId, action: "regex.detachGlobal", entityType: "regex_script", entityId: scriptId }, at);
      ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    }
    return { detached };
  };
}
