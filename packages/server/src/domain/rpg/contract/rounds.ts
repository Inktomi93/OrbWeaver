// The DI bundle the state-round and host-door factories (`tools/rounds/`) close over: db, the executor, the connection
// resolve, and the cross-feature ops each is wired with at the composition root. rpg reads no chat, character or
// connection table; every such fact arrives through one of these.

import type { Principal } from "@orb/contracts/identity";
import type { UserIntent } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type { ExtractionRefs, RpgGameConfig, RpgStateRoundTool, RpgStructuredRoundShape } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ProviderExecutor, Resolved } from "@orb/inference";
import type { ChatId, IdSource, UserId } from "@orb/kit/ids";
import type { WireReady } from "@orb/kit/json-schema";
import type { CharacterService } from "#domain/character";
import type { BeginGenerationObservation, ChatService, ResolveCanonWindow, ResolveRpgParticipants } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { OwnedRpgFlushBarrier, RpgContext } from "./service.ts";
import type { RpgTraceSink } from "./trace.ts";

export type RpgRoundObservers = Pick<
  RpgContext,
  "emitBus" | "onStateRoundPath" | "onFoldBuildFailed" | "onStateRoundCancelled" | "onFlushSettled" | "onFlushDropped"
> & {
  readonly flushBarrier: OwnedRpgFlushBarrier;
};

/** The principal-free chat ops the rounds read: the roster projection, the canon window, the room's preset prose and
 *  params, the present host, and the generation-observation session a host-door call records into. */
export interface RpgRoundsChatOps {
  readonly beginGenerationObservation: BeginGenerationObservation;
  readonly resolveRpgParticipants: ResolveRpgParticipants;
  readonly resolveCanonWindow: ResolveCanonWindow;
  readonly resolveChatPresetProse: (chatId: ChatId) => Promise<ProseOverrides>;
  readonly resolveChatPresetParams: (chatId: ChatId) => Promise<UserIntent>;
  readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
}

export interface RpgRoundsDeps {
  readonly idSource?: IdSource;
  readonly db: Db;
  /** R-OBS — the rpg flight-recorder sink, present only when tracing is enabled. Absent is the default: every emit
   *  site calls `deps.trace?.(…)`, so a traced-off turn never builds an event object. */
  readonly trace?: RpgTraceSink;
  readonly rpgChatOps: RpgRoundsChatOps;
  /** The runtime fold, for the READ-side delivery verdicts and the two HOST doors. The in-turn state ROUNDS
   *  re-resolve nothing: they ride the character turn's already-resolved connection. */
  readonly connection: Pick<ConnectionService, "resolve">;
  readonly executor: Pick<ProviderExecutor, "runChatTurn">;
  /** The host's REAL `Principal` by userId (D19). */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  /** R4 PROMOTION's durable half: the card mint, its stable marker lookup, and the owner-handle probe. */
  readonly character: Pick<CharacterService, "create" | "findByHandle" | "findByImportHash">;
  /** R4 PROMOTION's other durable half: the host-gated, idempotent participant insert. */
  readonly chat: Pick<ChatService, "addCharacterToChat">;
  /** Is this thrown value the character library's per-owner handle-uniqueness refusal? Character owns its errors. */
  readonly isHandleConflict: (err: unknown) => boolean;
}

/** The resolved per-call inputs every structured extraction consumes — the CHARACTER turn's resolved connection + its
 *  enforced consent verdict + the prompts + the ref-constrained response schema (R1). Bundled to keep each arm
 *  under the param-count gate. `conn` comes from `input.turnConnection` — never a re-resolve (stickler F1). */
export interface ExtractCtx {
  readonly conn: Resolved<"chat">;
  /** The chat this round belongs to — threaded onto the provider request PURELY as the wire-capture
   *  correlation key (`ChatRequest.chatId` → the `captureWire` sink → `/api/_debug/wire/captures?chatId=`).
   *  A state round that omits it still lands in the ring, but ANONYMOUS: the operator's only filter is the
   *  chatId, so an unstamped round is invisible exactly when a chat is being debugged (measured — the live
   *  spill held a `tool_choice:"required"` state round with `chatId: undefined` beside the captured character
   *  turns). REQUIRED, like `signal`, so a new arm cannot forget to answer the question. */
  readonly chatId: ChatId;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schema: WireReady;
  /** The round's cancellation, threaded onto the provider request so a Stop actually kills the socket instead of
   *  letting a turn the user abandoned finish billing (`RpgStateRoundInput.signal`; minted by the flush barrier).
   *  `undefined` on the two HOST doors (`resyncFromStory` / `populateFromCharacter`): those are verb-initiated,
   *  and the tRPC request's signal is not threaded down to verbs on this tree — a doorway, not a gap in this
   *  seam. The field is REQUIRED so a new arm cannot forget to answer the question. */
  readonly signal: AbortSignal | undefined;
}

/** A built structured state round: the shape, the tools it stands for, what goes on the wire, and its prompt. */
export interface StructuredRound {
  readonly shape: RpgStructuredRoundShape;
  readonly tools: readonly RpgStateRoundTool[];
  readonly format: ResponseFormat;
  readonly systemPrompt: string;
}

/** The per-call PROMPT INPUTS every extraction vehicle resolves once and threads whole: the ref bundle, the
 *  game config, the player's display name, and the turn's PROSE overrides. Bundled so the prompt builders in
 *  `tools/rounds/prompts.ts` stay under the param-count gate and so a new prompt-shaping input lands as ONE field. */
export interface PromptInputs {
  readonly config: RpgGameConfig;
  readonly refs: ExtractionRefs;
  readonly playerDisplayName: string | null;
  readonly reconcile: boolean;
  /** PROSE-1 S4 — the GM PRESET's `promptConfig.prose`, by two DIFFERENT routes for two DIFFERENT invocation
   *  classes (see `RpgTurnContext.prose` and `ChatRpgOps.resolveChatPresetProse`). Absent/`{}` ⇒ every slot
   *  resolves to its shipped default, byte-identical to the pre-PROSE-1 prompt. */
  readonly prose: ProseOverrides;
}
