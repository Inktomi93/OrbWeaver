// The `chatsChanged` member fan: a chat's canon or lifecycle change must reach the live chat list of every present
// human member on every device, not only the acting user. The engine calls `emitChatChanged(chatId)` with a bare
// ChatId; membership is derived here from chat's own roster.
//
// Fan scope (security): only users who are members at this moment, plus the caller's `extraUserIds` (a
// just-kicked or deleted member enumerated before the row cascade). Never a non-member.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { getLog } from "#foundation/observability";
import type { ChatContext, EmitChatChanged, PublishChatChangedOp } from "../contract/context.ts";
import { loadPresentHumanUserIds } from "../persistence/participants-read.ts";

export function createEmitChatChanged(input: DbAssemblyInput<Pick<ChatContext, "db" | "logger">>, publishChatChanged: PublishChatChangedOp): EmitChatChanged {
  const ctx = { db: databaseForOwner(input.db) };
  return async (chatId, options = {}): Promise<void> => {
    const payloadChatId = options.detail === true ? chatId : undefined;
    const recipients = new Set(options.extraUserIds ?? []);
    try {
      for (const userId of await loadPresentHumanUserIds(ctx.db, chatId)) {
        recipients.add(userId);
      }
    } catch (err) {
      // Best-effort live delivery — a failed roster read fans only the pre-captured extras (a
      // just-kicked/deleted member still gets their drop); the rest heals on the next client reconnect.
      getLog(input.logger).warn({ err, chatId }, "chat: chatsChanged roster read failed — fanning only the pre-captured recipients");
    }
    for (const userId of recipients) {
      publishChatChanged(userId, payloadChatId);
    }
  };
}
