// verb: detachFromChat — remove a room's script attachment. HOST authority (see attach-to-chat).
// Idempotent: an already-absent row is `{detached:false}`, not a throw.

import { chatRegexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context";
import { RegexNotFoundError } from "../../contract/errors";
import type { DetachFromChatParams } from "../../contract/params";
import type { RegexService } from "../../contract/service";
import { loadOwnedScript } from "../../persistence/queries";

export function createDetachFromChat(ctx: RegexContext): RegexService["detachFromChat"] {
  return async ({ principal, chatId, scriptId }: DetachFromChatParams) => {
    const ownerId = principal.userId;
    await ctx.requireChatHost(principal, chatId);
    const script = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (script === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    const result = await ctx.db.delete(chatRegexScripts).where(and(eq(chatRegexScripts.chatId, chatId), eq(chatRegexScripts.regexScriptId, scriptId)));
    const detached = result.rowsAffected > 0;
    if (detached) {
      await ctx.audit({ actorUserId: ownerId, action: "regex.detachFromChat", entityType: "regex_script", entityId: scriptId, metadata: { chatId } }, at);
      ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    }
    return { detached };
  };
}
