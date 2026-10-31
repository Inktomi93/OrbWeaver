// verb: attachGlobal — mark an owned script GLOBAL (it runs in every chat the caller hosts). The gate is
// plain script ownership; the junction's PK IS the script id, so the write is idempotent by construction.
// `position` orders the global TIER against itself (the executor applies its input list in order).

import { globalRegexScripts } from "@orb/db";
import type { AttachGlobalParams } from "#src/domain/regex/contract/params.ts";
import type { RegexContext, RegexService } from "#src/domain/regex/contract/service.ts";
import { requireOwnedScript } from "#src/domain/regex/persistence/ownership.ts";
import { listGlobalScripts } from "#src/domain/regex/persistence/queries.ts";

export function createAttachGlobal(ctx: RegexContext): RegexService["attachGlobal"] {
  return async ({ principal, scriptId }: AttachGlobalParams) => {
    const ownerId = principal.userId;
    await requireOwnedScript(ctx.db, ownerId, scriptId);
    const at = ctx.now();
    // Append at the end of the owner's current global tier — a new attachment never silently reorders one.
    const position = (await listGlobalScripts(ctx.db, ownerId)).length;
    await ctx.db.insert(globalRegexScripts).values({ regexScriptId: scriptId, position, createdAt: at }).onConflictDoNothing();
    await ctx.audit({ actorUserId: ownerId, action: "regex.attachGlobal", entityType: "regex_script", entityId: scriptId }, at);
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
  };
}
