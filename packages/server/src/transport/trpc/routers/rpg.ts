// transport/trpc/routers/rpg — the rpg-game transport surface. Thin: validate → `ctx.services.rpg.<verb>`
// ({ principal: ctx.auth, ...input }) — the `chat.ts` router shape. W2 exposes the FULL verb surface.
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
// The per-game LIVE event stream used to live here as `stream`. It FOLDED into the multiplexed socket at
// SSE-1 S1: it is now the `rpg` ROOM (`transport/trpc/stream/sources/rpg.ts`), which carries the SAME
// chat-membership authority verbatim — accept-always at attach (withhold-not-throw: a game may be born while
// a client is attached), then the `chatEventBounds` probe re-run PER YIELD so a kicked member stops
// receiving. It gained per-room fault isolation on the way: a throw from that probe is now a `roomFailed`
// control frame on a surviving socket instead of a terminal frame that ends the stream. This is also the
// stream whose third-always-on-connection cost caused the measured 2026-08-01 starvation incident; at one
// socket per tab that class no longer exists.

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
import { authedProcedure, t } from "../trpc";

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
});
