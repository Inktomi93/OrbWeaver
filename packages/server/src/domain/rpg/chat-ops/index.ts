// domain/rpg/chat-ops — the `RpgChatOps` runtime (D58). This is the ops object rpg EXPOSES for chat's
// `ChatContext.rpg` slot (a null-op when rpg isn't wired); the composition root hands it to chat. The ops are
// PRINCIPAL-FREE (chat gated the turn's caller); each resolves game-ness by the row and is a byte-identical no-op
// for a non-game chat. Rpg imports nothing from chat (Core-0 §4): each op is typed by the `@orb/contracts` op type
// chat's slot also names.
//
// The delivery-mode branch (§4.6 amendment) lives in the gather (terminal tools vs none) + the flush (fold the
// turn's own calls vs run the dedicated post-commit round). See `./gather` + `./flush`.

import type { GatherTurnContextArgs, RpgTurnCompletedParams } from "@orb/contracts/chat";
import type { RpgExtractionMode } from "@orb/contracts/rpg";
import { isDeceptionActive } from "@orb/contracts/rpg";
import { statementToken } from "@orb/db/wiring-owner";
import type { ChatId, MessageId, PresetId } from "@orb/kit/ids";
import { createRpgContext } from "../context.ts";
import type { RpgChatOps, RpgGatherResult, RpgTurnContext } from "../contract/chat-turn.ts";
import type { RpgAssemblyContext } from "../contract/service.ts";
import { planLiteGameBirth } from "../game-mint.ts";
import { findGameByChat } from "../persistence/games.ts";
import { commitSnapshotForVariant, findLastAssistantSelectedVariant, findMessageSeq } from "../persistence/snapshots.ts";
import { flushTurn } from "./flush.ts";
import { forkGame } from "./fork-game.ts";
import { gatherTurnContext } from "./gather.ts";
import { handoffHealStatements, handoffRekeyActors, handoffWouldCopyGmPreset } from "./handoff-heal.ts";

/** Build the {@link RpgChatOps} runtime over the rpg ctx (D58). Handed to chat at the composition root; NOT
 *  wired here. The gather + flush hold the extractionMode branch; the rest are thin ctx reads/writes. */
