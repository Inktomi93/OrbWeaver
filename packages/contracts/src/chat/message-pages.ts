import type { MessageId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
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
export type MessageWindow =
  | (MessagesPage & {
      readonly outcome: "resolved" | "moved";
      readonly anchorMessageId: MessageId;
      readonly anchorSeq: number;
      readonly endSeq: number;
      readonly endMessageId: MessageId;
      readonly hasBefore: boolean;
      readonly hasAfter: boolean;
    })
  | {
      readonly outcome: "deleted" | "unavailable";
      readonly anchorMessageId: null;
      readonly anchorSeq: null;
      readonly endSeq: null;
      readonly endMessageId: null;
      readonly messages: readonly never[];
      readonly identities: readonly never[];
      readonly hasBefore: false;
      readonly hasAfter: false;
    };

export const messagesPageSchema = z.strictObject({
  messages: z.array(messageViewSchema).readonly(),
  identities: z.array(chatIdentitySchema).readonly(),
}) satisfies z.ZodType<MessagesPage>;
export const messageWindowSchema = z.discriminatedUnion("outcome", [
  messagesPageSchema.extend({
    outcome: z.literal(["resolved", "moved"]),
    anchorMessageId: typeIdSchema(ID_PREFIX.message),
    anchorSeq: z.number(),
    endSeq: z.number(),
    endMessageId: typeIdSchema(ID_PREFIX.message),
    hasBefore: z.boolean(),
    hasAfter: z.boolean(),
  }),
  z.strictObject({
    outcome: z.literal(["deleted", "unavailable"]),
    anchorMessageId: z.null(),
    anchorSeq: z.null(),
    endSeq: z.null(),
    endMessageId: z.null(),
    messages: z.tuple([]).readonly(),
    identities: z.tuple([]).readonly(),
    hasBefore: z.literal(false),
    hasAfter: z.literal(false),
  }),
]) satisfies z.ZodType<MessageWindow>;
