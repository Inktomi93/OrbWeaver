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
// Wire input schemas are DERIVED from `@orb/contracts/rpg` (`inputs.ts` — the actor/tracker shapes + enums are
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
// runs before the relay loop AND per-yield (a kicked member stops receiving).
//
// WRAPPED IN `withSubscriptionErrors`, like every other stream (the `automation.stream` precedent: no durable
// resume, so each yield carries a per-stream ORDINAL as its tracked id — tracked purely so the error frame and
// the events share one envelope shape, which is what the client's discriminant narrowing needs). The old note
// here claimed the wrap was unnecessary because "nothing throws a DomainError mid-stream" — that reasoning was
// wrong twice over: the per-yield `chatEventBounds` probe is a live DB read on every relayed event (it can
// throw anything the chat service throws, not just the NOT_FOUND it catches), and the 2026-08-01 zombie-sub
// investigation showed the COST of being wrong: an unwrapped subscription throw becomes a RETRYABLE tRPC 500,
// which `httpSubscriptionLink` does not report as an error — it reconnects every ~3s forever, re-running the
// generator, while NOT ONE client callback fires. A typed terminal frame is the only failure the client can see.

import type { Principal } from "@orb/contracts/identity";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import {
  rpgAddJournalEntryInputSchema,
  rpgCreateCheckpointInputSchema,
  rpgCreateGameInputSchema,
  rpgDeleteJournalEntryInputSchema,
  rpgDeleteQuestInputSchema,
  rpgEditJournalEntryInputSchema,
  rpgEditSnapshotInputSchema,
  rpgListJournalInputSchema,
  rpgPatchSheetInputSchema,
  rpgPopulateFromCharacterInputSchema,
  rpgReadGameInputSchema,
  rpgRestoreCheckpointInputSchema,
  rpgRollDiceInputSchema,
  rpgUpdateConfigInputSchema,
  rpgUpsertQuestInputSchema,
} from "@orb/contracts/rpg";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { ChatService } from "#domain/chat";
import { subscribeRpgEvents } from "#domain/rpg";
import { withSubscriptionErrors } from "../subscriptions";
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
  // §3.3 dangling-pointer HEAL — HOST-gated (a stamped-id write boundary): null a `metadata.rpg` pointer at a
  // game that no longer exists (a pre-fix fork / any desync). Chat-scoped (the chatId-only read envelope); a
  // non-member collapses to leak-free NOT_FOUND, a non-host member to FORBIDDEN, a LIVE game to a refusal.
  detachDanglingPointer: authedProcedure
    .input(rpgReadGameInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.detachDanglingPointer({ principal: ctx.auth, ...input })),
  // §1.3 resyncFromStory — HOST-gated (a stamped-id write + model-call boundary): re-read a deep story window
  // and rebuild the tracked state. The host authority gate lives INSIDE the verb (`resolveHost`), so a
  // non-member stranger collapses to leak-free NOT_FOUND and a non-host member to FORBIDDEN BEFORE any model
  // call — a member can never trigger the host-principal model call. Chat-scoped (the chatId-only read envelope).
  resyncFromStory: authedProcedure
    .input(rpgReadGameInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.resyncFromStory({ principal: ctx.auth, ...input })),
  // populateFromCharacter — HOST-gated (a stamped-id write + model-call boundary): read ONE character's card +
  // the room's opening line and fill the BORN state (the identity sheet's hand-only title/level, the starting
  // inventory + purse, background-implied quests). The host authority gate lives INSIDE the verb
  // (`resolveHost`), so a non-member collapses to leak-free NOT_FOUND and a non-host member to FORBIDDEN BEFORE
  // any model call. Actor-scoped; an actor with no card is refused there too.
  populateFromCharacter: authedProcedure
    .input(rpgPopulateFromCharacterInputSchema)
    .mutation(({ ctx, input }) => ctx.services.rpg.populateFromCharacter({ principal: ctx.auth, ...input })),

  // ── reads (member-gated; getConfigView host-gated — the leak-free NOT_FOUND collapse INSIDE the verb) ──
  getGame: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.getGame({ principal: ctx.auth, ...input })),
  getTrackerView: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.getTrackerView({ principal: ctx.auth, ...input })),
  listJournal: authedProcedure.input(rpgListJournalInputSchema).query(({ ctx, input }) => ctx.services.rpg.listJournal({ principal: ctx.auth, ...input })),
  getConfigView: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.getConfigView({ principal: ctx.auth, ...input })),
  // §3.6 HOST-reveal read — the eye + standing-lie inventory (host-gated; leak-free NOT_FOUND for a member INSIDE the verb).
  revealHidden: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.revealHidden({ principal: ctx.auth, ...input })),
  listCheckpoints: authedProcedure.input(rpgReadGameInputSchema).query(({ ctx, input }) => ctx.services.rpg.listCheckpoints({ principal: ctx.auth, ...input })),

  // The per-game live event stream (see the file header for the shape + the chat-membership gate).
  stream: authedProcedure.input(streamSchema).subscription(({ ctx, input, signal }) =>
    withSubscriptionErrors(
      rpgEventStream({
        chat: ctx.services.chat,
        principal: ctx.auth,
        chatId: input.chatId,
        signal: signal ?? new AbortController().signal,
      }),
    ),
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
 *  the gate→relay gap loses nothing; then gate membership per-yield so a kicked member stops receiving. The
 *  tracked id is a per-stream ORDINAL, never a durable cursor (there is no durable rpg log to resume from) —
 *  it exists so every yield, including `withSubscriptionErrors`' terminal frame, is one envelope shape. */
async function* rpgEventStream(args: {
  readonly chat: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly signal: AbortSignal;
}): AsyncGenerator<TrackedEnvelope<RpgBusEvent>> {
  const { chat, principal, chatId, signal } = args;
  const live = subscribeRpgEvents(chatId, signal);
  let seq = 0;
  for await (const event of live) {
    if (await isChatMember(chat, principal, chatId)) {
      seq += 1;
      yield tracked(String(seq), event);
    }
  }
}
