import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { CorpusSourceOutcome } from "../search/source.ts";
import { CORPUS_SOURCE_OUTCOMES } from "../search/source.ts";
import type { MessageView } from "./messages.ts";
import { messageViewSchema } from "./messages.ts";
import type { ChatIdentity } from "./producers.ts";
import { chatIdentitySchema } from "./producers.ts";

/** Each canon page carries identity coverage for its own historical speaker stamps. */
export interface MessagesPage {
  readonly messages: readonly MessageView[];
  readonly identities: readonly ChatIdentity[];
}

/** Source resolution is distinct from ordinary paging and retains its resolved stable endpoints. */
export interface MessageWindow extends MessagesPage {
  readonly outcome: CorpusSourceOutcome;
  readonly anchorMessageId: MessageId | null;
  readonly anchorSeq: number | null;
  readonly endSeq: number | null;
  readonly endMessageId: MessageId | null;
  readonly hasBefore: boolean;
  readonly hasAfter: boolean;
}

export const messagesPageSchema = z.strictObject({
  messages: z.array(messageViewSchema).readonly(),
  identities: z.array(chatIdentitySchema).readonly(),
}) satisfies z.ZodType<MessagesPage>;
export const messageWindowSchema = messagesPageSchema.extend({
  outcome: z.enum(CORPUS_SOURCE_OUTCOMES),
  anchorMessageId: typeIdSchema(ID_PREFIX.message).nullable(),
  anchorSeq: z.number().nullable(),
  endSeq: z.number().nullable(),
  endMessageId: typeIdSchema(ID_PREFIX.message).nullable(),
  hasBefore: z.boolean(),
  hasAfter: z.boolean(),
}) satisfies z.ZodType<MessageWindow>;
