// transport/trpc/routers/rpg — the rpg-game transport surface. W1c-a lands ONLY the `stream` subscription
// (the feature-root rpg bus's transport half, rpg-design/05 §4.9); the verb procs (createGame/updateConfig/
// the reads/…) land in W2 with the cross-tenant sweep classification (every proc PROBED).
//
// `stream` — the per-game LIVE event subscription the client's tracker/journal invalidation tails. LIVE-ONLY:
// no `lastEventId`, no durable replay (the rpg bus has no durable half — `domain/rpg/bus.ts`); it attaches the
// process-local channel for the input `chatId` and relays. The client gap-heals every (re)connect with a
// blanket invalidate (the `use-user-bus.ts` posture), so a dropped tick costs one refetch.
//
// AUTHZ: rpg has NO `ownerId` — a game's authority derives `rpg_games.chatId → chat_participants` (D18/D20).
// So the stream gates on CHAT MEMBERSHIP, reusing chat's member-scoped `chatEventBounds` attach probe (a
// `null`/NOT_FOUND return = not a member / no chat ⇒ withhold-not-throw: attach silently, relay nothing until
// seated). The channel key is the input `chatId`, but a non-member never receives an event because the gate
// runs before the relay loop AND per-yield (a kicked member stops receiving). No `tracked()` (live-only,
// resume unsupported) and no `withSubscriptionErrors` — the source is a pure in-memory relay over a
// member-gated attach; nothing throws a `DomainError` mid-stream.

import type { Principal } from "@orb/contracts/identity";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import type { ChatService } from "#domain/chat";
import { subscribeRpgEvents } from "#domain/rpg";
import { authedProcedure, t } from "../trpc";

const streamSchema = z.object({ chatId: brandedId<ChatId>() });

export const rpgRouter = t.router({
  // The per-game live event stream (see the file header for the shape + the chat-membership gate).
  stream: authedProcedure.input(streamSchema).subscription(({ ctx, input, signal }) =>
    rpgEventStream({
      chat: ctx.services.chat,
      principal: ctx.auth,
      chatId: input.chatId,
      signal: signal ?? new AbortController().signal,
    }),
  ),
});

/** Is the caller a present member of `chatId`? Reuses chat's member-scoped attach probe (rpg authority derives
 *  through the chat FK chain). `false` on the withhold-not-throw NOT_FOUND (no chat / not a member). */
async function isChatMember(chat: ChatService, principal: Principal, chatId: ChatId): Promise<boolean> {
  try {
    await chat.chatEventBounds({ principal, chatId });
    return true;
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return false;
    }
    throw err;
  }
}

/** The live-only per-game event generator. Attach the live listener FIRST (`on()` buffers from this point) so
 *  the gate→relay gap loses nothing; then gate membership per-yield so a kicked member stops receiving. */
async function* rpgEventStream(args: {
  readonly chat: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly signal: AbortSignal;
}): AsyncGenerator<RpgBusEvent> {
  const { chat, principal, chatId, signal } = args;
  const live = subscribeRpgEvents(chatId, signal);
  for await (const event of live) {
    if (await isChatMember(chat, principal, chatId)) {
      yield event;
    }
  }
}
