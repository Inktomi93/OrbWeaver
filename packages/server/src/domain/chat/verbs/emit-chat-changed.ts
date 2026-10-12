// The `chatsChanged` member fan: a chat's canon or lifecycle change must reach the live chat list of every present
// human member on every device, not only the acting user. The engine calls `emitChatChanged(chatId)` with a bare
// ChatId; membership is derived here from chat's own roster.
//
// Fan scope (security): only users who are members at this moment, plus the caller's `extraUserIds` (a
// just-kicked or deleted member enumerated before the row cascade). Never a non-member.

import type { ChatContext } from "../context.ts";
import type { EmitChatChanged, PublishChatChangedOp } from "../contract/context.ts";
import { loadPresentHumanUserIds } from "../persistence/participants-read.ts";

export function createEmitChatChanged(ctx: Pick<ChatContext, "db">, publishChatChanged: PublishChatChangedOp): EmitChatChanged {
  return async (chatId, options = {}): Promise<void> => {
    const payloadChatId = options.detail === true ? chatId : undefined;
    const recipients = new Set(options.extraUserIds ?? []);
    // @orb-waive caught-failure-ownership(catch): best-effort — documented below: a failed roster
    // read fans only the pre-captured extras; the rest heals on the next client reconnect (this is a live-
    // notification fan-out, not the durable write itself). Ends if a client stops reconnect-healing.
    try {
      for (const userId of await loadPresentHumanUserIds(ctx.db, chatId)) {
        recipients.add(userId);
      }
    } catch {
      // Best-effort live delivery — a failed roster read fans only the pre-captured extras (a
      // just-kicked/deleted member still gets their drop); the rest heals on the next client reconnect.
    }
    for (const userId of recipients) {
      publishChatChanged(userId, payloadChatId);
    }
  };
}
