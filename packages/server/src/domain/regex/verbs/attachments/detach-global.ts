// verb: detachGlobal — clear a script's GLOBAL attachment. Idempotent: an already-absent row returns
// `{detached:false}` rather than throwing (the world-info DetachResult posture).

import { globalRegexScripts } from "@orb/db";
import { eq } from "drizzle-orm";
import type { DetachGlobalParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { requireOwnedScript } from "#src/domain/regex/persistence/ownership.ts";

export function createDetachGlobal(ctx: RegexContext): RegexService["detachGlobal"] {
  return async ({ principal, scriptId }: DetachGlobalParams) => {
    const ownerId = principal.userId;
    await requireOwnedScript(ctx.db, ownerId, scriptId);
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
