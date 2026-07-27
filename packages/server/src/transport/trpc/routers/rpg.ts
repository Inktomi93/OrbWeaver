// transport/trpc/routers/rpg — the rpg-game transport surface. Thin: validate → `ctx.services.rpg.<verb>`
// ({ principal: ctx.auth, ...input }) — the `chat.ts` router shape. W1c-a landed the `stream` subscription
// (the feature-root rpg bus's transport half, rpg-design/05 §4.9); W2 exposes the FULL verb surface.
//
// AUTHZ IS ENTIRELY INSIDE THE VERBS (never a router-tier gate). rpg has NO `ownerId` — a game's authority
// derives `rpg_games.chatId → chat_participants` (D18/D20), resolved by the injected `getMembership` op at
// `domain/rpg/guard.ts`. Every gated verb collapses a non-member to ONE leak-free `DomainNotFound` → NOT_FOUND
// (indistinguishable from a no-game chat — the cross-tenant trust boundary), and a present non-host member
// reaching a host-only plane to `DomainForbidden` → FORBIDDEN (the action, not the chat, is gated). So EVERY
// verb proc here is a chatId-scoped, cross-tenant-sensitive surface: the cross-tenant sweep classifies each
// PROBED (a stranger passing a foreign chatId must see NOT_FOUND), never EXEMPT. `createGame` gates on the
// caller's OWN membership directly (the game row doesn't exist yet) with the SAME leak-free collapse.
//
// Wire input schemas are DERIVED from `@orb/contracts/rpg` (`inputs.ts` — the actor/widget unions + enums are
// reused, never re-spelled at the transport edge, §5.5); the router only wires them to the verbs.
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
import {
  rpgAddJournalEntryInputSchema,
  rpgCreateCheckpointInputSchema,
  rpgCreateGameInputSchema,
  rpgCreateWidgetInputSchema,
  rpgDeleteJournalEntryInputSchema,
  rpgDeleteQuestInputSchema,
  rpgDeleteWidgetInputSchema,
  rpgEditJournalEntryInputSchema,
  rpgEditSnapshotInputSchema,
  rpgListJournalInputSchema,
  rpgPatchSheetInputSchema,
  rpgReadGameInputSchema,
  rpgRestoreCheckpointInputSchema,
  rpgRollDiceInputSchema,
  rpgUpdateConfigInputSchema,
  rpgUpdateWidgetInputSchema,
  rpgUpsertQuestInputSchema,
} from "@orb/contracts/rpg";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import type { ChatService } from "#domain/chat";
import { subscribeRpgEvents } from "#domain/rpg";
import { authedProcedure, t } from "../trpc";

const streamSchema = z.object({ chatId: brandedId<ChatId>() });

export const rpgRouter = t.router({
  // ── writes (host-gated shared planes + member own-row writes; authz INSIDE each verb) ──────────────────
  createGame: authedProcedure.input(rpgCreateGameInputSchema).mutation(({ ctx, input }) => ctx.services.rpg.createGame({ principal: ctx.auth, ...input })),
  updateConfig: authedProcedure
    .input(rpgUpdateConfigInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.updateConfig({ principal: ctx.auth, ...input })),
  patchSheet: authedProcedure.input(rpgPatchSheetInputSchema).mutation(({ ctx, input }) => ctx.services.rpg.patchSheet({ principal: ctx.auth, ...input })),
  editSnapshot: authedProcedure
    .input(rpgEditSnapshotInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.editSnapshot({ principal: ctx.auth, ...input })),
  createWidget: authedProcedure
    .input(rpgCreateWidgetInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.createWidget({ principal: ctx.auth, ...input })),
  updateWidget: authedProcedure
    .input(rpgUpdateWidgetInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.updateWidget({ principal: ctx.auth, ...input })),
  deleteWidget: authedProcedure
    .input(rpgDeleteWidgetInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.deleteWidget({ principal: ctx.auth, ...input })),
  upsertQuest: authedProcedure.input(rpgUpsertQuestInputSchema).mutation(({ ctx, input }) => ctx.services.rpg.upsertQuest({ principal: ctx.auth, ...input })),
  deleteQuest: authedProcedure.input(rpgDeleteQuestInputSchema).mutation(({ ctx, input }) => ctx.services.rpg.deleteQuest({ principal: ctx.auth, ...input })),
  addJournalEntry: authedProcedure
    .input(rpgAddJournalEntryInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.addJournalEntry({ principal: ctx.auth, ...input })),
  editJournalEntry: authedProcedure
    .input(rpgEditJournalEntryInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.editJournalEntry({ principal: ctx.auth, ...input })),
  deleteJournalEntry: authedProcedure
    .input(rpgDeleteJournalEntryInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.deleteJournalEntry({ principal: ctx.auth, ...input })),
  createCheckpoint: authedProcedure
    .input(rpgCreateCheckpointInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.createCheckpoint({ principal: ctx.auth, ...input })),
  restoreCheckpoint: authedProcedure
    .input(rpgRestoreCheckpointInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.restoreCheckpoint({ principal: ctx.auth, ...input })),
  rollDice: authedProcedure.input(rpgRollDiceInputSchema).mutation(({ ctx, input }) => ctx.services.rpg.rollDice({ principal: ctx.auth, ...input })),

  // ── reads (member-gated; getConfigView host-gated — the leak-free NOT_FOUND collapse INSIDE the verb) ──
  getGame: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.getGame({ principal: ctx.auth, ...input })),
  getTrackerView: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.getTrackerView({ principal: ctx.auth, ...input })),
  listJournal: authedProcedure.input(rpgListJournalInputSchema).query(({ ctx, input }) => ctx.services.rpg.listJournal({ principal: ctx.auth, ...input })),
  getConfigView: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.getConfigView({ principal: ctx.auth, ...input })),
  listCheckpoints: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.listCheckpoints({ principal: ctx.auth, ...input })),

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
