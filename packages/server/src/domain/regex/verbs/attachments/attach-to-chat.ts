// verb: attachToChat — attach an owned script to a ROOM. HOST authority (the injected `requireChatHost`):
// a room-wide text transform is a one-shot jailbreak surface, exactly the `chat_books` rule. The chat scope
// is MEMBERSHIP-scoped (D18 — chats have no ownerId), so the guard is chat's own, injected at compose;
// regex never reads the roster itself. The SCRIPT side is still plain ownership — a host may only attach
// their own scripts.

import { chatRegexScripts } from "@orb/db";
import type { RegexContext } from "../../context.ts";
import { RegexNotFoundError } from "../../contract/errors.ts";
import type { AttachToChatParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";
import { listChatScripts, loadOwnedScript } from "../../persistence/queries.ts";

export function createAttachToChat(ctx: RegexContext): RegexService["attachToChat"] {
  return async ({ principal, chatId, scriptId }: AttachToChatParams) => {
    const ownerId = principal.userId;
    await ctx.requireChatHost(principal, chatId);
    const script = await loadOwnedScript(ctx.db, ownerId, scriptId);
    if (script === undefined) {
      throw new RegexNotFoundError("regex_script", scriptId);
    }
    const at = ctx.now();
    const position = (await listChatScripts(ctx.db, chatId)).length;
    await ctx.db.insert(chatRegexScripts).values({ chatId, regexScriptId: scriptId, position, createdAt: at }).onConflictDoNothing();
    await ctx.audit({ actorUserId: ownerId, action: "regex.attachToChat", entityType: "regex_script", entityId: scriptId, metadata: { chatId } }, at);
    ctx.emitUserEvent(ownerId, { type: "regexChanged", scriptId });
    // #1733 — the OTHER audience plane. `regexChanged` is per-USER, so without this every other member of
    // this room kept the pre-attach rack until they reloaded.
    ctx.emitRoomRegexChanged(chatId);
  };
}
