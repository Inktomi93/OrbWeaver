// verb: detachGlobal — clear a script's GLOBAL attachment. Idempotent: an already-absent row returns
// `{detached:false}` rather than throwing (the world-info DetachResult posture).

import { globalRegexScripts } from "@orb/db";
import { eq } from "drizzle-orm";
import type { RegexContext } from "../../context";
import { RegexNotFoundError } from "../../contract/errors";
import type { DetachGlobalParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { loadOwnedScript } from "../../persistence/queries";

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
