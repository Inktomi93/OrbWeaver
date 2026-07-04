// transport/trpc/routers/chat — the chat surface (PD-46). Thin: validate → `ctx.services.chat.<verb>`.
// `streamMessages` is the per-chat SSE subscription (core/Tier-4-Transport.md §5 — the load-bearing
// stream shape): attach the live listener FIRST (the transport `chat-events-bus` buffers from that
// instant), replay the durable `chat_events` log on reconnect (`lastEventId` → the member-gated
// `chat.replayChatEvents`), then drain live — every yield `tracked(String(seq), event)` (uniform
// envelopes; the seq IS the durable resume cursor, so a reconnect never re-plays delivered events).
//
// The DRAFT-TOLERANT membership gate WITHHOLDS-not-throws (Tier-4 §5): a NOT_FOUND from the member-gated
// probe (`chatEventBounds`) means "no such chat yet / not (any longer) a member" — the stream yields
// nothing and stays open (a client may subscribe before `chat.start` commits), and the gate runs on
// EVERY live yield so a kicked member's stream stops within the kick tx (the membership chokepoint
// covers the SSE path). Any non-NotFound error propagates into `withSubscriptionErrors`' typed frame.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { generatePictureRequestSchema } from "@orb/contracts/imagery";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { ChatService } from "#domain/chat";
import { subscribeChatEvents } from "../chat-events-bus";
import { withSubscriptionErrors } from "../subscriptions";
import { authedProcedure, t } from "../trpc";

const startChatSchema = z.object({
  characterIds: z.array(brandedId<CharacterId>()),
  anchorPersonaId: brandedId<PersonaId>().nullish(),
  title: z.string().nullish(),
  opening: z.any().optional(),
});

const listMessagesSchema = z.object({
  chatId: brandedId<ChatId>(),
  beforeSeq: z.number().optional(),
  limit: z.number().optional(),
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

// The Stop verb (task #18 — the composer's mid-stream STOP): `ChatService.abort` (domain/chat/verbs/
// turn.ts createAbort) was already fully implemented — active-turns registry, turn-owner-only, an
// idempotent no-op with nothing in flight — but had never been exposed on this router (MISSING-API,
// swept via `sg`/grep before this addition; no test or call site referenced `chat.abort`). Thin
// pass-through, same shape as `getChat` (chatId only — `AbortParams extends ChatScopedParams {}`).
const abortSchema = z.object({ chatId: brandedId<ChatId>() });

const streamSchema = z.object({
  chatId: brandedId<ChatId>(),
  // biome-ignore lint/plugin/no-raw-id: lastEventId is the SSE resume cursor (a `seq` string set by tRPC's Last-Event-ID), not a branded entity id.
  lastEventId: z.string().nullish(),
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
  // A paged canon read (D26), member-gated (`requireParticipant` inside the verb — leak-free NOT_FOUND
  // for a non-member, the same collapse `getChat` uses). `beforeSeq`/`limit` page backwards from the tail.
  listMessages: authedProcedure
    .input(listMessagesSchema)
    .query(({ ctx, input }) => ctx.services.chat.listMessages({ principal: ctx.auth, ...input })),
  send: authedProcedure
    .input(sendSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.send({ principal: ctx.auth, ...input })),
  swipe: authedProcedure
    .input(swipeSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.swipe({ principal: ctx.auth, ...input })),
  abort: authedProcedure
    .input(abortSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.abort({ principal: ctx.auth, ...input })),
  // Generate image(s) in a chat (P5: mode "free" + a required prompt). The wire `size` is Phase-7 (not
  // forwarded); mode/prompt/n map onto `chat.generateImage`.
  generateImage: authedProcedure
    .input(generatePictureRequestSchema.extend({ chatId: brandedId<ChatId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.chat.generateImage({
        principal: ctx.auth,
        chatId: input.chatId,
        mode: input.mode,
        prompt: input.prompt,
        n: input.n,
      }),
    ),

  // The per-chat room-public event stream (PD-46's stream half — see the file header for the shape).
  streamMessages: authedProcedure.input(streamSchema).subscription(({ ctx, input, signal }) =>
    withSubscriptionErrors(
      chatEventStream({
        service: ctx.services.chat,
        principal: ctx.auth,
        chatId: input.chatId,
        lastEventId: input.lastEventId ?? null,
        signal,
      }),
    ),
  ),
});

// The live-first / replay-second per-chat event generator (dedup by monotonic durable `seq`).
async function* chatEventStream(args: {
  readonly service: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly lastEventId: string | null;
  readonly signal: AbortSignal | undefined;
}): AsyncGenerator<TrackedEnvelope<ChatBusEvent>> {
  const { service, principal, chatId, lastEventId, signal } = args;
  const resumeSeq = parseResumeSeq(lastEventId);
  // Attach the live listener FIRST (`on()` buffers from this point) so the replay→live gap loses nothing.
  const live = subscribeChatEvents(chatId, signal ?? new AbortController().signal);
  let maxSeq = resumeSeq ?? 0;

  // Reconnect replay (durable log; member-gated). Withheld — not an error — while the gate says NOT_FOUND.
  if (resumeSeq !== null && (await isMember(service, principal, chatId))) {
    for (const entry of await service.replayChatEvents({
      principal,
      chatId,
      afterSeq: resumeSeq,
    })) {
      yield tracked(String(entry.seq), entry.event);
      maxSeq = entry.seq;
    }
  }

  for await (const entry of live) {
    // Dedup the replay/live overlap (and any out-of-order delivery) by the monotonic `seq`.
    if (entry.seq <= maxSeq) {
      continue;
    }
    // The PER-YIELD membership gate: a kicked member stops receiving within the kick tx; a pre-start
    // subscriber stays open and silent until the room exists and they are seated (withhold-not-throw).
    // biome-ignore lint/performance/noAwaitInLoops: the gate is per-yield BY DESIGN (Tier-4 §5 — the membership chokepoint covers every SSE yield; batching would leak post-kick events).
    if (!(await isMember(service, principal, chatId))) {
      continue;
    }
    yield tracked(String(entry.seq), entry.event);
    maxSeq = entry.seq;
  }
}

// The withhold-not-throw membership probe: NOT_FOUND (no chat / not a member — the leak-free collapse)
// → `false`; anything else is a real fault and propagates.
async function isMember(
  service: ChatService,
  principal: Principal,
  chatId: ChatId,
): Promise<boolean> {
  try {
    await service.chatEventBounds({ principal, chatId });
    return true;
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return false;
    }
    throw err;
  }
}

// A finite, non-error resume cursor, or `null` (first subscribe / a malformed or sentinel id).
function parseResumeSeq(lastEventId: string | null): number | null {
  if (lastEventId === null) {
    return null;
  }
  const parsed = Number(lastEventId);
  return Number.isFinite(parsed) ? parsed : null;
}
