// transport/trpc/routers/chat.ts

import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

// Define a few simple schemas to bootstrap the chat router.
const startChatSchema = z.object({
  characterIds: z.array(brandedId<CharacterId>()),
  anchorPersonaId: brandedId<PersonaId>().nullish(),
  title: z.string().nullish(),
  opening: z.any().optional(),
});

const sendSchema = z.object({
  chatId: brandedId<ChatId>(),
  content: z.string(),
  personaId: brandedId<PersonaId>().nullish(),
  blocks: z.array(z.any()).optional(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

const swipeSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

export const chatRouter = t.router({
  startChat: authedProcedure
    .input(startChatSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.startChat({ principal: ctx.auth, ...input })),
  listChats: authedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.chat.listChats({ principal: ctx.auth, ...(input || {}) }),
    ),
  getChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) =>
      ctx.services.chat.getChat({ principal: ctx.auth, chatId: input.chatId }),
    ),
  send: authedProcedure
    .input(sendSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.send({ principal: ctx.auth, ...input })),
  swipe: authedProcedure
    .input(swipeSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.swipe({ principal: ctx.auth, ...input })),
});
