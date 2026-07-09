// entry/compose/emit-chat-changed — the `chatsChanged` MEMBER-FAN helper (cross-device + multi-human chat-list
// recency; PD user-bus lane). A chat's canon/lifecycle change must reach the live chat LIST of EVERY present
// human member on EVERY device — not just the acting user (multi-human group rooms are a core feature, so a
// member's list must reorder/drop when another member sends/renames/deletes). The per-chat `ChatBusEvent` bus
// reaches only devices SUBSCRIBED to the open chat; this fans the always-on per-USER bus's `chatsChanged` to
// each member's channel.
//
// PRINCIPAL-BLIND SEAM: the engine + verbs call `ctx.emitChatChanged(chatId)` with a bare `ChatId` — NO
// principal, NO acting userId (the turn-identity gate bans a `Principal` in the engine). Membership is derived
// HERE (entry — the composition root, the lawful home for cross-cutting `chat_participants` reads, mirroring
// `resolveUserPublics`/`resolvePromptVariables`), so the acting user's identity never needs to reach the engine.
//
// FAN SCOPE (security): a `chatId` fans ONLY to users who are/were-at-this-moment members of that chat — the
// present-human roster (`kind='human'`, `leftSeq IS NULL`) UNION `extraUserIds` (a just-KICKED/DELETED member
// whose row is about to leave — the caller enumerates them BEFORE the row cascade so their list drops the chat).
// Never a non-member. The isolation test pins this (member B receives on member A's action; non-member C never).
//
// DEFERRAL/DEBOUNCE: one fan per terminal event, no debounce v1 — if a chat ever storms (rapid group turns),
// the hook is here: coalesce per (chatId) inside a short window before enumerating. The bus is a process-local
// EventEmitter, so N member emits are trivial today.

import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import type { EmitChatChanged } from "#domain/chat";
import { publishChatChanged } from "../../transport/trpc";

/** Build the member-fan op ({@link EmitChatChanged}) over the composition root's `db`. Enumerates present human
 *  members of `chatId` (UNION `options.extraUserIds`), then publishes `chatsChanged` to each channel via
 *  transport. `options.detail` ⇒ the emitted event carries `chatId` (drives `getChat` too — the lifecycle/
 *  create/delete case); omitted on the message-commit terminal path (the per-chat bus already drives every
 *  subscribed device's `getChat`). */
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
