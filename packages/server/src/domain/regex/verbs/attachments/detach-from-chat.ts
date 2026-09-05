// verb: detachFromChat — remove a room's script attachment. ROOM authority and ONLY room authority (the
// injected `requireChatHost`); the script's OWNER is deliberately not re-checked, so the sitting host can
// always clean their room — e.g. after a host handoff left a PRIOR host's script attached (#1739).
// Idempotent: an already-absent row is `{detached:false}`, not a throw.
//
// WHY THE OWNERSHIP RE-CHECK CAME OUT. A chat-tier row belongs to the ROOM (D18 — chats carry no ownerId, so
// authority is the membership chain) while the library row belongs to its author, and a handoff moves only
// the first. With `loadOwnedScript` in front of the delete, the incoming host held a transform they could
// neither detach here nor switch off (`updateScript`/`bulkSetScriptsEnabled` are owner-gated by construction,
// and must stay that way — the departed host's library is still theirs), while it kept running on every turn
// of their room. `chat_books`' `detachFromChat` never had that hole and says so in its own header; this
// domain's `applyScopeOrder` chat arm never had it either. Detaching removes the JUNCTION, never the row.
//
// The user-bus emit goes to the ACTING host, not the script's owner: the owner is unknown here precisely
// because it is not re-checked (the world-info twin's wording, and the same trade).

import { chatRegexScripts } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { RegexContext } from "../../context.ts";
import type { DetachFromChatParams } from "../../contract/params.ts";
import type { RegexService } from "../../contract/service.ts";

export function createDetachFromChat(ctx: RegexContext): RegexService["detachFromChat"] {
  return async ({ principal, chatId, scriptId }: DetachFromChatParams) => {
    const actorUserId = principal.userId;
    await ctx.requireChatHost(principal, chatId);
    const at = ctx.now();
    const result = await ctx.db.delete(chatRegexScripts).where(and(eq(chatRegexScripts.chatId, chatId), eq(chatRegexScripts.regexScriptId, scriptId)));
    const detached = result.rowsAffected > 0;
    if (detached) {
      await ctx.audit({ actorUserId, action: "regex.detachFromChat", entityType: "regex_script", entityId: scriptId, metadata: { chatId } }, at);
      ctx.emitUserEvent(actorUserId, { type: "regexChanged", scriptId });
      // #1733 — the room plane (see attach-to-chat). Inside the `detached` guard: a no-op detach moved
      // nothing, so it announces nothing. It is also the ONLY plane that reaches a detached PRIOR host's
      // script (#1739): `regexChanged` is per-USER and fires to the actor, who may not be the row's owner.
      ctx.emitRoomRegexChanged(chatId);
    }
    return { detached };
  };
}
