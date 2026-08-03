// verb: removeScript — delete an owned script. The DB CASCADE clears every junction row (global / character
// / preset / chat), so a deleted script cannot leave a dangling attachment anywhere — the whole point of the
// FK model over the old id-in-a-blob soft refs. A foreign/absent id is one answer: RegexNotFoundError.

import { regexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { RemoveScriptParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { loadOwnedScript } from "../../persistence/queries.ts";

export function createRemove(ctx: RegexContext): RegexService["removeScript"] {
  return async ({ principal, scriptId }: RemoveScriptParams) => {
    const ownerId = principal.userId;
    const record = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (record === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    await ctx.db.delete(regexScripts).where(and(eq(regexScripts.id, scriptId), eq(regexScripts.ownerId, ownerId)));
    await ctx.audit(
      { actorUserId: ownerId, action: "regex.removeScript", entityType: "regex_script", entityId: scriptId, metadata: { name: record.name } },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    return { deleted: true };
  };
}
