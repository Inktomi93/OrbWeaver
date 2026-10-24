// Composition seam for the rpg domain (docs/plans/rpg/design.md, the LITE vertical). Owns no business logic — it
// assembles the `RpgContext` DI bundle (db-scoped persistence + injected clock/id-mints/dice-CSPRNG + the injected
// cross-feature ops + the bus emit + the state-round and host-door factories rpg's `rounds/` subsystem builds over
// those ops), builds the `RpgService`, returns the `ChatRpgOps` object chat receives by injection (the
// `input.rpg ?? null` seam, `compose/chat.ts`), and registers the cheap-mode state tools into the ONE tool-use
// registry (the imagery precedent, `compose/imagery.ts`).
//
// FORWARD-REF: chat composes BEFORE rpg (the keystone order), yet chat's turn hooks call into rpg's ops. The
// `ChatRpgOps` object rpg builds here is a forward-ref delegate over the rpg service — it is handed to chat at
// the same keystone step (the agents-delegate precedent). rpg's own chat-facing ops (getMembership/setRpgPointer/
// resolveRpgParticipants/postNarratorMessage) flow the OTHER way, off `chatCompose.rpgChatOps` — chat learns nothing
// rpg-shaped, rpg learns no chat tables (§2 one-directional flow, both directions principal-free).

import type { IdSource } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { ScheduleOp } from "@orb/kit/time";
import { can } from "#domain/admin";
import { isCharacterHandleConflict } from "#domain/character";
import type { PostNarratorMessage } from "#domain/chat";
import type {
  ImportRpgGame,
  RpgContext,
  RpgCopyPresetToUser,
  RpgPostNarratorMessage,
  RpgResolvePresetOwned,
  RpgResolveViewerVisibility,
  RpgRoundsDeps,
  RpgService,
} from "#domain/rpg";
import {
  buildFoldedTurnBuilder,
  buildFoldTurnToolCalls,
  buildPromoteToCharacter,
  buildResolveStateDelivery,
  buildResolveStateRoundFit,
  buildRunPopulateExtraction,
  buildRunResyncExtraction,
  buildRunToolRound,
  createImportRpgGame,
  createRpgChatOps,
  createRpgHandWrites,
  createRpgRoundObservers,
  createRpgService,
  createRpgStagingStore,
  rpgToolDefinitions,
} from "#domain/rpg";
import type { ToolUseService } from "#domain/tool-use";
import type { ChatComposeResult } from "./chat.ts";
import { minter } from "./minter.ts";

/** What the rpg seam needs from the composition root: the rounds' own DI bundle (minus the handle-conflict
 *  classifier, wired here off character's front door) plus the ops only `RpgContext` itself consumes. */
export interface RpgComposeDeps extends Omit<RpgRoundsDeps, "rpgChatOps" | "isHandleConflict"> {
  readonly emitRpgEvent: RpgContext["emitBus"];
  readonly idSource: IdSource;
  readonly scheduleTimeout: ScheduleOp;
  readonly randomInt: RpgContext["randomInt"];
  readonly now: () => number;
  /** chat's rpg-facing ops (getMembership/postNarratorMessage/setRpgPointer/resolveRpgParticipants) — off chat's
   *  compose result (chat composes first). rpg closes over these; chat learns nothing rpg-shaped. */
  readonly rpgChatOps: ChatComposeResult["rpgChatOps"];
  /** THE cross-domain viewer-visibility op (chat's `resolveViewerVisibility`, built once at the services root)
   *  — the hidden-content posture + the D16 canon floor for one human over one chat. rpg's member-facing reads
   *  belt on it (#1528) and never re-derive either half. */
  readonly resolveViewerVisibility: RpgResolveViewerVisibility;
  /** The preset-ownership gate (fork-clones-the-game §3.2), wired off the preset front door `get`. */
  readonly resolvePresetOwned: RpgResolvePresetOwned;
  /** The GM-preset GIFT (the host-handoff copy offer's preset arm), wired off preset's `createCopyPresetToUser`. */
  readonly copyPresetToUser: RpgCopyPresetToUser;
  /** The ONE tool-use registry — rpg registers its state tools into it (the imagery precedent). */
  readonly toolUse: Pick<ToolUseService, "register">;
}

/** The rpg compose product: the verb surface (transport consumes it) + the `ChatRpgOps` chat receives by
 *  injection (the `input.rpg ?? null` seam). */
export interface RpgComposeResult extends AsyncDisposable {
  readonly service: RpgService;
  readonly chatOps: ReturnType<typeof createRpgChatOps>;
  /** R6 — the campaign's portability WRITE half, surfaced because it closes over the SAME `ids` bundle every
   *  other rpg write uses. Building a second minter set at the portability seam would be two homes for one
   *  id vocabulary. (The READ half needs only `db`, so the root wires it directly.) */
  readonly importGame: ImportRpgGame;
}

/** Restore's narrow atomic companion seam: RPG builds one RPG statement from chat's minted marker ids, and
 *  chat owns the narrator batch that commits and emits it. The two domains never construct each other's rows. */
