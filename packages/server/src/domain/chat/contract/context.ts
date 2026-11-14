import type { FilterOwnedAssetIdsOp, ResolveAssetHashOp } from "@orb/contracts/assets";
import type { CharacterCard, FindSyntheticGroupCharacterOp, MintSyntheticGroupCharacterOp } from "@orb/contracts/character";
import type {
  ClaimChatOp,
  DurableChatBusEvent,
  ForkGameOp,
  GameBirthCommittedOp,
  GatherTurnContextArgs,
  GatherTurnContextOp,
  HandoffCardPair,
  HandoffHealStatementsOp,
  HandoffRekeyActorsOp,
  HandoffWouldCopyGmPresetOp,
  HistoryFloorSeq,
  InvitePreview,
  LiveOnlyChatBusEvent,
  MemoryDigestInput,
  NextTurnConnectionView,
  ParticipantData,
  PlanGameBirthOp,
  ReadChatUserMacrosOp,
  RegisterPromptTransformOp,
  ResolveCharacterTagsOp,
  ResolveChatProseOp,
  ResolveGmSeatHolderKindOp,
  ResolvePresetOverrideOp,
  ResolveReasoningHostOnlyOp,
  ResolveRegexSources,
  ResolveSeatDecoOp,
  ResolveSeatDecosOp,
  RpgGatherWithTools,
  RpgUserCommitOp,
  StoreSegmentParams,
  TeachingContribution,
  TurnInitiator,
  TurnRetrievalEvents,
  UnregisterPromptTransformOp,
} from "@orb/contracts/chat";
import type { ResolveCharacterDistillatesOp } from "@orb/contracts/discovery";
import type { EmbeddingsPruneBlocksOp, MemoryEmbedSpace, ResolveMemoryEmbedSpaceOp } from "@orb/contracts/embeddings";
import type { Can, Principal, ResolveHandleOp, ResolveUserEnabled } from "@orb/contracts/identity";
import type { GeneratePicturePrompt, SizePresetName } from "@orb/contracts/imagery";
import type { BindingActor, SendAvailability } from "@orb/contracts/inference";
import type { NotificationEvent, PresenceView } from "@orb/contracts/notifications";
import type { ResolveConnectedPersonaOp, ResolveCurrentPersonaOp, ResolveDefaultPersonaOp, ResolveUserPublicsOp } from "@orb/contracts/persona";
import type { PluginMacroDefs, PluginMacroNames } from "@orb/contracts/plugin";
import type { ChoiceBlockSpec, ResolveUtilityPresetParams, RolePresetParams, UserIntent } from "@orb/contracts/preset";
import type { CopyHandoffRegexScriptsArgs, CountHandoffRegexScripts } from "@orb/contracts/regex";
import type { CancelStateRoundsOp } from "@orb/contracts/rpg";
import type { MemoryQueryOptions, ResolveCorpusSourceState, ScoredBlock } from "@orb/contracts/search";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { CopyHandoffBooksArgs, CountHandoffBooks } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import type { StatementToken } from "@orb/db/wiring";
import type { Resolved, RoleClientsWithSignal, SummarizeResult, WireTool } from "@orb/inference";
import type {
  AssetId,
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatTurnId,
  Handle,
  MessageId,
  MessageReactionId,
  MessageVariantId,
  PendingTurnId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { RandomSource } from "@orb/kit/macro";
import type { Clock, IanaTimeZone } from "@orb/kit/time";
import type { TestKeyRegex } from "@orb/kit/world-info";
import type { AuditWiring } from "#foundation/observability";
import type { ChatAccountingContext } from "./accounting-context.ts";
import type { ActiveTurns } from "./active-turns.ts";
import type { SpeakerArbiter, SpeakerReranker } from "./arbitration.ts";
import type { ApplyPromptTransformsOp, DelayOp, EmitDurableChatEventOp, EngineContext, RunChatTurnOp } from "./engine-context.ts";
import type { ChatBehaviorInputs, ResolveForeignInputsOp } from "./foreign.ts";
import type { ResolveChatUserMacroDefs } from "./macro-readers.ts";
import type { MemoryLog, MemoryRecallPhaseEmitter, MemoryRecallSink } from "./memory.ts";
import type { RpgTurnOps } from "./rpg-turn.ts";
import type { HashTokenOp, SignupInviteCapability, SignupInviteDeps } from "./signup.ts";

export type {
  BoundToolExecution,
  ChatToolExecFrame,
  ChatToolOps,
  ChatToolSet,
  EmitChatChanged,
  RunChatTurnOp,
} from "./engine-context.ts";

// The explicit ChatContext DI bundle + every injected cross-feature op type. Homed under contract/ because
// the exported-type gate forbids it in the conventional context.ts slot; the top-level context.ts re-exports
// this. Every cross-feature/infra dependency is an injected op — chat never sideways-imports a sibling domain.

/** The account handles of `userIds`; a gone id is absent. Sessions owns the `users` read. */
export type LoadUserHandlesOp = (userIds: readonly UserId[]) => Promise<readonly { readonly id: UserId; readonly handle: Handle }[]>;

/** The present roster's participant views for a chat — the read-model resolver `service.ts` builds once. */
export type LoadParticipantViewsOp = (chatId: ChatId) => Promise<readonly ParticipantData[]>;
/** The batched twin of {@link LoadParticipantViewsOp}: one page of rooms resolves its seats in a single pass. */
export type LoadParticipantViewsBatchOp = (chatIds: readonly ChatId[]) => Promise<ReadonlyMap<ChatId, readonly ParticipantData[]>>;

/** The invite preview for a chat the caller already cleared for preview (`verbs/invite-preview.ts`). */
export type AssembleInvitePreviewOp = (chatId: ChatId) => Promise<InvitePreview>;

/** Resolve the frozen room HOST's `chat` connection for a turn. A chat binds no connection (F20). */
type ResolveChatConnectionOp = (params: { readonly funderUserId: UserId; readonly signal?: AbortSignal | undefined }) => Promise<Resolved<"chat">>;

/** The live card for a roster member under the host's ownership. Null means gone/mid-delete — the caller
 *  treats null as skip, never an error. */
type GetCardOp = (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null>;

/** The host-handoff CARD copy (the character domain's `CopyHandoffCards`, declared structurally here so chat
 *  takes no cross-domain edge). Returns one pairing per source that resolved under `fromOwnerId`. */
type CopyHandoffCardsOp = (args: {
  readonly fromOwnerId: UserId;
  readonly toOwnerId: UserId;
  readonly chatId: ChatId;
  readonly characterIds: readonly CharacterId[];
}) => Promise<readonly HandoffCardPair[]>;

/** The host-handoff LORE copy (world-info's `CopyHandoffBooks`, declared structurally). Copies the books and
 *  returns the UNEXECUTED `chat_books` detach-original/attach-copy statements for the swap batch. */
type CopyHandoffBooksOp = (args: CopyHandoffBooksArgs) => Promise<readonly StatementToken[]>;

/** The host-handoff REGEX copy (regex's `CopyHandoffRegexScripts`, declared structurally). Copies the
 *  departing host's CHAT-TIER scripts into the nominee's library and returns the UNEXECUTED
 *  `chat_regex_scripts` re-point. Takes no `cardCopies`: a room's script attachment is room state that stands
 *  on its own, so unlike the lore arm it is not derived from what the seats did. */
type CopyHandoffRegexScriptsOp = (args: CopyHandoffRegexScriptsArgs) => Promise<readonly StatementToken[]>;

/** The host-handoff DIGEST re-key (embeddings' `HandoffRestampStatements`, declared structurally). Returns
 *  UNEXECUTED statements scoped to this chat; empty for an empty pair list. */
type RestampHandoffDigestsOp = (args: { readonly chatId: ChatId; readonly pairs: readonly HandoffCardPair[] }) => Promise<readonly StatementToken[]>;

/** The memory summarizer + the smart-arbitrate side-LLM. The SIGNAL-BEARING variant of the isomorphic
 *  `RoleClients["summarize"]` (`RoleClientsWithSignal`): chat is the one caller that already owns a
 *  cancellation — the turn's active-turn `AbortSignal` — and a side-LLM call that cannot be cancelled hangs
 *  the whole turn when the box accepts the socket and never answers. */
export type SummarizeOp = (funderUserId: UserId, ...args: Parameters<RoleClientsWithSignal["summarize"]>) => Promise<SummarizeResult>;

/** The room's preset generation params for a quiet generation, which runs on the CHAT connection and so on the
 *  preset the turn runs: the same ladder (a game's GM-voice preset, else the host's default). Resolved at the entry
 *  root (chat never reads the preset domain); a hostless/stale room degrades to the system-default params.
 *  `maxContextTokens` sets the window on a route that sends one, so the pass runs the turn's own. */
export type ResolveChatPresetParamsOp = (chatId: ChatId) => Promise<RolePresetParams & Pick<UserIntent, "maxContextTokens">>;

/** B7 — a user's per-user reaction defaults, picked off the same schema-real `UserSettings.chat` arm the
 *  turn path consumes as `ChatBehaviorInputs` (never a re-spelled shape). The op half of
 *  {@link ChatContext.readReactionDefaults}. */
type ReadReactionDefaultsOp = (userId: UserId) => Promise<Pick<ChatBehaviorInputs, "charactersCanReact" | "reactionsEnabled">>;

/** The imagery quiet-extraction shaper — a STANDALONE op (not on ChatContext; built
 *  at compose from db + summarize + getCard). Chat owns the history
 *  window + the ONE MacroContext (the char macro resolved against the subject/roster card), then calls the summarize
 *  side-LLM; imagery consumes it as an injected op and never imports chat. `caller` is deliberately absent —
 *  cards resolve under the chat HOST's ownership, and imagery already gated the caller's chat membership. */
export interface ExtractQuietParams {
  readonly chatId: ChatId;
  /** Whose summarize connection the extraction spends: the run-as principal, the room host in a room (D298). */
  readonly funderUserId: UserId;
  /** The mode template with its char/user macros unresolved — chat resolves them. */
  readonly instruction: string;
  /** Focuses the char macro on one character in a group chat; absent ⇒ the roster's primary character. */
  readonly subjectCharacterId?: CharacterId | undefined;
  /** The CALLER's D16 canon floor — REQUIRED, not optional. The extraction's product is a model DISTILLATION
   *  of the recent transcript handed straight back to ONE human (`imagery.extractPrompt` returns the prompt
   *  string on the wire), so it is viewer-plane, not room-plane: unlike a turn reply it is not one shared
   *  utterance and CAN be clamped per reader without forking canon. Membership alone admitted this call, and
   *  membership is not visibility — so the caller must obtain this from chat's `resolveViewerVisibility` op.
   *  `NO_HISTORY_FLOOR` (0) is the unclamped common case. */
  readonly historyFloorSeq: HistoryFloorSeq;
  /** The initiating viewer's zone, which the template's `{{date}}`/`{{time}}`/`{{weekday}}` read. Absent ⇒ UTC
   *  (a caller with no viewer: automation, a plugin, a model tool call). */
  readonly timeZone?: IanaTimeZone | undefined;
}
export interface ExtractQuietResult {
  readonly text: string;
  readonly costUsd: number | null;
}
export type ExtractQuiet = (p: ExtractQuietParams) => Promise<ExtractQuietResult>;

/** The deps `createExtractQuiet` closes over, assembled at the composition root. */
export interface ExtractQuietDeps {
  readonly db: Db;
  /** The clock the template's time macros read (the injected determinism seam, never the ambient wall clock). */
  readonly now: Clock;
  readonly summarize: SummarizeOp;
  readonly getCard: GetCardOp;
  /** The funder's Utility-role preset params: extract-quiet runs on the summarize connection. */
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
  /** IMGMAC (owner ruling: YES) — the two authoring homes' user-macro DEFS, so an imagery mode template
   *  resolves `{{house_style}}` exactly as a turn would. REQUIRED, not optional: an unwired composition root
   *  would silently re-open the "the settings UI offers a macro that never substitutes" hole this closed. */
  readonly resolveUserMacroDefs: ResolveChatUserMacroDefs;
}

/** A QUIET, non-canon generation through the chat's OWN resolved connection/model — NOT the summarizer rail
 *  (`ExtractQuiet`/`summarize`), NOT a chat turn. The one seam managed compaction uses to build its marker
 *  through the same model the chat talks to. Commits NO canon, emits NO bus turn events, spawns NO ghost row;
 *  it streams `runChatTurn` and reduces to `{text, costUsd}`. The caller passes the chat's RESOLVED connection
 *  (source-agnostic — whatever the API/runner axis resolves to); a backend that can't serve it surfaces as the
 *  normal resolved-connection/provider failure, never a branch. `systemPrompt` is the static instruction; the
 *  span text rides as one user message; `intent` tunes temp/output length (a low-temp, bounded generation).
 *  The Principal-less standalone-factory precedent (`ExtractQuiet`) — never a `ChatService` verb, never tRPC. */
export interface QuietGenerateParams {
  readonly chatId: ChatId;
  readonly connection: Resolved<"chat">;
  readonly systemPrompt: string;
  readonly userText: string;
  /** Optional generation tuning (temperature / maxOutputTokens); absent ⇒ the op's bounded defaults. */
  readonly intent?: UserIntent | undefined;
  readonly signal?: AbortSignal | undefined;
}
/** The reduced result — not exported (nothing imports it directly; `QuietGenerate` is its only consumer). */
interface QuietGenerateResult {
  readonly text: string;
  readonly costUsd: number | null;
}
export type QuietGenerate = (p: QuietGenerateParams) => Promise<QuietGenerateResult>;

/** The deps `createQuietGenerate` closes over, assembled at the composition root — the chat role only (no
 *  routing/credential resolution: the caller supplies the already-resolved connection). */
export interface QuietGenerateDeps {
  readonly runChatTurn: RunChatTurnOp;
  /** The chat host's active-preset params. Folded UNDER the caller's `intent` (compaction's per-pass override
   *  wins) and OVER the `quiet_generate` posture; a hostless/stale room degrades to the system default. */
  readonly resolveChatPresetParams: ResolveChatPresetParamsOp;
}

/** The rpg-facing narrator-post op (D58): persist ONE assistant-role narrator message
 *  through chat's canon-write path, authored by the synthetic group character (never a user id — the
 *  D19/D16-inv-9 attribution-honesty rule; minted lazily if the room has none). `content` is a plain STRING;
 *  `media` ride the body as embedded `![alt](asset:<id>)` refs (D51 — never stored blocks) with `message_assets`
 *  retaining rows. Returns the new message AND its variant id for ordinary callers. Checkpoint restore keeps
 *  its companion snapshot message-less (`variantId IS NULL`) and stamps `asOfMessageId` with this marker's
 *  message id instead. A STANDALONE compose-built op, NOT a `ChatService` verb: it takes no principal (rpg
 *  gates authority from its host-authority verbs before calling), the `ExtractQuiet` precedent.
 *
 *  `origin` (the F1/N1 cascade belt) is OPTIONAL and ADDITIVE: absent (every rpg
 *  caller) ⇒ the canon insert omits it and the DB defaults apply (`'human'`/0), so an rpg narrator post stays
 *  byte-identical. Only the automation `generate_image` non-quiet post passes it — stamping the posted image's
 *  slot with `initiator:"automation"` + the firing rule's cascade depth (≥1), so the resulting
 *  `messageCommitted` fact resolves at depth ≥ 1 and `runGates` cascade-suppresses a non-opted re-fire (closes
 *  the F1 self-loop; the F5 mechanism on this write path).
 *
 *  IT REFUSES A BLANK POST (D124), checked on the ASSEMBLED body so a media-only illustration is still legal.
 *  rpg used to post EMPTY `content` here to mint a "state anchor" slot keying a hand-written snapshot; that
 *  row was durable canon no reader could see and it leaked onto every plane that consumes messages. Hand
 *  state is now a message-less `rpg_snapshots` row (`variantId IS NULL`), so every caller left posts real
 *  content and the leaking row class is unrepresentable at this boundary rather than filtered downstream.
 *
 *  `rpgRestoreStatement` is the ONE checkpoint-restore seam: after chat mints the marker ids, RPG may return
 *  one unexecuted RPG-owned statement for this existing pure-write batch. The arm is optional and the returned
 *  statement is appended last, so every ordinary caller is byte-identical; failure of either row class rolls
 *  the marker and snapshot back together. */
type PostNarratorMessageOptions =
  | { readonly initiator: TurnInitiator; readonly automationDepth: number }
  | { readonly rpgRestoreStatement: (ids: { readonly messageId: MessageId; readonly variantId: MessageVariantId }) => StatementToken };

export type PostNarratorMessage = (
  chatId: ChatId,
  content: string,
  media?: readonly AssetId[],
  options?: PostNarratorMessageOptions | undefined,
) => Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId }>;

/** The chat-bus emit the narrator-post op needs (durable-first) — chat's own collaborator, wired at the root
 *  (the `PostNarratorMessageDeps` shape; not on `ChatContext`). */
export interface PostNarratorMessageDeps {
  readonly emit: EmitDurableChatEventOp;
  /** The husk→real transition (R0) -- a narrator post is canon, so it claims. */
  readonly claimChat: ClaimChatOp;
}

/** The pointer op's collaborators (the `PostNarratorMessageDeps` shape; not on `ChatContext`). */
export interface SetRpgPointerDeps {
  /** The husk→real transition (R0). Every non-null pointer write is a host act (creating a game, or the engaged
   *  toggle either way), so it claims; the null detach is a server heal and never claims. */
  readonly claimChat: ClaimChatOp;
}

/** Delivers an invite/kick/handoff to a non-member the per-chat bus can't reach. Durable-first; `coStatements`
 *  carries the producer's membership-transition statements, committed in the same batch as the notification row. */
type NotificationsEmitOp = (event: NotificationEvent, coStatements?: readonly StatementToken[]) => Promise<void>;

/** Server-derived SSE liveness for a userId (never client-asserted — a spoofable presence is a
 *  prompt-composition attack). Read once per round for seated-character-gating. */
export type PresenceReadOp = (userId: UserId) => Promise<PresenceView>;

/** The PLUGIN-MACRO resolve op — the per-turn read of the TURN AUTHOR's own
 *  enabled plugins' registered macros, already resolved (each guest invoked once, under the plugin plane's
 *  assembly deadline) into kit `UserMacroDef`s, grouped by the plugin that registered them, which the turn's macro registry takes as DATA. `ChatContext.pluginMacros`
 *  is `null` when no plugin host is wired — the byte-identical no-op the `rpg`/`tools` seams use.
 *
 *  IT IS AN INJECTED OP AND THAT IS THE WHOLE POINT: chat never imports `domain/plugin`, and the plugin domain
 *  never imports chat. Chat asks "what macros does this author have this turn?" and receives DATA; whose plugin,
 *  which guest, and what budget it ran under are all the other side's business. */
// Not exported (the `ResolvePromptVariablesOp` precedent): its only consumers are `ChatContext` here
// and compose, which reaches it as `ChatContext["pluginMacros"]` — an export nothing imports is a false public.
type ResolvePluginMacrosOp = (authorUserId: UserId, chatId: ChatId) => Promise<readonly PluginMacroDefs[]>;

/** The names alone of the macros {@link ResolvePluginMacrosOp} resolves: no guest runs, so a read that is not a turn
 *  can list a plugin's macros without executing the plugin. */
type ListPluginMacrosOp = (authorUserId: UserId) => readonly PluginMacroNames[];

/** The D50 PromptTransform registrar surface — created ONCE at the composition root
 *  (`createPromptTransformRegistry`). Its `apply` is injected as {@link ApplyPromptTransformsOp}
 *  (`ChatContext.promptTransforms`); `register`/`unregister` are wired to automation's rule lifecycle +
 *  the plugin host as `transform_draft` rules enable/disable. */
export interface PromptTransformRegistry {
  readonly apply: ApplyPromptTransformsOp;
  /** Register a transform (idempotent by `id` — a re-register replaces the prior, e.g. an automation rule edit). */
  readonly register: RegisterPromptTransformOp;
  /** Deregister by id (an automation rule disable / a plugin teardown). A no-op for an unknown id. */
  readonly unregister: UnregisterPromptTransformOp;
}

/** The generic name→value macro map + reminder injection(s) + tool names a game turn's GATHER contributes
 *  (D58). STRUCTURAL — chat names NO rpg type: it merges `macros` generically into the turn's
 *  macro values (never learning a specific rpg macro name), `injections` into its single Injection[] list, and
 *  `tools` into `attachedToolNames`. The preset override rides a SEPARATE early hop (see {@link ChatRpgOps}). */
export type ChatRpgGatherResult = RpgGatherWithTools<WireTool>;

export interface ChatRpgOps extends RpgTurnOps {
  /** The DRAFT-TIME game birth plan. RPG constructs its own table statements and minted id; chat folds
   *  them into the room's creation batch and stores only the opaque pointer. No domain constructs the
   *  other's rows, while room/game/pointer are one durable commit. */
  readonly planGameBirth: PlanGameBirthOp<StatementToken>;
  /** Post-commit in-process notification for a successfully committed birth plan. */
  readonly gameBirthCommitted: GameBirthCommittedOp;
  /** The GM-voice preset redirect: the game's `gmPresetId` (or `null` = not a game / no override), resolved
   *  before preset resolution so the turn assembles THAT preset instead of the host default. */
  readonly resolvePresetOverride: ResolvePresetOverrideOp;
  /** The GAME's authored user macros (`rpg_games.config.userMacros`) — the game half of the two-home
   *  definition rule (D345; the preset half is {@link ChatContext.resolvePromptUserMacros}). Empty for a
   *  non-game / DISENGAGED chat (byte-identical to a non-game turn). Chat learns no rpg type: the
   *  return is contracts' own `UserMacroSpec`, the SAME shape the preset half returns, and chat merges the
   *  two under the collision policy (`shadowPresetUserMacros` — the game shadows the preset).
   *
   *  Its own op rather than a {@link ChatRpgGatherResult} field because the DECLARATIONS have two consumers
   *  with different shapes of work: the turn build (which runs the gather anyway) and the picks-pane read
   *  `getUserMacroPicks` (a cheap member read that must NOT drive a whole turn gather). One op, both
   *  callers — the alternative was two homes for one fact. */
  readonly resolveUserMacros: ReadChatUserMacrosOp;
  /** GATHER (after the WI pool): a game turn's contribution, or `null` for a non-game chat (byte-identical).
   *  Args shape: {@link GatherTurnContextArgs}.
   *  `respondsToLatestUserTurn` is chat's slot-adjacency verdict (D58): is THIS turn (re)generating
   *  the assistant slot that DIRECTLY responds to the latest user message? It drives the `playerRolledDice`
   *  reminder flag (and, paired with {@link markDicePreRollEligible}, the dice feed) so a stale die never
   *  re-feeds a later GM/auto round. Chat computes it (slot mechanics stay chat-owned); rpg consumes it blind.
   *  `steerIdentity` is chat's authoritative identity binding for the host-authored `steeringNote`, both values
   *  resolved CHAT-SIDE (chat owns `{{user}}`/`{{char}}` resolution): `user` = the triggering human's ACTIVE
   *  persona display name (`undefined` ⇒ no active persona → the "User" floor); `char` = the Ruling-B
   *  host/null-speaker `{{char}}` (Chat-Macro-Resolution.md ruling B — the JOINED CHARACTER NAMES in a multi-character
   *  room / the single character in solo). Threaded so rpg can render the steeringNote's identity macros
   *  (guided-safe subset only, mirroring the nudge/guided path) instead of shipping literal braces — rpg SPLICES
   *  chat's values, never re-deriving identity. Absent ⇒ the steeringNote ships verbatim (byte-identical).
   *  `regenSlotMessageId` is the assistant slot this turn is REGENERATING — a swipe/reroll's `targetMessageId`
   *  (the `append-variant` persist mode), whose canon context also stops BEFORE the slot. rpg reads its state
   *  as of before that slot, so a reroll is never told the abandoned variant's beats (VER-1b; without it the
   *  reminder describes the very prose the model is being asked to rewrite). Absent for a fresh turn AND for
   *  `continue` — a continuation's context INCLUDES the slot, so its state genuinely is the head. */
  readonly gatherTurnContext: GatherTurnContextOp<ChatRpgGatherResult>;
  /** SEND path, after the user row commits — fires the snapshot COMMIT (+ consumes queued dice rolls). */
  readonly onUserCommit: RpgUserCommitOp;
  /** CANCEL `principalUserId`'s in-flight rpg STATE ROUNDS on this chat; returns how many were signalled. Called by
   *  the `abort` verb beside `activeTurns.abort` — and it has to be a SEPARATE reach, because the turn's own
   *  AbortSignal cannot cover the round. The timeline, which is the whole reason this op exists:
   *
   *    1. the engine commits the reply, then fires the rpg round FIRE-AND-FORGET from inside the turn body
   *       (`fireRpgTurnCompleted`, after `commitGeneration`);
   *    2. `executeTurn` returns microseconds later and the verb's `using` scope disposes the registration;
   *    3. disposal DELETES the entry from the `activeTurns` registry (`active-turns.ts`), so from that
   *       instant `abort(chatId, user)` iterates a set the turn is no longer in and signals NOBODY;
   *    4. the round then runs its model call for 0.8-2.9s (the measured window `flush-barrier.ts` documents)
   *       with a controller nothing can reach.
   *
   *  So threading `prep.signal` alone would cancel only the multi-speaker overlap window (speaker 1's round
   *  while speaker 2 generates under the same registration) — it would look correct and fix almost nothing.
   *  The round therefore owns its OWN cancellation lifetime in rpg's flush barrier, and this op is the door.
   *
   *  OWNER-SCOPED, mirroring `activeTurns.abort` EXACTLY — same parameter name, same comparison against the
   *  registration's owner (D19: the round's owner is the turn's `triggeredBy`; `principalUserId` is the caller
   *  asking). The rollback-theft defense: a host cannot cancel a member's round. A no-round chat returns 0 (the
   *  idempotent no-op); a non-game chat is byte-identical. Synchronous — cancelling is in-memory. */
  readonly cancelStateRounds: CancelStateRoundsOp;
  /** The GM seat holder's FK-derived KIND for the game rooted at this chat (D60 AP4a),
   *  or `null` = not a game / NULL AI-narrator seat / holder vanished. `setGroupConfig` reads it to SEAL the
   *  narrator+merged invariant (F5): a game whose GM seat is AGENT-held may not be flipped to `per-speaker`
   *  (unseat the agent GM first — else a player-character turn would carry GM tools). Chat stays rpg-table-blind
   *  — this ONE injected read mirrors rpg's `resolvePartyActorKind` shape; chat branches only on `agent`. */
  readonly resolveGmSeatHolderKind: ResolveGmSeatHolderKindOp;
  /** Is the game rooted at this chat DECEPTION-ACTIVE (parity-plus §3.6 — deception OR omniscience config on)?
   *  `false` for a non-game chat / a game with neither hidden channel on. This is the SERVER-side
   *  gate for the member REASONING-STRIP: when true AND the viewer is not the room host, the whole reasoning/
   *  thinking channel is withheld from that member (a deceptive model can spill a lie's truth in its reasoning —
   *  the whole-channel host-only cut is the clean threat boundary, §3.6). Chat stays rpg-table-blind — this ONE
   *  injected read mirrors `resolveGmSeatHolderKind`'s FK-derived shape; chat branches only on the boolean. The
   *  BODY hidden-span strip is unconditional (a lie is always stripped for members); THIS gate is the ADDITIONAL,
   *  game-conditional reasoning cut P3 adds beside it. */
  readonly resolveReasoningHostOnly: ResolveReasoningHostOnlyOp;
  /** FORK CLONES THE GAME (fork-clones-the-game §3.2). Called by `forkChat` AFTER its atomic fork batch commits:
   *  rpg re-keys its whole 6-table vertical from the source game onto the fork through the fork's id maps and
   *  writes the fork's `metadata.rpg` pointer LAST (crash safety — a mid-clone failure leaves the fork a valid
   *  PLAIN chat, the `forkMetadataWithoutGame` stopgap as the structural fallback). The maps ENCODE
   *  the fork horizon: a snapshot/journal row whose variant was not copied (truncated past the fork's `throughSeq`,
   *  or withheld below the forker's D106 join-floor) has no `variantIdMap` entry and is dropped by construction —
   *  no separate horizon param. `forker` drives the host-secret strip: a NON-`readsHidden` forker becomes HOST of
   *  the copy, so anything host-only in the source (config `steeringNote`, a foreign `gmPresetId`, hidden-span
   *  tracker prose) must not launder into their new host view (the §3.6 member→host boundary — the SAME transition
   *  `resolveReasoningHostOnly`/`copyVariantStmt` already strip the reasoning + body channels across). `null` when
   *  rpg isn't wired / the source isn't a game ⇒ `{cloned:false}` and the fork stays plain. */
  readonly forkGame: ForkGameOp;
  /** HOST HANDOFF: the rpg-side statements `acceptHostHandoff` must commit IN ITS OWN
   *  SWAP BATCH when room authority moves to `newHostUserId`. Today that is the `gmPresetId` heal — the twin of
   *  the fork's `resolveForkGmPreset` gate: a GM-voice preset the NEW host cannot read is nulled, since from the
   *  swap onward `resolvePresetOverride` resolves it under THEM (owner-scoped) and would degrade the game's voice
   *  silently while `getConfigView` served an id they can never inspect. A preset the nominee can read is left
   *  alone (conditional, never a blanket clear). Returns UNEXECUTED statements rather than writing, so the heal
   *  and the role swap commit atomically — the co-statement seam `markUserLeftStatement`/`setPendingHostStatement`
   *  already ride. Empty for a non-game chat / an unset knob ⇒ a handoff in a plain room is byte-identical. Chat
   *  stays rpg-table-blind: it folds the statements into its batch and reads nothing inside them.
   *
   *  `args.copyGmPreset`/`args.cardCopies` are the ACCEPTED OFFER's rpg arms: with the preset
   *  offered, an unreadable knob is COPIED into the new host's library and re-pointed instead of nulled (the
   *  room keeps the voice it had); `cardCopies` re-keys `rpg_sheets` off the departing host's cards onto the
   *  nominee's copies, so the transferred seated characters' durable identity data stops depending on a library the old
   *  host can empty. An offer-less accept passes `false` + `[]` and produces the IDENTICAL statement list the
   *  pre-offer heal produced. */
  readonly handoffHealStatements: HandoffHealStatementsOp<StatementToken>;
  /** HOST HANDOFF, the NOMINATE-side disclosure: WOULD an accepted `copyGmPreset` offer copy this
   *  room's GM voice into `nomineeUserId`'s library? `true` only when the room is a game, its `gmPresetId` is
   *  set, and the nominee cannot already read it — i.e. exactly the gate `handoffHealStatements` applies at
   *  accept, asked without writing. A preset the nominee already owns answers FALSE and that is not a
   *  degrade: the knob is left alone, so nothing lands in their library and nothing should be promised. */
  readonly handoffWouldCopyGmPreset: HandoffWouldCopyGmPresetOp;
  /** HOST HANDOFF, POST-SWAP: move each copied character's tracker row, scene presence and hand PINS from the
   *  source card's key onto the copy's (`rekeyActor` — the `promoteActor` mechanism). NOT statement-shaped and
   *  therefore NOT in the swap batch: it is a read-modify-write through rpg's hand door, which resolves the
   *  true head and may clone forward as a fresh HAND row (D124). So it runs after the swap COMMITS — the
   *  `forkGame` post-batch posture, degraded-not-broken: a crash between them leaves the room correctly
   *  transferred with its tracker rows still on the old keys, and a re-run converges (an already-moved actor
   *  refuses per-actor and changes nothing). Never throws into the accept. `[]`/a non-game chat writes nothing. */
  readonly handoffRekeyActors: HandoffRekeyActorsOp;
}

/** Durable post-swap work owned by the accepted host. The persistence seam parses this exact shape before
 *  the roster resumes the idempotent actor/event tail. */
export interface HandoffResumption {
  readonly chatId: ChatId;
  readonly acceptedByUserId: UserId;
  readonly actorRekeys: readonly HandoffCardPair[];
}

/** What an accepted offer actually landed — the copy plan the swap batch re-points the room onto. Empty in
 *  every no-offer accept, which is what keeps that path byte-identical to the pre-offer handoff. */
export interface HandoffCopyPlan {
  /** The seat re-points: one per copied card. */
  readonly seats: readonly { readonly participantId: ChatParticipantId; readonly copy: HandoffCardPair }[];
  /** The source→copy pairings the canon/digest/rpg re-stamps key off. */
  readonly cardCopies: readonly HandoffCardPair[];
  /** The UNEXECUTED `chat_books` detach-original/attach-copy statements world-info minted. */
  readonly bookRepoint: readonly BatchStmt[];
  /** The UNEXECUTED `chat_regex_scripts` detach-original/attach-copy statements regex minted. Unlike the
   *  book arm this does not ride on a card copy — a room's script attachment is room state of its own. */
  readonly regexRepoint: readonly BatchStmt[];
}

/** The injected image-generation op. Chat holds message-write authority; imagery is caller-blind (returns
 *  blocks, never posts). */
export type GeneratePictureOp = (
  p: GeneratePicturePrompt & {
    /** The requesting member: the extraction viewer and the message author. */
    readonly caller: Principal;
    /** The room host the picture runs as (D298): its connection, templates, negative base, Utility
     *  funder, asset store and gallery. */
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;

    readonly n?: number | undefined;
    readonly size?: SizePresetName | undefined;
    readonly negative?: string | undefined;
    /** The character whose gallery each picture joins; imagery adds it only when the run-as host owns it. */
    readonly gallery?: { readonly subjectCharacterId: CharacterId } | undefined;
    /** The viewer's zone an extraction template's time macros read; absent ⇒ UTC. */
    readonly timeZone?: IanaTimeZone | undefined;
  },
) => Promise<{
  readonly images: readonly { readonly assetId: AssetId }[];
  // Imagery's native warning vocabulary (e.g. `image_edit_dropped` — an edit/avatar-reference input dropped for
  // a non-edit model). `generateImage` maps these onto chat's OWN `warning` bus codes
  // (chat owns its bus vocabulary — the turnAbortNotice precedent) and emits one `warning` ChatEvent per entry.
  readonly warnings: readonly { readonly code: string; readonly detail: string }[];
}>;

/** Does `personaId` belong to `ownerId`? The persona-reattribution ownership belt: a line may be re-stamped
 *  only to a persona the acting user owns. */
type VerifyPersonaOwnedOp = (params: { readonly ownerId: UserId; readonly personaId: PersonaId }) => Promise<boolean>;

/** memory's digest vector write — the one write path. Cancellation belongs to the runtime operation, not the shared
 *  memory payload, and `AbortSignal` is not declared in the contracts program. */
export type EmbeddingsStoreOp = (params: MemoryDigestInput & { readonly signal?: AbortSignal | undefined }) => Promise<MemoryEmbedSpace>;

/** memory's verbatim-segment write — a BATCH, and the one place the segment phase's embed flood lives (owner batching ruling: derived-data sweeps batch BY PHASE, never per-item interleaved). The corpus sweep
 * collects every chat's pending chunks, hands them over in ONE call, and the embeddings side submits them to
 * the engine as a single flood with no client-side throttle; the live post-turn build calls the same op with
 * one chat's chunks. Nothing here decides concurrency — that is the provider surface's. The signature stays here
 * because `AbortSignal` is not declared in the contracts program. */
export type EmbeddingsStoreSegmentsOp = (params: readonly StoreSegmentParams[], signal?: AbortSignal) => Promise<readonly MemoryEmbedSpace[]>;

/** memory's chat-scoped recall. Returns the ranked blocks WITH their retrieval numbers; memory resolves the
 *  identities back to digest text and reports the numbers in its recall trace (a bare key list left
 *  "why did THIS block surface" unanswerable at the only seam that knows). */
/** `ownerId` is OMITTED on purpose: `MemoryScope` carries no owner (D20), so the compose binding resolves the
 *  chat HOST — whose `embed`/`rerank` bindings define the digest space — from the chat FK before calling search. */
type SearchDigestsOp = (query: Omit<MemoryQueryOptions, "ownerId">, events?: TurnRetrievalEvents | undefined) => Promise<readonly ScoredBlock[]>;

/** The per-call degrade observations BOTH in-turn retrieval ops report back — the neutral, chat-side half of
 *  the seam (search owns its own `DigestSearchEvents`; neither side imports the other's vocabulary).
 *
 *  `onIndexUnavailable` IS A CONTRACT ON THE BINDING, not a courtesy: an op that reports it MUST also
 *  resolve empty rather than throw. The owner's vector space being mid-move or unbound is an ordinary state,
 *  and a turn's retrieval is an ENHANCEMENT to the turn — so that one class degrades here while every other
 *  search failure still propagates and still faults the turn (a `strikeOutOnTurnFault` premise, `engine.ts`). */

/** The databank `{{databank}}`-slot GATHER op. OPTIONAL: absent ⇒ GATHER skips
 *  the branch entirely and the slot resolves empty, byte-identical to a non-databank deploy (the null-op pin).
 *  A `null` result = nothing retrieved (bankless scope / no hits / budget too small — and an
 *  unqueryable vector space, which reports through `events` before resolving null). chat reads ONLY `.text`
 *  (the slot value); databank's provenance/token fields never cross into chat.
 *
 *  It shares {@link TurnRetrievalEvents} with the digest op because one turn losing both slots to ONE
 *  unqueryable space owes the user ONE notice; `onRerankUnavailable` is unused on this arm (databank's rerank
 *  degrade is not wired) and the binding simply never calls it. */
type GatherDatabankOp = (
  args: {
    readonly chatId: ChatId;
    /** The room HOST — the document space is theirs (host-only v1), so their `embed`/`rerank` bindings serve it. */
    readonly hostUserId: UserId;
    readonly queryText: string;
    readonly tokenBudget: number;
    readonly k?: number | undefined;
    readonly minScore?: number | undefined;
    readonly rerank?: boolean | undefined;
  },
  events?: TurnRetrievalEvents | undefined,
) => Promise<{ readonly text: string } | null>;

/** The chat's active preset's declared ChoiceBlock variables, resolved under the host's settings. Empty
 *  means no declared variables (or a hostless/stale room). */
type ResolvePromptVariablesOp = (chatId: ChatId) => Promise<readonly ChoiceBlockSpec[]>;

/** The S2 MODEL-TEACHING seam (`ChatContext.teaching`): every domain's contributions in ONE array, assembled at
 *  `entry/compose`. Chat's OWN contribution is the rpg-gather projection at order 0
 *  (`domain/chat/teaching-contribution.ts`), which is why a game turn's reminder is byte-unchanged by this seam.
 *  Empty is legal and means "nothing teaches this turn" (byte-identical). */
export type ChatTeachingRegistry = readonly TeachingContribution[];

/** The DI bundle every chat verb/subsystem closes over. `db` routes queries through `persistence/`; `now` +
 *  the id-minters are the determinism seams (no ambient Date.now()/mintTypeId() in a verb). */
export interface ChatContext extends EngineContext, ChatAccountingContext {
  /** The privilege-decision seam — every chat-authority verdict routes through this; chat never imports admin. */
  readonly can: Can;
  readonly newChatId: () => ChatId;
  readonly newParticipantId: () => ChatParticipantId;
  readonly newMessageReactionId: () => MessageReactionId;
  readonly newInjectionId: () => ChatInjectionId;
  readonly newEventId: () => ChatEventId;
  readonly newInviteId: () => ChatInviteId;
  readonly newPendingTurnId: () => PendingTurnId;
  /** Hashes an invite token before persistence — never stored raw. */
  readonly hashToken: HashTokenOp;
  /** D259 — whether this mode mints signup invites, and the mode every invite is stamped with. */
  readonly signupInvites: SignupInviteCapability;
  readonly audit: AuditWiring["log"];
  /** Unexecuted audit insert for the host-handoff swap's all-or-nothing forensic record. */
  readonly auditStatement: AuditWiring["statement"];
  /** The world-info regex-KEY ReDoS watchdog — the assembler `.test`s a `use_regex` entry's user-authored
   *  key against the chat-history haystack under this per-call budget so a catastrophic key can't hang the turn. */
  readonly testRegexKey: TestKeyRegex;
  /** D121-E: dereference the FOUR regex scope junctions (global / preset / character / chat) into the host-tier
   *  sources. Injected from `domain/regex` at compose — chat owns the UNION (`substrate/regex-tier`), never
   *  the storage. The sources are library rows, never an embed-by-value copy on a settings, preset or card
   *  blob. Called with the turn's frozen `runAsUserId` (D19), so a member can never widen the set. */
  readonly resolveRegexSources: ResolveRegexSources;
  /** The chat host's active-preset params — used by the quiet-generate factory (compaction), which runs on the
   *  chat connection. Wired at compose. */
  readonly resolveChatPresetParams: ResolveChatPresetParamsOp;
  /** The room host's app-tier prose overrides — read by assembly (the anchor identity lead-in), the smart
   *  arbiter, compaction and the memory build. Empty ⇒ the shipped defaults. */
  readonly resolveChatProse: ResolveChatProseOp;
  /** B7 — a user's per-user reaction defaults (`UserSettings.chat.{reactionsEnabled,charactersCanReact}`),
   *  the VERB-TIME half of the resolve pair: `toggleReaction`/`listReactions`/`reactAsCharacter` gate on
   *  `resolveReactionsEnabled(room, hostDefault)` and no ForeignInputs exists outside the turn path (the
   *  turn's own reads ride `ChatBehaviorInputs`). Called with the room's PRESENT HOST id — the host governs
   *  the posture, never the caller. Wired at compose over the settings read (chat never imports settings). */
  readonly readReactionDefaults: ReadReactionDefaultsOp;
  readonly resolveChat: ResolveChatConnectionOp;
  readonly getCard: GetCardOp;
  /** Discovery's distillates for the owner's characters, keyed by id; an undistilled or foreign id is absent.
   *  Injected because `character_summaries` is discovery's table. */
  readonly resolveCharacterDistillates: ResolveCharacterDistillatesOp;
  /** HOST HANDOFF, the accepted offer's card arm: copy the DEPARTING host's seated cards into the NOMINEE's
   *  library, point-in-time. Injected because `characters` is the character domain's table; find-before-mint by
   *  provenance, so a retried accept converges on the copies it already made. A source id that no longer
   *  resolves under the old host is simply absent from the result and its seat takes the built D64 drop. */
  readonly copyHandoffCards: CopyHandoffCardsOp;
  /** HOST HANDOFF, the accepted offer's lore arm: copy the seated cards' attached books AND the departing
   *  host's chat-attached books into the nominee's library, returning the UNEXECUTED `chat_books` re-point the
   *  swap batch commits. Injected because the world-info tables are world-info's; a reference-carry would lose
   *  the lore silently (the character-book pool is owner-filtered). */
  readonly copyHandoffBooks: CopyHandoffBooksOp;
  /** HOST HANDOFF, the accepted offer's REGEX arm: copy the departing host's chat-tier scripts into the
   *  nominee's library, returning the UNEXECUTED `chat_regex_scripts` re-point the swap batch commits.
   *  Injected because `regex_scripts` is the regex domain's. Without it the departed host keeps an EDITABLE
   *  find/replace running on the transferred room's prompts and rendered output — the chat-book license,
   *  except executable, and un-flippable by anyone still in the room. */
  readonly copyHandoffRegexScripts: CopyHandoffRegexScriptsOp;
  /** HOST HANDOFF, the NOMINATE-side disclosure: how many books / scripts an accept would land in
   *  the nominee's library. Injected for the same reason their copy twins are — the tables are world-info's
   *  and regex's — and they exist as their own ops rather than as a dry-run flag on the copies because a
   *  disclosure must be UNABLE to write: the nomination happens before consent, and an op that could mint is
   *  an op that eventually will. Each lives in its copy's own file over its copy's own plan resolver, so
   *  what the row promises and what the accept does cannot drift into two rules. */
  readonly countHandoffBooks: CountHandoffBooks;
  readonly countHandoffRegexScripts: CountHandoffRegexScripts;
  /** HOST HANDOFF, the accepted offer's memory arm: the UNEXECUTED digest re-key (`chat_digests.scopedCharacterId`
   *  + `chat_digest_speakers.characterId`) for THIS chat. Injected because both tables are the embeddings
   *  domain's; without it the departed host's card DELETE would cascade the transferred room's memory away. */
  readonly restampHandoffDigests: RestampHandoffDigestsOp;
  readonly resolveCharacterTags: ResolveCharacterTagsOp;
  readonly resolveSeatDeco: ResolveSeatDecoOp;
  readonly resolveSeatDecos: ResolveSeatDecosOp;
  readonly mintSyntheticGroupCharacter: MintSyntheticGroupCharacterOp;
  readonly findSyntheticGroupCharacter: FindSyntheticGroupCharacterOp;
  readonly resolveUserPublics: ResolveUserPublicsOp;
  readonly loadUserHandles: LoadUserHandlesOp;
  readonly resolveAssetHash: ResolveAssetHashOp;
  readonly filterOwnedAssetIds: FilterOwnedAssetIdsOp;
  readonly filterOwnedImageAssetIds: FilterOwnedAssetIdsOp;
  /** Materialize a user-pasted external background URL into an owned CAS asset — the
   *  `setChatBackground` verb runs it for a `kind:"external"` source so a persisted carried background is
   *  always same-origin-paintable (an external URL is CSP-blocked). Compose-built from infra + assets.store. */
  readonly materializeBackground: MaterializeBackgroundOp;
  readonly summarize: SummarizeOp;
  /** The FUNDER's bound rerank role for Smart's default speaker pick, or null when the role is unbound. Resolved
   *  per call through `roleClientsFor(funder)`, so whatever model the user bound is what ranks. */
  readonly resolveSpeakerReranker: (funderUserId: UserId) => Promise<SpeakerReranker | null>;
  /** The FUNDER's Utility role for Smart's opt-in arbiter, or null when it is unbound or its model can serve no
   *  structured-output vehicle. Null is the arbiter's visible degrade, never a free-text call. */
  readonly resolveSpeakerArbiter: (funderUserId: UserId, chatId: ChatId) => Promise<SpeakerArbiter | null>;
  /** The FUNDER's summarize model's context window (tokens) — the memory build's token-guard fits each
   *  summarizer call to the actual context. Resolved PER CALL through `roleClientsFor(funder).resolved("summarize")`
   *  (inference program §7.5-1b: `capability.context.window`, no bespoke getter); a funder whose summarize task
   *  cannot run gets the named availability refusal thrown. */
  readonly summarizerContextTokens: (funderUserId: UserId) => Promise<number>;
  /** Can the FUNDER's summarize task run, and if not, why. The memory backfill reads it once per sweep: with no
   *  summarize connection bound (`no-connection`) digests are not derivable, the same as Memory off. */
  readonly summarizeAvailability: (funderUserId: UserId) => Promise<SendAvailability>;
  /** The FUNDER's EMBED model's window (tokens) — the segment build's window guard. A verbatim block that
   *  cannot fit is SKIPPED AND RECORDED, never truncated. Same per-call resolution as above. */
  readonly embedContextTokens: (funderUserId: UserId) => Promise<number>;
  /** The FUNDER's Utility-role preset params (D304), `undefined` under task defaults. The arbiter and the memory
   *  build fold them over their task posture; read per call, so a changed choice reaches the next summarize. */
  readonly resolveUtilityPresetParams: ResolveUtilityPresetParams;
  readonly emitNotification: NotificationsEmitOp;
  readonly resolveHandle: ResolveHandleOp;
  /** The disabled-account containment gate (owner-ruled): whether a human's backing `users` row
   *  is enabled. Read fresh per call (never cached), mirroring `sessions.validate`'s per-request re-check, so
   *  an admin disable propagates the very next round. Chat never reads `users` itself — see
   *  `resolveHandle`. Feeds {@link isBackingUserEnabled} (`substrate/participant-actor.ts`) at the ONE
   *  consumer that already gates a human's identity on presence (`presentHumanUserIdsOf`,
   *  `substrate/participants-humans.ts`) — a disabled human's PERSONA drops from the room's foreign-input consent
   *  set the same way a departed member's already does. */
  readonly resolveUserEnabled: ResolveUserEnabled;

  readonly readPresence: PresenceReadOp;
  readonly generatePicture: GeneratePictureOp;
  /** The injected rpg turn ops (D58). Null when rpg isn't wired — byte-identical no-op. */
  readonly rpg: ChatRpgOps | null;
  /** The S2 teaching registry ({@link ChatTeachingRegistry}), assembled at `entry/compose`. REQUIRED and
   *  non-nullable on purpose, unlike the `rpg`/`tools` null-op ops beside it: the null-op
   *  default belongs on the compose INPUT (`[...createChatTeachingContributions(), ...(input.teaching ?? [])]`),
   *  because chat's OWN contribution is the rpg-gather projection — a ctx that could silently omit the
   *  registry would silently drop a game turn's state block. An EMPTY array is the honest "nothing teaches"
   *  value, and tsc forces every ctx builder to state it. */
  readonly teaching: ChatTeachingRegistry;
  /** The per-turn plugin-macro resolve (U6, §5.15) — `null` when no plugin host is wired (byte-identical). */
  readonly pluginMacros: ResolvePluginMacrosOp | null;
  /** The plugin-macro names a preview lists beside the turn's resolution; `null` with `pluginMacros`. */
  readonly listPluginMacros: ListPluginMacrosOp | null;
  readonly resolveDefaultPersona: ResolveDefaultPersonaOp;
  readonly resolveCurrentPersona: ResolveCurrentPersonaOp;
  readonly resolveConnectedPersona: ResolveConnectedPersonaOp;
  readonly verifyPersonaOwned: VerifyPersonaOwnedOp;
  readonly resolveMemoryEmbedSpace: ResolveMemoryEmbedSpaceOp;
  readonly embeddingsStore: EmbeddingsStoreOp;
  readonly embeddingsStoreSegments: EmbeddingsStoreSegmentsOp;
  readonly embeddingsPruneBlocks: EmbeddingsPruneBlocksOp;
  readonly resolveCorpusSourceState: ResolveCorpusSourceState;
  readonly searchDigests: SearchDigestsOp;
  /** The databank slot GATHER op (DB6) — OPTIONAL; absent = the null-op byte-identical no-op. */
  readonly gatherDatabank?: GatherDatabankOp;
  /** The structured memory observability sink. */
  readonly log: MemoryLog;
  /** The recall FLIGHT RECORDER sink — every `{{memory}}` recall's slice, ring-buffered by the
   *  compose-built recorder and read host-only at `/api/_debug/memory/recalls`. OPTIONAL: absent (a
   *  hand-built ctx, a unit test) ⇒ nothing records and recall is byte-identical. */
  readonly recordRecall?: MemoryRecallSink;
  /** The recall-PHASE emitter — the live feed the header brain-icon reflects (recalling → recalled:N).
   *  OPTIONAL: absent (a hand-built ctx, a unit test) ⇒ nothing emits and recall is byte-identical. Wired at
   *  compose to the LIVE-ONLY `memoryRecall` bus member. */
  readonly emitRecallPhase?: MemoryRecallPhaseEmitter;
  readonly resolvePromptVariables: ResolvePromptVariablesOp;
  /** The chat's active preset's authored user macros, resolved under the host's settings — the picks pane's declaration half. Empty means no authored macros (or a hostless/stale room). */
  readonly resolvePromptUserMacros: ReadChatUserMacrosOp;
  /** ⑧(a) — the caller's `UserSettings.chat.tempChatTtlHours`, the per-user temporary-chat reap TTL (the
   *  FOREIGN-inputs seam: chat never reads the settings domain; wired at compose from `loadUserSettings`).
   *  Always resolves (the setting is `.default`ed); `reapTemporaryChats` converts hours→ms for its cutoff. */
  readonly resolveTempChatTtlHours: ResolveTempChatTtlHoursOp;
  /** The caller's `UserSettings.seeds.welcomeAssistantCharacterId` — the card a chat started with no characters
   *  seats, so a blank chat still has someone to answer. Raw and unvalidated: the start verb reads the card. */
  readonly resolveWelcomeAssistantId: ResolveWelcomeAssistantIdOp;
}

/** Resolve a user's temporary-chat reap TTL in HOURS (`UserSettings.chat.tempChatTtlHours`). */
type ResolveTempChatTtlHoursOp = (userId: UserId) => Promise<number>;

/** Resolve a user's welcome assistant card id, or null when unset. */
type ResolveWelcomeAssistantIdOp = (userId: UserId) => Promise<CharacterId | null>;

/** What `createChatService` receives from the entry root: collaborators not on {@link ChatContext} and not
 *  built inside the composition root. */
export interface ChatServiceDeps {
  /** The chat bus emit (durable-first). */
  readonly emit: EmitDurableChatEventOp;
  /** The same durable-first emit with its append verdict preserved. Roster handoff alone supplies a claim:
   * its marker owns one append, a losing retry converges, and an append failure rolls the claim back. */
  readonly emitChecked: (event: DurableChatBusEvent, claimStatement?: StatementToken) => Promise<boolean>;
  /** Where each turn still open in the chat entered the durable log, by `seq`. */
  readonly openTurns: (chatId: ChatId) => ReadonlyMap<ChatTurnId, number>;
  /** Prepare the new room's first durable event for the creation batch, then fan that already-committed row
   * without a second append. Restricted to chatCreated because only birth proves seq=1 by construction. */
  readonly prepareCreationEvent: (event: Extract<DurableChatBusEvent, { readonly type: "chatCreated" }>) => {
    readonly statement: StatementToken;
    readonly publishCommitted: () => void;
  };
  /** The LIVE-ONLY fan — no `chat_events` append, no seq, nothing to replay. The ONLY door `chatDeleted`
   *  takes: its durable row would cascade away with the very chat it announces, and being append-free is
   *  what lets the removing verbs DELETE FIRST and fan only what `RETURNING` proves gone (R1-4a). */
  readonly emitLive: (event: LiveOnlyChatBusEvent) => void;
  /** The in-flight lock-free turn registry (abort + concurrency). */
  readonly activeTurns: ActiveTurns;
  /** The seeded PRNG for arbitration sampling. */
  readonly prng: RandomSource;
  /** The inter-turn delay for the auto-mode chain. */
  readonly delay: DelayOp;
  /** The frozen room HOST's chat connection for a turn. The room binds nothing (F20), so `chatId` is provenance
   *  only; `actor` (a rule's requested turn) folds that actor's own binding first. */
  readonly resolveConnection: (args: {
    readonly funderUserId: UserId;
    readonly chatId: ChatId;
    readonly actor?: BindingActor | undefined;
  }) => Promise<Resolved<"chat">>;
  /** The deterministic pre-send serveability verdict for the room HOST's chat connection — the
   *  honest-refusal gate the composer disables SEND on. Fires no turn or API call. Wired at the composition root. */
  readonly checkSendAvailability: (args: { readonly funderUserId: UserId; readonly chatId: ChatId }) => Promise<SendAvailability>;
  readonly getNextTurnConnection: (args: { readonly funderUserId: UserId }) => Promise<NextTurnConnectionView>;
  readonly resolveForeignInputs: ResolveForeignInputsOp;
  /** The lock holder tag (this replica/turn id) for stale-takeover + holder-scoped release. */
  readonly holder: string;
  /** The per-chat lock TTL (ms), sized for one turn. */
  readonly lockTtlMs: number;
  /** D259 — the foreign halves of the signup-invite ops (sessions account statement, minter check, audit). */
  readonly signup: SignupInviteDeps;
}