export function createRpgChatOps(input: RpgAssemblyContext): RpgChatOps {
  const ctx = createRpgContext(input);
  // #40 — the disengage chokepoint: a game whose front-door toggle is OFF behaves as NO GAME in every
  // chat-op (gather/flush/preset/reasoning/commit) — the turn assembly is byte-identical to a non-game
  // chat while the rows stay preserved for re-enable.
  async function findEngagedGame(chatId: ChatId): Promise<Awaited<ReturnType<typeof findGameByChat>>> {
    const game = await findGameByChat(ctx.db, chatId);
    return game?.config.engaged === true ? game : undefined;
  }

  // KNOB-DRIVEN, MODE-BLIND (§3.2 / ratification #2): the game's `gmPresetId` (born NULL = augment the user's
  // own preset), or null for a non-game chat. Full changes only what SEEDS the knob, never this read.
  async function resolvePresetOverride(chatId: ChatId): Promise<PresetId | null> {
    const game = await findEngagedGame(chatId);
    return game?.gmPresetId ?? null;
  }

  // SEND path: lock in the state the user was replying to (the last visible assistant slot's snapshot,
  // committed 0 → 1). A non-game/disengaged chat / a vanished message / a first user turn is a
  // byte-identical no-op.
  async function onUserCommit(chatId: ChatId, messageId: MessageId): Promise<void> {
    const game = await findEngagedGame(chatId);
    if (game === undefined) {
      return;
    }
    const userSeq = await findMessageSeq(ctx.db, messageId);
    if (userSeq === undefined) {
      return;
    }
    const variantId = await findLastAssistantSelectedVariant(ctx.db, chatId, userSeq);
    if (variantId !== undefined) {
      await commitSnapshotForVariant(ctx.db, variantId);
    }
  }

  // Post-turn FLUSH (§2.4-2.5 + §4.6): folded = fold the character turn's own calls into the accumulator;
  // cheap = run the dedicated post-commit tool round first. Then take + write, keyed by `turnId`. Non-game = no-op.
  //
  // FLUSH BARRIER (the race fix): the flush is fire-and-forget (engine.ts — a background write must never abort
  // a committed reply), but with the dedicated state round it takes 0.8-2.9s, so a fast re-send could assemble
  // the next reminder off STALE state. The barrier register MUST be SYNCHRONOUS — before ANY await — or a
  // scripted immediate re-send beats the `findGameByChat` await, `awaitInFlight` sees no entry, and it
  // assembles stale (LIVE-CAUGHT: ex2 read empty while ex1's flush was in flight). So `runFlush` (which does
  // the game lookup + flush INSIDE) is handed to the barrier, which invokes it SYNCHRONOUSLY — the in-flight
  // entry exists the instant `onTurnCompleted` is called, before it yields.
  //
  // The barrier registration is ALSO the round's cancellation scope (it mints the signal `runFlush` receives and
  // owns the owner-scoped `cancel` the chat `abort` verb reaches through). One registry, because "which rounds
  // are in flight" is the same question both answer — see `flush-barrier.ts` for why the turn's own signal
  // cannot serve here.
  function onTurnCompleted({ chatId, messageId, variantId, turnId, turn }: RpgTurnCompletedParams<RpgTurnContext>): Promise<void> {
    const runFlush = async (signal: AbortSignal): Promise<void> => {
      const game = await findEngagedGame(chatId); // disengaged (#40) ⇒ no state round, no snapshot write
      if (game === undefined) {
        return;
      }
      const mode: RpgExtractionMode = game.config.extractionMode;
      // `turn` is the character turn's already-resolved route + consent verdict — the state round rides it
      // (F1: no second `resolveRole`, no force-stamped consent; F2: the readonly gate reads this capability).
      await flushTurn(ctx, game, mode, { turnId, messageId, variantId, turnConnection: turn, signal });
    };
    return ctx.flushBarrier.register({ chatId, ownerUserId: turn.triggeredBy, turnSignal: turn.signal, run: runFlush });
  }

  return {
    // #40 DRAFT-TIME birth (`chat.startChat` carried `startAsGame`): contribute RPG's row to the fresh room's
    // atomic batch. The startChat caller IS the just-minted host (chat's verb is the authority gate), and the
    // game exists before the opening turn so turn 1's gather sees it.
    planGameBirth: (chatId, params) => planLiteGameBirth(ctx, { chatId, ruleset: params.ruleset }),
    gameBirthCommitted: (chatId): void => ctx.emitBus({ type: "gameChanged", chatId }),
    resolvePresetOverride,
    // The GAME-authored user macros (MU §12A.5 / owner ruling #20's game half): `config.userMacros`, handed
    // to chat as declarations for BOTH the per-turn macro registry and the picks-pane read. KNOB-DRIVEN and
    // mode-blind like `resolvePresetOverride` — a plain config read, no game logic. A non-game chat or a
    // DISENGAGED game (#40) yields `[]`: the turn resolves preset macros only, byte-identical to no game.
    resolveUserMacros: async (chatId) => (await findEngagedGame(chatId))?.config.userMacros ?? [],
    // GATHER (§4.7): the depth-0 reminder injection + the resolved-mode tool set (cheap-with-tools) or none
    // (readonly). `args.pendingUserText`/`args.respondsToLatestUserTurn` are full's dice-feed inputs — lite
    // has no checks, so the gather ignores them (never threaded through to the impl below). `args.steerIdentity`
    // is chat's authoritative `{{user}}`/`{{char}}` binding, threaded so the reminder renders the host
    // steeringNote's identity macros (rpg splices, never re-derives). `args.regenSlotMessageId` is chat's
    // swipe/reroll target — the turn's state reads resolve as of BEFORE that slot so a reroll is never told the
    // abandoned variant's beats (VER-1b). `args.prose` is the turn PRESET's `promptConfig.prose` — the
    // model-facing teach/heading overrides, resolved chat-side (rpg reads no preset). `null` for a non-game chat.
    gatherTurnContext: (args: GatherTurnContextArgs): Promise<RpgGatherResult | null> => gatherTurnContext(ctx, args),
    // Lite has no d20 checks to feed a die into — a no-op (full's staging eligibility set).
    markDicePreRollEligible: (): void => undefined,
    onUserCommit,
    onTurnCompleted,
    // Turn abort: CLEAR the turn's staged writes so a dead turn never flushes into the next (the
    // dead-turn-never-flushes pin). Pure in-memory; safe for a non-game chat (an unknown turnId is a no-op).
    onTurnAborted: (_chatId, turnId): Promise<void> => {
      ctx.staging.clear(turnId);
      return Promise.resolve();
    },
    // The caller pressed Stop: signal THEIR in-flight state rounds on this chat (owner-scoped, mirroring
    // `activeTurns.abort`). Distinct from `onTurnAborted` above, which is fired by the ENGINE for a turn that
    // died before committing and only clears staging — by the time a round is running, that turn has already
    // committed and released its `activeTurns` registration, so nothing else can reach it. Returns the count so
    // the verb can tell "cancelled the caller's own round" apart from "the caller owns nothing here".
    // A non-game chat has no rounds and answers 0 (byte-identical).
    cancelStateRounds: (chatId, principalUserId): number => ctx.flushBarrier.cancel(chatId, principalUserId),
    // No GM seat in lite (`gmUserId` is always NULL) — the seat-kind read is always null (full's seat resolve).
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    // P3 (§3.6): is the game DECEPTION-ACTIVE (`config.features.deception || omniscience`)? Drives the member
    // reasoning-host-only strip in chat. `false` for a non-game chat (no game row) / a game with neither channel.
    resolveReasoningHostOnly: async (chatId): Promise<boolean> => {
      const game = await findEngagedGame(chatId); // disengaged (#40) ⇒ no reasoning strip
      return game !== undefined && isDeceptionActive(game.config.features);
    },
    // FORK CLONES THE GAME (§3.2): re-key the source game's whole vertical onto the fork through the fork's id
    // maps, host-secret-strip for a non-host forker, pointer LAST. `cloned:false` for a non-game source. Reads by
    // the SOURCE chat's game row directly (NOT `findEngagedGame`): a DISENGAGED game still clones — the fork
    // inherits its disengaged pointer (see `fork-game.ts`), preserving the source's front-door state, never
    // silently re-engaging it.
    forkGame: (args) => forkGame(ctx, args),
    // HOST HANDOFF (F1 + the copy offer): the unexecuted `gmPresetId` heal/gift + the `rpg_sheets`
    // re-key, folded into chat's role-swap batch — the fork carry-gate's twin on the OTHER member→host
    // transition. Reads the game row directly (a DISENGAGED game still carries the knob); `[]` for a non-game
    // chat ⇒ a plain-room handoff is byte-identical, and an offer-less accept is byte-identical to the
    // pre-offer heal.
    handoffHealStatements: async (args) => (await handoffHealStatements(ctx, args)).map(statementToken),
    // HOST HANDOFF, the NOMINATE-side disclosure (#1762): the same knob/ownership gate the heal applies,
    // asked before the nominee has consented — so the inbox row can say whether the room's GM voice comes
    // with it. Reads only; `false` for a non-game chat.
    handoffWouldCopyGmPreset: (chatId, nomineeUserId): Promise<boolean> => handoffWouldCopyGmPreset(ctx, chatId, nomineeUserId),
    // HOST HANDOFF, POST-SWAP: the copied cast's tracker rows/presence/pins move onto the copy ids. Not a
    // statement (a hand-door read-modify-write that may clone forward), so it runs after the swap commits.
    handoffRekeyActors: (chatId, cardCopies): Promise<void> => handoffRekeyActors(ctx, chatId, cardCopies),
  };
}