function createRpgRestorePost(post: PostNarratorMessage): RpgPostNarratorMessage {
  return (chatId, content, buildSnapshotStatement) => post(chatId, content, undefined, { rpgRestoreStatement: buildSnapshotStatement });
}

export function buildRpg(deps: RpgComposeDeps): RpgComposeResult {
  const { idSource } = deps;
  const rounds: RpgRoundsDeps = { ...deps, isHandleConflict: isCharacterHandleConflict };
  const lifetime = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: the returned RPG graph owns writes shared by its service, tools and chat hooks.
  const handWrites = lifetime.use(createRpgHandWrites());
  const observers = createRpgRoundObservers(deps.trace, deps.scheduleTimeout, deps.emitRpgEvent, deps.logger);
  // Rounds can reconcile through handWrites while settling; close their owner first.
  lifetime.use(observers.flushBarrier);
  const ctx: RpgContext = {
    idSource,
    db: deps.db,
    now: deps.now,
    ids: {
      game: minter(ID_PREFIX.rpgGame, idSource),
      snapshot: minter(ID_PREFIX.rpgSnapshot, idSource),
      sheet: minter(ID_PREFIX.rpgSheet, idSource),
      journal: minter(ID_PREFIX.rpgJournal, idSource),
      checkpoint: minter(ID_PREFIX.rpgCheckpoint, idSource),
      turnToolCalls: minter(ID_PREFIX.rpgTurnToolCalls, idSource),
      // Quest + inventory-item ids are PLAIN strings minted inside the snapshot blob (no table, no FK — §4.1).
      quest: () => idSource.rpgQuestId(),
      item: () => idSource.unprefixed(),
    },
    staging: createRpgStagingStore(),
    handWrites,
    // The ONE privilege kernel (spine invariant #6) — rpg's `guard.ts` resolves membership and asks THIS for the
    // host verdict, exactly as chat/automation do. Wired here, never imported by the domain (§2 flow).
    can,
    getMembership: deps.rpgChatOps.getMembership,
    // #1528 — the DATA-PROJECTION verdict the member-facing reads belt on (hidden-span posture + the D16
    // floor), off chat's ONE cross-domain op. Distinct from `getMembership`, which answers the ENFORCEMENT
    // question `guard.ts` gates with.
    resolveViewerVisibility: deps.resolveViewerVisibility,
    setPointer: deps.rpgChatOps.setRpgPointer,
    claimChat: deps.rpgChatOps.claimChat,
    resolveParticipants: deps.rpgChatOps.resolveRpgParticipants,
    // R4 — promotion's durable half (card + roster seat), the ONE rpg write that reaches outside the game.
    promoteToCharacter: buildPromoteToCharacter(rounds),
    postNarratorMessage: createRpgRestorePost(deps.rpgChatOps.postNarratorMessage),
    resolvePresetOwned: deps.resolvePresetOwned,
    copyPresetToUser: deps.copyPresetToUser,
    // The chat's active-preset macros (WAVE MU) — the injected chat op the GM console's shadow gloss reads.
    resolvePresetUserMacros: deps.rpgChatOps.resolvePromptUserMacros,
    // The present host's role row, the same read the turn's funder is frozen from (`resolveTurnIdentity`).
    resolveRoomFunder: deps.rpgChatOps.resolveHostUserId,
    resolveStateDelivery: buildResolveStateDelivery(rounds),
    resolveStateRoundFit: buildResolveStateRoundFit(rounds),
    runToolRound: buildRunToolRound(rounds),
    // R1 (`folded` mode) — the two halves of the ONE-CALL exchange: the gather's tool mount + the flush's fold.
    // Neither makes a model call; the character turn already paid for both.
    buildFoldedTurn: buildFoldedTurnBuilder(rounds),
    foldTurnToolCalls: buildFoldTurnToolCalls(rounds),
    // The host resync model call (§1.3) — resolves the room connection AS THE HOST fresh at the verb (the ONE
    // non-inherited rpg model call, gated host-only inside the verb).
    runResyncExtraction: buildRunResyncExtraction(rounds),
    // The BORN-STATE corpus read (the injected chat op — rpg reads no chat/character table) + the host populate
    // model call it feeds (owner ruling 2026-08-01 — the ONE sanctioned doorway for the hand-only sheet fields).
    resolveCardCorpus: deps.rpgChatOps.resolveCardCorpus,
    runPopulateExtraction: buildRunPopulateExtraction(rounds),
    // The dice CSPRNG (bake-once, server-authoritative — a client seed is never honored, §4.4).
    randomInt: deps.randomInt,
    // The bus emit, the flush observability hooks and the flush barrier.
    ...observers,
  };
  const service = createRpgService(ctx);
  // Register the cheap-mode state tools into the ONE registry (additive; the imagery precedent).
  for (const def of rpgToolDefinitions(ctx)) {
    deps.toolUse.register(def);
  }
  return {
    service,
    chatOps: createRpgChatOps(ctx),
    importGame: createImportRpgGame(ctx),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}
