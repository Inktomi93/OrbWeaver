// The `chatsChanged` member-fan helper: a chat's canon/lifecycle change must reach the live chat list of
// every present human member on every device, not just the acting user. The engine calls
// `ctx.emitChatChanged(chatId)` with a bare ChatId (principal-blind); membership is derived here.
//
// Fan scope (security): only users who are/were-at-this-moment members — the present-human roster union
// `extraUserIds` (a just-kicked/deleted member enumerated before the row cascade). Never a non-member.

import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { EmitChatChanged } from "#domain/chat";
import { publishChatChanged } from "../../transport/trpc";

/** Build the member-fan op ({@link EmitChatChanged}). `options.detail` ⇒ the emitted event carries `chatId`
 *  (drives `getChat` too, for the lifecycle/create/delete case). */
export function createChatChangedEmitter(db: Db): EmitChatChanged {
  return async (chatId, options = {}): Promise<void> => {
    const payloadChatId = options.detail === true ? chatId : undefined;
    const recipients = new Set<UserId>(options.extraUserIds ?? []);
    try {
      const rows = await db
        .select({ userId: chatParticipants.userId })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.chatId, chatId),
            eq(chatParticipants.kind, "human"),
            isNull(chatParticipants.leftSeq),
          ),
        );
      for (const row of rows) {
        if (row.userId !== null) {
          recipients.add(row.userId);
        }
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
