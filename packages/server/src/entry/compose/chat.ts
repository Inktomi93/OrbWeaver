// Chat domain's slice of the composition root: wires the widest DI bundle in the system (ChatContext +
// ChatServiceDeps). Owns no business logic.
//
// Identity impedance: chat's cross-feature ops are keyed by the frozen host `UserId` (the host may be
// offline, so no request Principal exists). Two bridges: role-irrelevant ops use the cheap synthetic
// `hostPrincipal`; role-sensitive ops (owner-gates) use the injected `resolveHostPrincipal`.

import type { DurableChatBusEvent, LiveOnlyChatBusEvent, VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import { SIGNUP_INVITES_MINTABLE } from "@orb/contracts/chat";
import type { AuthMode, Can, Principal } from "@orb/contracts/identity";
import type { UserIntent, UserMacroSpec } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import type { ChatRequest, ChatResult, RoleClientsWithSignal } from "@orb/inference";
import type { ChatId, Handle, IdSource, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { TimerScheduler } from "@orb/kit/time";
import { createSignupMinterCheck as createAdminSignupMinterCheck } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import { createChatAssetOps } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import { createCharacterRoomProjections, createCopyHandoffCards, createLoadSeatCards } from "#domain/character";
import type {
  BeginGenerationObservation,
  backfillGroupCharacters,
  backfillMemory,
  ChatBoundBackfillOps,
  ChatContext,
  ChatService,
  ChatServiceDeps,
  ClaimChatOp,
  estimateMemoryBackfillCalls,
  GetMembership,
  GetPendingUserText,
  ImageRefAssets,
  MemoryRecallRecorder,
  PostNarratorMessage,
  PresenceReadOp,
  PromptTransformRegistry,
  RequestTurnOp,
  ResolveCanonWindow,
  ResolveRpgCardCorpus,
  ResolveRpgParticipants,
  SetRpgPointer,
  SignupInviteDeps,
  SignupInviteOps,
} from "#domain/chat";
import {
  applyStandaloneVariableOps,
  createActiveTurns,
  createChatBoundBackfillOps,
  createChatInferenceOps,
  createChatMemorySearchOps,
  createChatRoomInputs,
  createChatService,
  createChatTeachingContributions,
  createEmitChatChanged,
  createGenerationObservationSession,
  createGetMembership,
  createGetPendingUserText,
  createPostNarratorMessage,
  createPromptTransformRegistry,
  createReactAsCharacter,
  createResolveCanonWindow,
  createResolveMediaRef,
  createResolveRpgCardCorpus,
  createResolveRpgParticipants,
  createSetRpgPointer,
  activePersonaIdFor as domainActivePersonaIdFor,
  buildChatToolOps as domainBuildChatToolOps,
  createGeneratePictureOp as domainCreateGeneratePictureOp,
  createRunChatTurnBridge as domainCreateRunChatTurnBridge,
  createTaskWindowReaders as domainCreateTaskWindowReaders,
  createTurnPersonaResolver as domainCreateTurnPersonaResolver,
  speakerArbiterFor as domainSpeakerArbiterFor,
  voicePersonaFor as domainVoicePersonaFor,
  getGroupConfig,
  getRoomOverrides,
  loadPresentHostUserId,
} from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import { createResolveOwnedDistillates } from "#domain/discovery";
import type { EmbeddingsService } from "#domain/embeddings";
import { createHandoffRestampStatements, createMemoryEmbeddingOps } from "#domain/embeddings";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import { createRecordAndPublishNotification } from "#domain/notifications";
import type { PersonaService, ResolvePersonasForParticipants } from "#domain/persona";
import { createPersonaOwned, createResolveConnectedPersona, createResolvePersonaSeedPointers, createResolveUserPublics } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import { createLoadOptionalPreset } from "#domain/preset";
import type { ResolveRegexSources } from "#domain/regex";
import { createCopyHandoffRegexScripts, createCountHandoffRegexScripts } from "#domain/regex";
import type { SearchService } from "#domain/search";
import { withRetrievalDegrade } from "#domain/search";
import { createTokenHasher, selectHandleById } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import {
  applyCharacterStatsDelta as appendCharacterStatsDelta,
  applyStatsDelta as appendStatsDelta,
  bumpStatsCanonVersion,
  createResolveRetainedChatAccountingScope,
  createResolveRetainedChatRebase,
  settleRetainedChatRebase,
} from "#domain/stats";
import type { ResolvedToolSet, ToolUseService } from "#domain/tool-use";
import { createCopyHandoffBooks, createCountHandoffBooks } from "#domain/world-info";
import type { AuditEntry } from "#foundation/observability";
import { buildAuditStatement, buildAuditStatementIfPrecedingWrote, recordMemoryLog } from "#foundation/observability";
import { systemTimers, waitForTimer } from "#infra/timers";
import { createRegexApplyReplace, createRegexTest } from "#primitives/regex";
import type { LiveBuses } from "#transport/trpc";

import { createReactToolDefinition } from "./chat-tools.ts";
import { minter } from "./minter.ts";

export const createSignupMinterCheck = createAdminSignupMinterCheck;
export const activePersonaIdFor = domainActivePersonaIdFor;
export const voicePersonaFor = domainVoicePersonaFor;
export const createTurnPersonaResolver = domainCreateTurnPersonaResolver;
export const buildChatToolOps = domainBuildChatToolOps;
export const createRunChatTurnBridge = domainCreateRunChatTurnBridge;
export const createTaskWindowReaders = domainCreateTaskWindowReaders;
export const createGeneratePictureOp = domainCreateGeneratePictureOp;
export const speakerArbiterFor = domainSpeakerArbiterFor;

/** Per-chat turn-lock TTL (ms) — auto-expires so a crashed holder's lock is takeover-eligible. */
const CHAT_LOCK_TTL_MS = 120_000;

// @orb-waive no-inline-package-interface(ChatComposeInput): baselined when the gate landed; burn-down item 952.
/** What `buildChatService` needs from the composition root — boot primitives + the already-built sibling
 *  services chat's injected ops route through (their front doors only). */
export interface ChatComposeInput {
  readonly publishChatChanged: LiveBuses["user"]["publishChatChanged"];
  readonly publishNotification: LiveBuses["notifications"]["publishNotification"];

  readonly timers?: TimerScheduler;
  readonly backgroundSignal?: AbortSignal;
  readonly trackBackground?: ChatContext["trackBackground"];
  readonly random?: (() => number) | undefined;
  readonly idSource?: IdSource;
  /** A user's Utility-role preset params (`side-gen-params.ts`), for the arbiter and the memory build. */
  readonly resolveUtilityPresetParams: ChatContext["resolveUtilityPresetParams"];
  readonly mediaProcessing: Pick<ImageRefAssets, "frameCount" | "prepareVideo">;
  /** Optional — absent wires `ChatContext.tools` to null (byte-identical no-op). */
  readonly toolUse?: ToolUseService | undefined;
  readonly db: Db;
  readonly now: () => number;
  /** The one chat bus's durable-first emit, built at the composition root and injected so chat doesn't
   *  construct a second bus. The same wrapper backs persona's active-persona write. */
  readonly emitChatEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** The same emit with the durable append verdict retained for resumable host-handoff completion. */
  readonly emitChatEventChecked: ChatServiceDeps["emitChecked"];
  /** The chat bus's prepared birth-event seam: statement joins room creation; callback fans after commit. */
  readonly prepareChatCreationEvent: ChatServiceDeps["prepareCreationEvent"];
  /** The same bus's LIVE-ONLY fan (no `chat_events` append). Chat's one consumer is `chatDeleted`, whose
   *  durable row cascades away with the chat it announces — see the lifecycle verbs' DELETE-FIRST header. */
  readonly emitChatEventLive: (event: LiveOnlyChatBusEvent) => void;
  /** The lock-holder tag for this replica (also used by the boot lock reclaim). */
  readonly holder: string;
  readonly sessionSecret: string | null;
  /** The frozen-host → `Principal` bridge for role-sensitive ops. */
  readonly resolveHostPrincipal: (userId: UserId) => Promise<Principal>;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly can: Can;
  /** D121-E: the regex domain's four-scope resolve op (the host-tier sources a turn assembles against). */
  readonly resolveRegexSources: ResolveRegexSources;
  /** The per-FUNDER role-client binder (§8.5b): every chat-side side call — arbiter, digests, extract-quiet —
   *  spends the TRIGGER's rows; the vector writes and reads use the room HOST's (vector tasks are owner-scoped). */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly connection: Pick<ConnectionService, "resolve" | "availability" | "getBoundConnection">;
  readonly character: CharacterService;
  readonly persona: PersonaService;
  /** The persona domain's PRINCIPAL-LESS participants op (`domain/persona/contract/ops.ts`) — the ONE room-plane
   *  persona read the FOREIGN-inputs resolver uses. Separate from `persona` because `PersonaService` is
   *  Principal-scoped by contract, and a room's assembly has no single Principal to read as (D106). */
  readonly resolvePersonasForParticipants: ResolvePersonasForParticipants;
  readonly preset: PresetService;
  readonly settings: SettingsService;
  readonly notifications: NotificationsService;
  readonly resolveHandle: (handle: Handle) => Promise<UserId | null>;
  /** The disabled-account containment read (`createResolveUserEnabled` over sessions). */
  readonly resolveUserEnabled: ChatContext["resolveUserEnabled"];
  /** D259 — the live `AUTH_MODE`: it picks whether invites may create accounts and stamps every invite. */
  readonly authMode: AuthMode;
  /** D259 — the foreign halves of the signup batch, all built at the root: the sessions account statement, the
   *  persona statement, the settings pointer statement, and the minter's standing check. */
  readonly signup: Pick<SignupInviteDeps, "signupUserStatement" | "signupPersonaStatement" | "signupPersonaPointersStatement" | "minterMayMintSignup">;

  readonly search: SearchService;
  readonly embeddings: EmbeddingsService;
  /** #250 — the memory-recall flight recorder built at the composition root; its `sink` becomes
   *  `ChatContext.recordRecall` so every `{{memory}}` recall lands in the ring `/api/_debug/memory/recalls`
   *  tails. OPTIONAL: absent ⇒ nothing records (an int test that builds chat without the recorder), and recall
   *  is byte-identical either way. */
  readonly recallRecorder?: MemoryRecallRecorder | undefined;
  /** The databank `{{databank}}`-slot GATHER op (DB6) — OPTIONAL; absent wires `ChatContext.gatherDatabank`
   *  to undefined (byte-identical no-op). Bridged from `databank.gatherRetrieval` at the composition root. */
  readonly gatherDatabank?: ChatContext["gatherDatabank"];
  /** The compose-tier executor FENCE (§7.5-1a): chat receives exactly the bound `runChatTurn`. */
  readonly runChatTurn: (req: ChatRequest) => Promise<ChatResult>;
  /** The deployment's Anthropic prompt-cache depth FLOOR, read per turn off the resolved AppSettings tier
   *  (`EffectiveAppConfig.promptCacheMinDepth`, Settings › Admin › System tuning). A thunk, not a value, so an
   *  admin flip reaches the next turn without a restart. Absent ⇒ the floor 0 (byte-identical no-op). */
  readonly promptCacheMinDepth?: () => number;
  readonly assets: AssetsService;
  /** Materialize a user-pasted external carried-background URL into an owned CAS asset (side-eye F-P0-2) — the
   *  shared compose-built op the `setChatBackground` verb runs for a `kind:"external"` source. */
  readonly materializeBackground: MaterializeBackgroundOp;
  /** §6.7's inline-reply picture store, built at the keystone (it needs the boot-level per-image byte cap) —
   *  the `materializeBackground` precedent one line up. */
  readonly storeInlineReplyImage: ChatContext["storeInlineReplyImage"];
  readonly readPresence: PresenceReadOp;
  /** imagery's orchestrator → chat's `generatePicture` op (mapped to the chat-local structural result below). */
  readonly generatePicture: ImageryService["generatePicture"];
  /** The injected rpg turn ops (docs/plans/rpg/design.md) — OPTIONAL; absent wires `ChatContext.rpg` to null
   *  (byte-identical no-op). Built at the composition root over the rpg service + its standalone gather op. */
  readonly rpg?: ChatContext["rpg"] | undefined;
  /** FOREIGN S2 teaching contributions — OPTIONAL; absent wires the
   *  registry to chat's own contribution alone (byte-identical no-op, the `rpg` precedent).
   *  Chat's own contributor is ALWAYS present, which is why the ctx field itself is not nullable. */
  readonly teaching?: ChatContext["teaching"] | undefined;
  /** The per-turn PLUGIN-MACRO resolve — OPTIONAL; absent wires
   *  `ChatContext.pluginMacros` to null (byte-identical no-op, the `rpg` precedent). Minted at the
   *  composition root as the plugin-macro registry's `resolveForTurn`, so chat and the plugin plane share ONE
   *  registry without either importing the other. */
  readonly pluginMacros?: ChatContext["pluginMacros"] | undefined;
}

// @orb-waive no-inline-package-interface(ChatComposeResult): baselined when the gate landed; burn-down item 952.
/** The chat compose product: the service + the bus's durable-first emit, surfaced for other producers that
 *  publish onto the chat bus (e.g. world-info). */
export interface ChatComposeResult extends AsyncDisposable {
  readonly service: ChatService;
  readonly emitBusEvent: (event: DurableChatBusEvent) => Promise<void>;
  /** The generic, principal-free chat ops domain/rpg receives by injection — built over chat's own
   *  ctx here (chat never learns rpg). Wired onto `RpgContext.chat` at the rpg compose block. */
  readonly rpgChatOps: {
    readonly beginGenerationObservation: BeginGenerationObservation;
    readonly getMembership: GetMembership;
    readonly postNarratorMessage: PostNarratorMessage;
    readonly getPendingUserText: GetPendingUserText;
    /** The opaque pointer write — `createGame`, the `updateConfig` engaged toggle and the game fork call it. */
    readonly setRpgPointer: SetRpgPointer;
    /** The husk→real transition (R0), the chat service's own instance: every rpg host write claims its room. */
    readonly claimChat: ClaimChatOp;
    /** The roster projection — the tracker view's roster ∪ sheets source. */
    readonly resolveRpgParticipants: ResolveRpgParticipants;
    /** The chat's PRESENT host userId (role='host', D19) — the human the rpg resync resolves its
     *  connection/creds under + the capability verdict keys on. Resolved by ROLE, never join order (a handoff
     *  swaps roles in place — the first-joined human is NOT the host). `null` = a hostless/stale room. */
    readonly resolveHostUserId: (chatId: ChatId) => Promise<UserId | null>;
    /** The DEEP canon-window read (crunchy-cluster §1.3) — the `resyncFromStory` host verb's story feed, sharing
     *  the engine's transcript projection (chat owns canon reads; rpg reads no chat table). */
    readonly resolveCanonWindow: ResolveCanonWindow;
    /** The BORN-STATE corpus read (the host `populateFromCharacter` round): one roster character's card prose
     *  + the room's opening line (chat owns the card + canon reads; rpg reads no table). */
    readonly resolveCardCorpus: ResolveRpgCardCorpus;
    /** The chat's ACTIVE-preset user macros (WAVE MU) — the same resolution the picks pane reads, so the GM
     *  console's shadow gloss names the exact defs a game macro would shadow (chat owns preset resolution for
     *  a chat; rpg re-deriving it would be a second home for the rule). */
    readonly resolvePromptUserMacros: (chatId: ChatId) => Promise<readonly UserMacroSpec[]>;
    /** The chat's GM-PRESET prose overrides (PROSE-1 S4) — what the two rpg HOST DOORS (`resyncFromStory`,
     *  `populateFromCharacter`) resolve their extraction prose through. Chat owns preset resolution AND the
     *  GM-voice redirect; rpg reads no preset table, and re-deriving either here would be a second home for
     *  both rules.
     *
     *  TWO ARMS, TWO INVOCATION CLASSES — that difference is why this is not a duplicate of the turn path and
     *  must not be "unified" with it. A post-commit state ROUND rides the CAPTURED view its own turn already
     *  resolved (`RpgTurnContext.prose`): it runs AFTER that turn's prompt was assembled, so a second
     *  resolution moment there could disagree with the very prompt it is extracting from — a divergence by
     *  construction, ruled out. A VERB DOOR has no first resolution to diverge from; the consenting human
     *  clicked a button and this IS the moment, exactly as `resolvePromptUserMacros` is for the picks pane. */
    readonly resolveChatPresetProse: (chatId: ChatId) => Promise<ProseOverrides>;
    /** The same ladder's generation params, the one home of the room's Max context: a send on the room's chat
     *  connection outside the turn applies it with `withPresetWindow`, so it runs the window the turn sends. */
    readonly resolveChatPresetParams: (chatId: ChatId) => Promise<UserIntent>;
  };
  /** The D50 PromptTransform registrar — surfaced so automation's rule lifecycle
   *  + the plugin host `register`/`unregister` their `transform_draft` transforms onto the same list the
   *  turn pipeline applies. Zero registrants today (byte-identical no-op). */
  readonly promptTransforms: PromptTransformRegistry;
  /** The standalone (out-of-turn) runtime-variable write, bound over chat's own
   *  ctx — automation's `set_variable` chat-scope arm injects this at the composition root (chat learns
   *  nothing automation-shaped; principal-free — the author's authority was gated upstream). */
  readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[], expect?: readonly VariablePrecondition[]) => Promise<VariableWriteResult>;
  /** The room HOST's app-tier prose overrides for a chat (PROSE-1 §4.3, owner-decision 8 option (a)) —
   *  surfaced so automation's `set_chat_background` quiet pick reads the SAME host prose the room's other
   *  side generations do, instead of re-deriving the host itself. */
  readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
  /** The NON-HUMAN turn seam — automation's `trigger_turn` arm + the
   *  Tier-2 plugin membrane's `turn.trigger` inject this at the composition root. Principal-free: the funding
   *  host is resolved from the room, and the four walls (depth/authority/budget/consent) enforce inside the verb
   *  + the engine belts. See {@link RequestTurnOp}. */
  readonly requestTurn: RequestTurnOp;
  /** Is memory ON for this host (#156)? The admission gate's read, resolved through the SAME
   *  `resolveMemoryConfig` merge the live turn and the corpus sweep use, so the gate cannot drift from the
   *  per-host skip it exists to pre-empt. */
  readonly isMemoryEnabled: (hostUserId: UserId) => Promise<boolean>;
  readonly emptyMemoryScope: ChatBoundBackfillOps["emptyMemoryScope"];
  /** D259 — the signup-invite ops the entry signup route runs, built over chat's own ctx. */
  readonly signupInvites: SignupInviteOps;
  /** Chat's corpus sweeps, bound over the chat ctx. */
  readonly backfill: {
    readonly memory: (args: Parameters<typeof backfillMemory>[1]) => ReturnType<typeof backfillMemory>;
    readonly groupCharacters: (args: Parameters<typeof backfillGroupCharacters>[1]) => ReturnType<typeof backfillGroupCharacters>;
    readonly estimateMemory: (args: Parameters<typeof estimateMemoryBackfillCalls>[1]) => ReturnType<typeof estimateMemoryBackfillCalls>;
  };
}

/**
 * Construct the chat `ChatService` + its bus, wiring every {@link ChatContext} op + {@link ChatServiceDeps}
 * collaborator. Returns the service AND the bus emit.
 */
export function buildChatService(input: ChatComposeInput): ChatComposeResult {
  const { db, now, emitChatEvent } = input;
  const timers = input.timers ?? systemTimers;
  const lifetime = new AsyncDisposableStack();
  // biome-ignore lint/nursery/useDisposables: lifetime adopts this resource for the returned owner; local using would close it before callers can use the graph.
  const activeTurns: ChatServiceDeps["activeTurns"] = lifetime.use(createActiveTurns());

  // Role-irrelevant ops (getCard/persona.get/mint) use this cheap synthetic principal to avoid a per-call read.
  // @orb-waive one-principal-mint-population(Principal): synthetic role-irrelevant principal for frozen-host reads; ends when a shared factory replaces it
  const hostPrincipal = (userId: UserId): Principal => ({
    userId,
    role: "user",
    handle: castId<Handle>(userId),
    externalId: null,
    via: "fallback",
  });

  // Role-sensitive ops need the host's REAL role — a fabricated `role:"user"` would fail-closed-deny an
  // owner's own privileged turn, so this read is injected rather than faked.
  const realHostPrincipal = input.resolveHostPrincipal;

  const newChatTurnId = minter(ID_PREFIX.chatTurn, input.idSource);
  const inferenceOps = createChatInferenceOps({
    connection: input.connection,
    roleClientsFor: input.roleClientsFor,
    resolveHostPrincipal: realHostPrincipal,
    resolveUtilityPresetParams: input.resolveUtilityPresetParams,
    beginObservation: (parent) =>
      createGenerationObservationSession(
        { db, now, applyStatsDelta: (batch, opDb, delta) => appendStatsDelta(batch, opDb, delta, input.idSource) },
        parent,
        chatCtx,
      ).onObservedResult,
    newChatTurnId,
  });
  const personaOwned = createPersonaOwned(db);
  const resolveChatHostUserId = (chatId: ChatId): Promise<UserId | null> => loadPresentHostUserId(db, chatId);
  const roomInputs = createChatRoomInputs({
    loadUserSettings: input.settings.loadUserSettings,
    getEffectiveConfig: input.settings.getEffectiveConfig,
    loadOptionalPreset: createLoadOptionalPreset(input.preset.get),
    resolveHostUserId: resolveChatHostUserId,
    resolveTurnPersonas: createTurnPersonaResolver(input.resolvePersonasForParticipants),
    rpg: input.rpg ?? null,
  });
  const { resolvePromptVariables, resolvePromptUserMacros, resolveChatProse, resolveChatPresetProse, resolveChatPresetParams, resolveMemoryConfig } =
    roomInputs;
  // The D50 PromptTransform registrar — one per deploy. Zero registrants today
  // (automation A7 + the plugin host register onto it later); its `apply` is the `ChatContext.promptTransforms`
  // op, so a chat with no transforms assembles + streams byte-identically.
  // Item 2: the per-transform deadline is a live admin knob (promptTransformDeadlineMs) — read per apply.
  const assetOps = createChatAssetOps({ assets: input.assets, resolvePrincipal: input.resolveHostPrincipal });
  const characterProjections = createCharacterRoomProjections({
    get: input.character.get,
    loadSeatCards: createLoadSeatCards(db),
    principalForUser: hostPrincipal,
    readRenderPolicy: () => input.settings.getEffectiveConfig(),
  });
  const personaPointers = createResolvePersonaSeedPointers({
    get: input.persona.get,
    loadUserSettings: input.settings.loadUserSettings,
    principalForUser: hostPrincipal,
  });
  const memorySearch = createChatMemorySearchOps({
    resolveHostUserId: resolveChatHostUserId,
    digests: input.search.digests,
    corpus: input.search.corpus,
    withRetrievalDegrade,
  });
  const promptTransformRegistry = createPromptTransformRegistry(
    emitChatEvent,
    () => input.settings.getEffectiveConfig().promptTransformDeadlineMs,
    timers.timeout,
  );

  const chatCtx: ChatContext = {
    resolveCorpusSourceState: input.search.resolveCorpusSourceState,
    db,
    now,
    timers,
    ...(input.backgroundSignal === undefined ? {} : { backgroundSignal: input.backgroundSignal }),
    ...(input.trackBackground === undefined ? {} : { trackBackground: input.trackBackground }),
    can: input.can,
    newChatId: minter(ID_PREFIX.chat, input.idSource),
    newMessageId: minter(ID_PREFIX.message, input.idSource),
    newMessageVariantId: minter(ID_PREFIX.messageVariant, input.idSource),
    newMessageAssetId: minter(ID_PREFIX.messageAsset, input.idSource),
    newMessageReactionId: minter(ID_PREFIX.messageReaction, input.idSource),
    newParticipantId: minter(ID_PREFIX.chatParticipant, input.idSource),
    newInjectionId: minter(ID_PREFIX.chatInjection, input.idSource),
    newEventId: minter(ID_PREFIX.chatEvent, input.idSource),
    newStreamEventId: minter(ID_PREFIX.chatStreamEvent, input.idSource),
    newStreamGenerationId: minter(ID_PREFIX.chatStreamGeneration, input.idSource),
    newInviteId: minter(ID_PREFIX.chatInvite, input.idSource),
    newPendingTurnId: minter(ID_PREFIX.pendingTurn, input.idSource),
    newChatTurnId,
    newCompactionSpendId: minter(ID_PREFIX.compactionSpend, input.idSource),
    hashToken: createTokenHasher(input.sessionSecret),
    signupInvites: { mode: input.authMode, mintable: SIGNUP_INVITES_MINTABLE[input.authMode] },
    audit: input.audit,
    auditStatement: (entry, at) => buildAuditStatement(db, entry, at, input.idSource),
    // Fans chatsChanged to every present human member's channel; the engine passes a bare chatId
    // (principal-blind) — this composition-root helper enumerates membership.
    emitChatChanged: createEmitChatChanged({ db }, input.publishChatChanged),
    applyRegexReplace: createRegexApplyReplace(),
    testRegexKey: createRegexTest(),
    // D121-E: the four-scope junction dereference (global/preset/cast/room). Chat owns the UNION
    // (`substrate/regex-tier`), the regex domain owns the STORAGE — one seam, no blob copies.
    resolveRegexSources: input.resolveRegexSources,
    tools: input.toolUse === undefined ? null : buildChatToolOps<ResolvedToolSet>(input.toolUse, input.resolveHostPrincipal),
    // Bridges the chat role's streaming AsyncIterable onto the runtime's Promise+onDelta shape — the extracted
    // domain→runtime turn bridge (createRunChatTurnBridge), injecting the leaf `runChatTurn` (the §7.5-1a fence).
    runChatTurn: createRunChatTurnBridge({
      runChatTurn: input.runChatTurn,
      ...(input.promptCacheMinDepth === undefined ? {} : { promptCacheMinDepth: input.promptCacheMinDepth }),
    }),
    resolveChatPresetParams,
    resolveChatProse,
    resolveChat: inferenceOps.resolveChat,
    getCard: ({ ownerId, characterId }) => input.character.getCard({ principal: hostPrincipal(ownerId), characterId }),
    resolveCharacterDistillates: createResolveOwnedDistillates(db),
    // ── HOST-HANDOFF COPY (stickler 2026-08-03 §5; the regex arm is #1739) — the four OWNING-domain write
    // factories the accepted property offer executes. Each lives in the domain that owns its tables and is
    // injected here, so chat never writes a `characters`, `world_books`, `regex_scripts` or `chat_digests`
    // row (`own-tables-only`). All four are unreachable without a stored offer, so an offer-less handoff
    // never calls any of them.
    copyHandoffCards: createCopyHandoffCards({
      db: input.db,
      bumpStatsCanonVersion,
      applyStatsDelta: (batch, opDb, delta) => appendStatsDelta(batch, opDb, delta, input.idSource),
      now: input.now,
      newCharacterId: minter(ID_PREFIX.character, input.idSource),
      // The picture RE-OWN, avatar AND carried background (#1426): `assets` is per-owner with an
      // `(owner_id, hash)` dedup (D21), so the copy cannot carry a source asset id verbatim — that would be a
      // pointer into a library the nominee cannot read AND a GC root holding the departed host's blob alive.
      // Content-addressing makes this cheap and idempotent (`created:false` when the recipient already has
      // those bytes). Ownership is PROVEN here: an asset that is not the departing host's yields `null` and
      // the copy lands without that picture rather than borrowing a stranger's blob. `kind` comes from the
      // CALLER because the CAS index is per-kind and the two carried pictures are genuinely different kinds.
      copyAsset: assetOps.copyAsset,
    }),
    copyHandoffBooks: createCopyHandoffBooks({
      db: input.db,
      now: input.now,
      newBookId: minter(ID_PREFIX.worldBook, input.idSource),
      newEntryId: minter(ID_PREFIX.worldEntry, input.idSource),
    }),
    copyHandoffRegexScripts: createCopyHandoffRegexScripts({
      db: input.db,
      now: input.now,
      newScriptId: minter(ID_PREFIX.regexScript, input.idSource),
    }),
    // …and their NOMINATE-side disclosure twins (#1762), each from the SAME domain file as its copy so the
    // number the nominee is shown comes out of the plan the accept executes. `db` only: these run before
    // the nominee has consented to anything, so they are structurally unable to mint (no clock, no minter).
    countHandoffBooks: createCountHandoffBooks(input.db),
    countHandoffRegexScripts: createCountHandoffRegexScripts(input.db),
    restampHandoffDigests: createHandoffRestampStatements({ db: input.db }),
    ...characterProjections,
    mintSyntheticGroupCharacter: (params) => input.character.mintSyntheticGroupCharacter(params),
    findSyntheticGroupCharacter: (params) => input.character.findSyntheticGroupCharacter(params),
    resolveUserPublics: createResolveUserPublics(
      { db },
      { loadUserHandle: (userId) => selectHandleById(db, userId), loadUserSettings: (userId) => input.settings.loadUserSettings(userId) },
    ),
    resolveImageUrl: createResolveMediaRef({
      db,
      assets: input.assets,
      mediaProcessing: input.mediaProcessing,
      forbidExternalMedia: () => input.settings.getEffectiveConfig().forbidExternalMedia,
    }),
    // A hash is not a secret; the owner-gate lives on the blob route's byte read, not here.
    resolveAssetHash: assetOps.resolveAssetHash,
    filterOwnedAssetIds: assetOps.filterOwnedAssetIds,
    materializeBackground: input.materializeBackground,
    storeInlineReplyImage: input.storeInlineReplyImage,
    // The chat op type erases the batch to `unknown`; this wrapper restores the concrete type.
    applyStatsDelta: (batch, opDb, delta) => {
      appendStatsDelta(batch as BatchStmt[], opDb, delta, input.idSource);
    },
    resolveRetainedChatAccountingScope: createResolveRetainedChatAccountingScope(db),
    applyCharacterStatsDelta: (batch, opDb, delta) => {
      appendCharacterStatsDelta(batch as BatchStmt[], opDb, delta, input.idSource);
    },
    resolveRetainedChatRebase: createResolveRetainedChatRebase(db),
    settleRetainedChatRebase: (batch, opDb, scope) => {
      settleRetainedChatRebase(batch as BatchStmt[], opDb, scope);
    },
    bumpStatsCanonVersion: (batch, opDb, ownerId) => {
      bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId);
    },
    summarize: inferenceOps.summarize,
    resolveSpeakerReranker: inferenceOps.resolveSpeakerReranker,
    resolveSpeakerArbiter: inferenceOps.resolveSpeakerArbiter,
    summarizerContextTokens: inferenceOps.summarizerContextTokens,
    summarizeAvailability: inferenceOps.summarizeAvailability,
    embedContextTokens: inferenceOps.embedContextTokens,
    resolveUtilityPresetParams: input.resolveUtilityPresetParams,
    // record INSERTs the row (assigning seq) THEN the persisted view is published onto the live bus —
    // a dead bus path never loses an event (subscriptions replay from the table by seq).
    resolveHandle: (handle) => input.resolveHandle(handle),
    // The disabled-account containment gate: read fresh per call; a gone userId fails closed to `false`
    // rather than throwing into roster assembly.
    resolveUserEnabled: input.resolveUserEnabled,

    // A solo-character founding with exactly ONE character_personas connection auto-anchors that persona;
    // 0 or 2+ connections (ambiguity) or a group founding falls through to the default seed.
    resolveConnectedPersona: createResolveConnectedPersona({ db }),
    ...personaPointers,
    verifyPersonaOwned: ({ ownerId, personaId }) => personaOwned(ownerId, personaId),
    emitNotification: createRecordAndPublishNotification(input.notifications.record, input.publishNotification),
    // Server-derived — never a client-asserted (spoofable) heartbeat.
    readPresence: input.readPresence,
    // Maps imagery's GeneratedPicture → chat's chat-local structural result (chat can't import
    // domain/imagery's types).
    generatePicture: createGeneratePictureOp(input.generatePicture),
    // A chat's digest/segment SPACE is its HOST's; the stores refuse a write whose owner is no longer the host.
    ...createMemoryEmbeddingOps({ embeddings: input.embeddings, resolveChatHostUserId }),
    // DB6: absent ⇒ the field stays unset ⇒ GATHER skips the databank branch (byte-identical no-op).
    ...(input.gatherDatabank !== undefined ? { gatherDatabank: input.gatherDatabank } : {}),
    ...memorySearch,
    log: (entry) => recordMemoryLog(entry),
    // #250 — absent recorder ⇒ the field stays unset ⇒ recall's `ctx.recordRecall?.()` is a no-op.
    ...(input.recallRecorder !== undefined ? { recordRecall: input.recallRecorder.sink } : {}),
    // #313 — the header brain-icon's live feed: recall (`recall/recall.ts`) BUILDS the `memoryRecall` event
    // (the domain owns its bus literal, the `turnStarted` precedent); this only fans it on the LIVE-ONLY lane
    // (ephemeral per-turn state, never persisted). The room-public payload carries only the count — the digest
    // detail stays host-only (the popover reads the assembly preview for it).
    emitRecallPhase: input.emitChatEventLive,
    getGroupConfig: (rawMetadata) => getGroupConfig(rawMetadata),
    getRoomOverrides: (rawMetadata) => getRoomOverrides(rawMetadata),
    resolveTempChatTtlHours: roomInputs.resolveTempChatTtlHours,
    resolveWelcomeAssistantId: roomInputs.resolveWelcomeAssistantId,
    readReactionDefaults: roomInputs.readReactionDefaults,
    resolvePromptVariables,
    resolvePromptUserMacros,
    // Null ⇒ rpg not wired (byte-identical no-op — the `tools` precedent). The 5 injected rpg
    // turn ops fire at GATHER / preset-resolve / send-commit / turn-end.
    rpg: input.rpg ?? null,
    // The S2 teaching registry: chat's OWN contribution (the rpg-gather
    // projection, order 0) plus whatever later rows wire in (C1's automation guidance is the next one).
    // Absent input ⇒ chat's alone ⇒ byte-identical, and the registry is never null so a game turn's state
    // block can never be silently dropped by a forgotten wiring.
    teaching: [...createChatTeachingContributions({ db }), ...(input.teaching ?? [])],
    // The D50 PromptTransform apply op — the registry's `apply`. Zero registrants ⇒ byte-identical.
    promptTransforms: promptTransformRegistry.apply,
    // The per-turn plugin-macro resolve (U6). Null ⇒ no plugin host wired (byte-identical no-op).
    pluginMacros: input.pluginMacros ?? null,
  };

  const chatDeps: ChatServiceDeps = {
    emit: emitChatEvent,
    emitChecked: input.emitChatEventChecked,
    prepareCreationEvent: input.prepareChatCreationEvent,
    emitLive: input.emitChatEventLive,
    activeTurns,
    prng: input.random ?? Math.random,
    delay: (ms) => waitForTimer(ms, timers.timeout, input.backgroundSignal),
    resolveConnection: inferenceOps.resolveConnection,
    checkSendAvailability: inferenceOps.checkSendAvailability,
    getNextTurnConnection: inferenceOps.getNextTurnConnection,
    resolveForeignInputs: roomInputs.resolveForeignInputs,
    holder: input.holder,
    lockTtlMs: CHAT_LOCK_TTL_MS,
    signup: {
      ...input.signup,
      // The `changes()`-guarded audit insert: it lands only when the seat before it landed (D259).
      auditStatementAfterWrite: (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at, input.idSource),
    },
  };

  const chatBundle = createChatService(chatCtx, chatDeps);
  // B7 — the `react` tool: chat's standalone write op closed into the ONE tool-use registry (the
  // definition is compose-homed, `./chat-tools.ts` — a domain-side file would close a `no-circular` loop
  // through tool-use's teaching contribution). Registered only when tool-use is wired, matching
  // `ChatContext.tools`'s null arm — an unwired deploy is byte-identical.
  if (input.toolUse !== undefined) {
    input.toolUse.register(createReactToolDefinition({ reactAsCharacter: createReactAsCharacter(chatCtx, { emit: emitChatEvent }) }));
  }
  // Every op built outside createChatService claims through the chat service's own instance: a second instance
  // has its own in-flight map, and two first claims racing on one room would replay the creation stats twice.
  const { claimChat } = chatBundle;
  return {
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
    service: chatBundle.service,
    emitBusEvent: emitChatEvent,
    rpgChatOps: {
      beginGenerationObservation: (parent) => createGenerationObservationSession(chatCtx, parent, chatCtx).onObservedResult,
      getMembership: createGetMembership(chatCtx),
      postNarratorMessage: createPostNarratorMessage(chatCtx, { emit: emitChatEvent, claimChat }),
      getPendingUserText: createGetPendingUserText(chatCtx),
      setRpgPointer: createSetRpgPointer(chatCtx, { claimChat }),
      claimChat,
      resolveRpgParticipants: createResolveRpgParticipants(chatCtx),
      resolveHostUserId: resolveChatHostUserId,
      resolveCanonWindow: createResolveCanonWindow(chatCtx),
      resolveCardCorpus: createResolveRpgCardCorpus(chatCtx),
      resolvePromptUserMacros,
      resolveChatPresetProse,
      resolveChatPresetParams,
    },
    promptTransforms: promptTransformRegistry,
    applyVariableOps: (chatId, ops, expect) => applyStandaloneVariableOps(chatCtx, chatId, ops, expect),
    resolveChatProse,
    requestTurn: chatBundle.requestTurn,
    signupInvites: chatBundle.signupInvites,
    ...createChatBoundBackfillOps(chatCtx, resolveMemoryConfig, () => input.settings.getEffectiveConfig().memoryDefaults),
  };
}
