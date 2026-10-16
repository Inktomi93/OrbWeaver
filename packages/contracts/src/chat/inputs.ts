import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { chatCensusInputSchema } from "./library.ts";
import { CHAT_LIST_MAX_LIMIT, chatListCursorSchema } from "./listing.ts";
import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "./messages.ts";

export const chatListInputSchema = chatCensusInputSchema
  .extend({
    limit: z.int().min(1).max(CHAT_LIST_MAX_LIMIT).optional(),
    cursor: chatListCursorSchema.nullish(),
  })
  .optional();

export const chatIdInputSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

export const listMessagesInputSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  beforeSeq: z.number().optional(),
  // The CEILING, enforced at the trust boundary (the `character.list` precedent): an over-bound ask is a
  // BAD_REQUEST naming the bound, never an unbounded canon fetch (`CHAT_MESSAGE_LIST_MAX_LIMIT`). The domain
  // still applies its own DoS backstop for internal callers.
  limit: z.int().min(1).max(CHAT_MESSAGE_LIST_MAX_LIMIT).optional(),
});
