// Message seeds run the canon writers: a user row is a Simple Send commit, and an assistant history is a transcript
// import (`seedTranscript`). Captures read the D26 slot and its selected variant by the identities production returned.

import type { TurnOutcome } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { ChatService } from "@orb/server/domain/chat";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../server.ts";

type MessageRow = typeof messages.$inferSelect;
type MessageVariantRow = typeof messageVariants.$inferSelect;

interface CapturedTurnRow {
  readonly slot: MessageRow;
  readonly variant: MessageVariantRow;
}
export type CapturedTurnRows = readonly CapturedTurnRow[];

/** The user commit owns send regex, greeting freeze, room claim, seq allocation and persona attribution. */
export async function seedMessage(root: ServerProducerRoot, params: Parameters<ChatService["commitMessage"]>[0]): Promise<CapturedTurnRow> {
  const commitMessage = root.services.chat.commitMessage;
  const outcome = await commitMessage(params);
  const [row, ...rest] = await captureTurnRows(root.db, outcome);
  if (row === undefined || rest.length > 0) {
    throw new Error("production message commit did not write exactly one canonical slot");
  }
  return row;
}

/** Canonical rows come only from the exact message/variant identities returned by the actual turn. */
export async function captureTurnRows(db: Db, outcome: TurnOutcome): Promise<CapturedTurnRows> {
  return await Promise.all(
    outcome.messages.map(async (message) => {
      const row = await db
        .select({ slot: messages, variant: messageVariants })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.messageId, messages.id))
        .where(and(eq(messages.id, message.id), eq(messages.selectedVariantId, message.selectedVariantId), eq(messageVariants.id, message.selectedVariantId)))
        .get();
      if (row === undefined) {
        throw new Error("actual turn message has no matching canonical selected variant");
      }
      return row;
    }),
  );
}

/** A room's whole canon in seq order, each slot joined to the variant it selects. */
export async function captureChatCanonRows(db: Db, chatId: ChatId): Promise<CapturedTurnRows> {
  return await db
    .select({ slot: messages, variant: messageVariants })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId))
    .orderBy(messages.seq);
}
