// The explicit ChatContext DI bundle + every injected cross-feature op type. Homed under contract/ because
// the exported-type gate forbids it in the conventional context.ts slot; the top-level context.ts re-exports
// this. Every cross-feature/infra dependency is an injected op — chat never sideways-imports a sibling domain.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  ChatBusEvent,
  ChatInjection,
  GroupConfig,
  PromptTransform,
  PromptTransformPoint,
  RenderPolicy,
  RoomOverrides,
  ToolCallRecord,
  TurnAbortReason,
  TurnInitiator,
} from "@orb/contracts/chat";
import type { CredentialSource, ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Can, ChatRoster, ParticipantRole, Principal } from "@orb/contracts/identity";
import type { ImageDiffusionParams, PromptTemplateMode } from "@orb/contracts/imagery";
import type { NotificationEvent, PresenceView } from "@orb/contracts/notifications";
import type { ChoiceBlockSpec } from "@orb/contracts/preset";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { BlockKey, MemoryQueryOptions } from "@orb/contracts/search";
import type { ApplyStatsDelta } from "@orb/contracts/stats";
import type { MaterializeBackgroundOp, ThemeBackground, ThemeOverride } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import type { ContentImageRef } from "@orb/kit/content";
import type {
  AssetId,
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  ChatTurnId,
  Handle,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  PendingTurnId,
  PersonaId,
  PresetId,
  UserId,
} from "@orb/kit/ids";
import type { RegexReplacer } from "@orb/kit/regex";
import type { AuditEntry } from "#foundation/observability";
import type { ToolCallInput, WireTool } from "#infra/providers";
import type { ActiveTurns } from "./active-turns";
import type { ResolveForeignInputsOp } from "./foreign";
import type { MemoryLog } from "./memory";
import type { TurnRequest, TurnStreamChunk } from "./results";

/** The node:vm ReDoS watchdog wrapping a host-side regex `text.replace` in a per-call timeout, so a
 *  catastrophic-backtracking pattern throws instead of hanging the turn. */
export type ApplyRegexReplaceOp = (text: string, regex: RegExp, replacer: RegexReplacer) => string;

/** Options for {@link EmitChatChanged}. `detail` means the changed chat's own row changed (lifecycle/create/
 *  delete); omitted on the message-commit path (the per-chat bus already drives that). `extraUserIds` adds
 *  channels beyond the present roster (a just-kicked/deleted member). */
interface EmitChatChangedOptions {
  readonly detail?: boolean;
  readonly extraUserIds?: readonly UserId[];
}
/** Fans `chatsChanged` to every present human member's user-bus channel — the cross-device + multi-human
 *  chat-list recency driver. Best-effort, never throws into the turn. */
export type EmitChatChanged = (chatId: ChatId, options?: EmitChatChangedOptions) => Promise<void>;

/** The injected chat role: the engine builds a {@link TurnRequest} and streams chunks back. */
export type RunChatTurnOp = (req: TurnRequest) => AsyncIterable<TurnStreamChunk>;

/** Opaque to chat: the resolved tool set `resolveTools` returns and the other tool ops accept. */
export type ChatToolSet = unknown;

/** The identity frame the loop hands `executeToolCalls`. Deliberately no `Principal` — the engine is
 *  principal-blind. `roster` is null until a chat-scoped registrant exists. */
export interface ChatToolExecFrame {
  readonly runAsUserId: UserId;
  readonly triggeredBy: UserId;
  readonly chatId: ChatId;
  readonly roster: ChatRoster | null;
  /** The turn's ephemeral identity, minted once per `executeTurn` and threaded to the tool-exec context so a
   *  turn-scoped registrant correlates the turn's tool writes to its commit/abort flush (rpg-design/10 §R4). */
  readonly turnId: ChatTurnId;
  readonly signal?: AbortSignal | undefined;
}

/** The injected tool-use op bundle. `ChatContext.tools` is null when tool-use isn't wired, so the request
 *  never carries `tools` and the assembled request is byte-identical wired-unattached vs null. */
export interface ChatToolOps {
  /** Attach-time resolve (throws on an unknown name — a wiring bug, never model data). */
  readonly resolveTools: (names: readonly string[]) => ChatToolSet;
  readonly toWireTools: (set: ChatToolSet) => readonly WireTool[];
  /** The one execute path — sequential, errors-as-data; never throws per-call. */
  readonly executeToolCalls: (set: ChatToolSet, calls: readonly ToolCallInput[], frame: ChatToolExecFrame) => Promise<readonly ToolCallRecord[]>;
}

/** Resolve `{api, model, credential, capability}` for a turn under the frozen `runAsUserId` (never the caller). */
type ResolveChatConnectionOp = (params: {
  readonly runAsUserId: UserId;
  readonly routable: RouteChatAssignment;
  readonly signal?: AbortSignal | undefined;
}) => Promise<ResolvedConnection>;

/** The brand-protected credential for a `{runAsUserId, source}` (the side-LLM/summarizer path). */
type ResolveCredentialOp = (params: { readonly runAsUserId: UserId; readonly source: CredentialSource }) => Promise<ResolvedCredential>;

/** The post-turn auth_failed side-effect. Best-effort; never throws into the turn path. */
type MaybeRevokeOnAuthFailedOp = (params: { readonly runAsUserId: UserId; readonly source: CredentialSource; readonly status: number }) => Promise<void>;

/** The live card for a roster member under the host's ownership. Null means gone/mid-delete — the caller
 *  treats null as skip, never an error. */
type GetCardOp = (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | null>;

/** The per-seat card-derived decoration a roster projection needs, resolved from ONE character read (the
 *  render policy, the raw theme + background overrides, and the card name/avatar) — collapses what used to
 *  be four separate reads of the same `characters` row per participant. `card` is null for a human/agent
 *  seat, no resolvable host, or a gone/mid-delete card. */
interface SeatDeco {
  /** The content-render policy (character override ?? global floor); the bare global floor for a card-less seat. */
  readonly renderPolicy: RenderPolicy;
  /** The raw, unmerged per-character theme override; null for a card-less seat. Chat never reads the themes
   *  table — the override/global/default cascade is a client concern. */
  readonly themeOverride: ThemeOverride | null;
  /** BG-C — the raw, unmerged per-character carried BACKGROUND source (the `themeOverride` twin); null for a
   *  card-less seat. The true-solo takeover + cascade are a client concern (the app-shell resolver). */
  readonly backgroundOverride: ThemeBackground | null;
  /** The card's display name + avatar; null for a human/agent seat, no host, or a gone card. */
  readonly card: { readonly name: string; readonly avatarAssetId: AssetId | null } | null;
}

/** Resolves a roster member's full card-derived decoration in ONE read. `characterId: null` (a human/agent
 *  seat) or `ownerId: null` (no resolvable host) yields the bare global floor + a null card — fail-closed. */
type ResolveSeatDecoOp = (params: { readonly ownerId: UserId | null; readonly characterId: CharacterId | null }) => Promise<SeatDeco>;

/** Resolves a human participant's display fields. */
type ResolveUserPublicsOp = (
  userId: UserId,
  personaId: PersonaId | null,
) => Promise<{
  displayName: string | null;
  handle: Handle | null;
  avatarAssetId: AssetId | null;
} | null>;

/** Resolves a parsed message-image ref to a model-fetchable URL/data-URI. Null blocks the image (owner
 *  policy or a gone asset) and the engine drops that image part. */
type ResolveImageUrlOp = (params: { readonly ownerId: UserId; readonly chatId: ChatId; readonly ref: ContentImageRef }) => Promise<string | null>;

/** Resolves an asset id to just its content hash — a hash is not a secret, so this is a bare lookup, never
 *  an existence/ownership oracle. Null for a null id or a gone row. */
type ResolveAssetHashOp = (assetId: AssetId | null) => Promise<string | null>;

/** The send-attach trust boundary: given the acting principal's userId + claimed attachment ids, returns
 *  the subset they actually own. The verb rejects a send whose claimed ids aren't all returned. */
type FilterOwnedAssetIdsOp = (userId: UserId, assetIds: readonly AssetId[]) => Promise<readonly AssetId[]>;

/** A handle to a synthetic group-character identity row, declared structurally so chat takes no cross-domain edge. */
interface GroupCharacterRef {
  readonly characterId: CharacterId;
}

/** Find-or-mint the hidden group-narrator identity for a room (idempotent, never null). */
type MintSyntheticGroupCharacterOp = (params: { readonly ownerId: UserId; readonly chatId: ChatId }) => Promise<GroupCharacterRef>;

/** The group identity for a room, or null if not yet minted. */
type FindSyntheticGroupCharacterOp = (params: { readonly ownerId: UserId; readonly chatId: ChatId }) => Promise<GroupCharacterRef | null>;

/** Persists the turn-economics delta the chat-side builders produced. */
type ApplyStatsDeltaOp = ApplyStatsDelta<unknown, Db>;

/** The memory summarizer + the smart-arbitrate side-LLM. */
export type SummarizeOp = RoleClients["summarize"];

/** The imagery quiet-extraction shaper (imagery-design/02 §2) — a STANDALONE op (not on ChatContext; built
 *  at compose from db + summarize + getCard, the `loadTurnForClassify` precedent). Chat owns the history
 *  window + the ONE MacroContext (the char macro resolved against the subject/roster card), then calls the summarize
 *  side-LLM; imagery consumes it as an injected op and never imports chat. `caller` is deliberately absent —
 *  cards resolve under the chat HOST's ownership, and imagery already gated the caller's chat membership. */
export interface ExtractQuietParams {
  readonly chatId: ChatId;
  /** The mode template with its char/user macros unresolved — chat resolves them. */
  readonly instruction: string;
  /** Focuses the char macro on one character in a group chat; absent ⇒ the roster's primary character. */
  readonly subjectCharacterId?: CharacterId | undefined;
}
export interface ExtractQuietResult {
  readonly text: string;
  readonly costUsd: number | null;
}
export type ExtractQuiet = (p: ExtractQuietParams) => Promise<ExtractQuietResult>;

/** The deps `createExtractQuiet` closes over, assembled at the composition root. */
export interface ExtractQuietDeps {
  readonly db: Db;
  readonly summarize: SummarizeOp;
  readonly getCard: GetCardOp;
}

/** The rpg-facing narrator-post op (rpg-design/02 §1.1 #2): persist ONE assistant-role narrator message
 *  through chat's canon-write path, authored by the synthetic group character (never a user id — the
 *  D19/D16-inv-9 attribution-honesty rule; minted lazily if the room has none). `content` is a plain STRING;
 *  `media` ride the body as embedded `![alt](asset:<id>)` refs (D51 — never stored blocks) with `message_assets`
 *  retaining rows. Returns the new message AND its variant id — rpg's checkpoint-restore couples a restored
 *  snapshot to the new narrator message's VARIANT (`rpg_snapshots.variantId` UNIQUE), so the minting op returns
 *  it (no second read). A STANDALONE compose-built op, NOT a `ChatService` verb: it takes no principal (rpg
 *  gates authority from its host-authority verbs before calling), the `ExtractQuiet` precedent.
 *
 *  `origin` (automation-design/03 §4 — the F1/N1 cascade belt) is OPTIONAL and ADDITIVE: absent (every rpg
 *  caller) ⇒ the canon insert omits it and the DB defaults apply (`'human'`/0), so an rpg narrator post stays
 *  byte-identical. Only the automation `generate_image` non-quiet post passes it — stamping the posted image's
 *  slot with `initiator:"automation"` + the firing rule's cascade depth (≥1), so the resulting
 *  `messageCommitted` fact resolves at depth ≥ 1 and `runGates` cascade-suppresses a non-opted re-fire (closes
 *  the F1 self-loop; the F5 mechanism on this write path). */
export type PostNarratorMessage = (
  chatId: ChatId,
  content: string,
  media?: readonly AssetId[],
  origin?: { readonly initiator: TurnInitiator; readonly automationDepth: number } | undefined,
) => Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId }>;

/** The chat-bus emit the narrator-post op needs (durable-first) — chat's own collaborator, wired at the root
 *  (the `GenerateImageDeps` shape; not on `ChatContext`). */
export interface PostNarratorMessageDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
}

/** The narrow membership read (rpg-design/02 §1.1 #3): the caller's PRESENT role in a chat, or `null` (not a
 *  present member / no such chat — one leak-free answer). rpg feeds it to `can()` for the game-auth gate; a
 *  `null` is the not-a-participant 404. A STANDALONE op with no principal — the raw membership lookup rpg gates
 *  around (membership has ONE loader; this is it exposed for injection, never a second read path). */
export type GetMembership = (chatId: ChatId, userId: UserId) => Promise<{ readonly role: ParticipantRole } | null>;

/** The pending user text a game turn is responding to (rpg-design/05 §6): the latest user-role message's
 *  selected-variant content, or `null` (no user line yet). rpg's `skill_check` re-reads it server-side to feed
 *  the player's queued d20 as `preRolledD20` — the roll is server-emitted (the model can't lie), the tool arg is
 *  advisory, this parse is authoritative. A STANDALONE principal-free op (rpg gated the turn), the `GetMembership`
 *  precedent — chat learns nothing rpg-shaped. */
export type GetPendingUserText = (chatId: ChatId) => Promise<string | null>;

/** Delivers an invite/kick/handoff to a non-member the per-chat bus can't reach. Durable-first; `coStatements`
 *  carries the producer's membership-transition statements, committed in the same batch as the notification row. */
type NotificationsEmitOp = (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void>;

/** The exact handle→userId lookup for targeted invites; unknown/disabled collapses to null. Chat never
 *  reads `users` itself. */
type ResolveHandleOp = (handle: Handle) => Promise<UserId | null>;

/** Server-derived SSE liveness for a userId (never client-asserted — a spoofable presence is a
 *  prompt-composition attack). Read once per round for cast-gating. */
export type PresenceReadOp = (userId: UserId) => Promise<PresenceView>;

/** The D50 PromptTransform seam apply op (automation-design/04 §6) — the injected registry over which
 *  automation's `transform_draft` rules and the plugin host register. `ChatContext.promptTransforms` is
 *  `null` when no registrar is wired — a byte-identical no-op (the `tools`/`expressions`/`rpg` null-op
 *  precedent). Applies every registered transform for `point` in ascending `order`, each under a 250 ms
 *  deadline; a timeout or throw SKIPS that transform (the draft passes through UNCHANGED) + emits a
 *  `prompt_transform_skipped` warning — a broken transform never eats a turn (D53). Chat learns nothing about
 *  WHO registers: it invokes the two fixed points, the registry owns the ordering + deadline discipline. */
export type ApplyPromptTransformsOp = (point: PromptTransformPoint, chatId: ChatId, draft: string, vars: Record<string, string>) => Promise<string>;

/** The D50 PromptTransform registrar surface (automation-design/04 §6) — created ONCE at the composition root
 *  (`createPromptTransformRegistry`). Its `apply` is injected as {@link ApplyPromptTransformsOp}
 *  (`ChatContext.promptTransforms`); `register`/`unregister` are wired to automation's rule lifecycle (A7) +
 *  the plugin host as `transform_draft` rules enable/disable. */
export interface PromptTransformRegistry {
  readonly apply: ApplyPromptTransformsOp;
  /** Register a transform (idempotent by `id` — a re-register replaces the prior, e.g. an automation rule edit). */
  readonly register: (transform: PromptTransform) => void;
  /** Deregister by id (an automation rule disable / a plugin teardown). A no-op for an unknown id. */
  readonly unregister: (id: string) => void;
  /** The currently registered transforms (compose/debug read). */
  readonly list: () => readonly PromptTransform[];
}

/** The injected expressions post-turn hook (expressions-design/02 §0). `ChatContext.expressions` is `null`
 *  when expressions isn't wired — a byte-identical no-op (the `tools: … | null` precedent). Fire-and-forget
 *  after a variant commits; the op swallows its own errors and NEVER blocks or fails the turn. Chat stays
 *  expressions-blind — it hands ids only (D38), the op re-reads canon. */
interface ChatExpressionsOps {
  readonly onTurnCompleted: (chatId: ChatId, messageId: MessageId, variantId: MessageVariantId) => Promise<void>;
}

/** The generic name→value macro map + reminder injection(s) + tool names a game turn's GATHER contributes
 *  (rpg-design/05 §1). STRUCTURAL — chat names NO rpg type: it merges `macros` generically into the turn's
 *  macro values (never learning a specific rpg macro name), `injections` into its single Injection[] list, and
 *  `tools` into `attachedToolNames`. The preset override rides a SEPARATE early hop (see {@link ChatRpgOps}). */
export interface ChatRpgGatherResult {
  readonly macros: Readonly<Record<string, string>>;
  readonly injections: readonly ChatInjection[];
  readonly tools: readonly string[];
}

/** The generic injection set the chat-crew's director GATHER contributes (chat-crew-design/04 §1). STRUCTURAL —
 *  chat names NO crew type: it merges `injections` into its single Injection[] list exactly as it does the rpg
 *  reminder. `null` from {@link ChatCrewOps.gatherTurnContext} ⇒ director off / no pass ⇒ byte-identical.
 *  File-local: consumed only by `ChatContext.crew` here (the compose delegate binds it structurally). */
interface ChatCrewGatherResult {
  readonly injections: readonly ChatInjection[];
}

/** The injected chat-crew turn ops (chat-crew-design/04 §1). `ChatContext.crew` is null when the crew isn't
 *  wired — a byte-identical no-op (the `tools`/`expressions`/`rpg` null-op precedent). Chat learns nothing
 *  crew-shaped: gather returns the generic {@link ChatCrewGatherResult} (the director's host-ring guidance as
 *  one injection); the audience gating + redaction of that injection is chat's own (04 §2), not crew's.
 *  File-local: `ChatContext.crew` is its only consumer; the compose delegate binds it structurally. */
interface ChatCrewOps {
  /** GATHER (after the WI pool): the director's guidance injection, or `null` for a non-director chat
   *  (byte-identical). Principal-free — the turn already gated its caller. */
  readonly gatherTurnContext: (chatId: ChatId) => Promise<ChatCrewGatherResult | null>;
}

/** The injected rpg turn ops (rpg-design/05 §0 / 10 §R4). `ChatContext.rpg` is null when rpg isn't wired — a
 *  byte-identical no-op (the `tools`/`expressions` null-op precedent). Chat learns nothing rpg-shaped: gather
 *  returns the generic {@link ChatRpgGatherResult}, and the GM-voice preset redirect rides its OWN early hop
 *  (`resolvePresetOverride`, resolved BEFORE preset resolution — the gather op runs AFTER, so it cannot carry
 *  the override; rpg-design/02 §1.1 #1). */
export interface ChatRpgOps {
  /** The GM-voice preset redirect: the game's `gmPresetId` (or `null` = not a game / no override), resolved
   *  before preset resolution so the turn assembles THAT preset instead of the host default. */
  readonly resolvePresetOverride: (chatId: ChatId) => Promise<PresetId | null>;
  /** GATHER (after the WI pool): a game turn's contribution, or `null` for a non-game chat (byte-identical).
   *  `respondsToLatestUserTurn` is chat's slot-adjacency verdict (rpg-design/05 §6): is THIS turn (re)generating
   *  the assistant slot that DIRECTLY responds to the latest user message? It drives the `playerRolledDice`
   *  reminder flag (and, paired with {@link markDicePreRollEligible}, the dice feed) so a stale die never
   *  re-feeds a later GM/auto round. Chat computes it (slot mechanics stay chat-owned); rpg consumes it blind. */
  readonly gatherTurnContext: (chatId: ChatId, pendingUserText: string | undefined, respondsToLatestUserTurn: boolean) => Promise<ChatRpgGatherResult | null>;
  /** Turn start (after the engine mints `turnId`): mark this turn eligible to feed the player's queued d20 into
   *  its FIRST skill check (rpg-design/05 §6). Called ONLY when `respondsToLatestUserTurn` — an ineligible turn
   *  (later GM/auto/director round) is never marked, so `resolveCheck` refuses to re-read the stale die. A no-op
   *  for a non-game chat. Sync (an in-memory per-turn flag); the engine has the `turnId` gather's prep phase lacks. */
  readonly markDicePreRollEligible: (turnId: ChatTurnId) => void;
  /** SEND path, after the user row commits — fires the snapshot COMMIT (+ consumes queued dice rolls). */
  readonly onUserCommit: (chatId: ChatId, messageId: MessageId) => Promise<void>;
  /** Post-turn (commit): FLUSH the turn's staged tool writes onto the committed variant, keyed by `turnId`. */
  readonly onTurnCompleted: (chatId: ChatId, messageId: MessageId, variantId: MessageVariantId, turnId: ChatTurnId) => Promise<void>;
  /** Turn abort/failure: CLEAR the turn's staged tool writes so a dead turn never flushes into the next turn. */
  readonly onTurnAborted: (chatId: ChatId, turnId: ChatTurnId, reason: TurnAbortReason) => Promise<void>;
  /** The GM seat holder's FK-derived KIND for the game rooted at this chat (agent-principal-design/05 §2 AP4a),
   *  or `null` = not a game / NULL AI-narrator seat / holder vanished. `setGroupConfig` reads it to SEAL the
   *  narrator+merged invariant (F5): a game whose GM seat is AGENT-held may not be flipped to `per-speaker`
   *  (unseat the agent GM first — else a player-character turn would carry GM tools). Chat stays rpg-table-blind
   *  — this ONE injected read mirrors rpg's `resolvePartyActorKind` shape; chat branches only on `agent`. */
  readonly resolveGmSeatHolderKind: (chatId: ChatId) => Promise<GmSeatHolderKind | null>;
}

/** The GM seat's resolved holder kind (agent-principal-design/05 §2 AP4a) — mirrors rpg's FK-derived-kind shape
 *  so chat can gate {@link ChatRpgOps.resolveGmSeatHolderKind} without reading rpg tables. Chat branches only on
 *  the `agent` arm (the F5 seal); the `enabled` field mirrors rpg's shape for a future consumer. Module-private:
 *  it names an injected op's return shape and has no external importer (compose satisfies it structurally). */
type GmSeatHolderKind = { readonly kind: "human" } | { readonly kind: "agent"; readonly enabled: boolean };

/** The injected image-generation op. Chat holds message-write authority; imagery is caller-blind (returns
 *  blocks, never posts). */
export type GeneratePictureOp = (p: {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly mode: PromptTemplateMode;
  readonly prompt?: string | undefined;
  readonly n?: number | undefined;
  /** The diffusion knobs (MA-8/D96) — forwarded to imagery; honored only by a local engine (ComfyUI). */
  readonly params?: ImageDiffusionParams | undefined;
}) => Promise<{
  readonly images: readonly { readonly assetId: AssetId }[];
  // Imagery's native warning vocabulary (e.g. `image_edit_dropped` — an edit/avatar-reference input dropped for
  // a non-edit model, imagery-design/03 §2). `generateImage` maps these onto chat's OWN `warning` bus codes
  // (chat owns its bus vocabulary — the turnAbortNotice precedent) and emits one `warning` ChatEvent per entry.
  readonly warnings: readonly { readonly code: string; readonly detail: string }[];
}>;

/** The starter's user-level active persona, validated owned/alive at the root — startChat's default-seed
 *  source when no explicit anchor is given. */
type ResolveDefaultPersonaOp = (userId: UserId) => Promise<PersonaId | null>;

/** The starter's global "Current persona" pointer, ranked above Default and below the connected-persona
 *  hop and an explicit anchor. */
type ResolveCurrentPersonaOp = (userId: UserId) => Promise<PersonaId | null>;

/** The persona to auto-anchor a new chat founded on exactly one character with exactly one connection.
 *  Ambiguity or a group founding falls through to {@link ResolveDefaultPersonaOp}. */
type ResolveConnectedPersonaOp = (userId: UserId, characterIds: readonly CharacterId[]) => Promise<PersonaId | null>;

/** Does `personaId` belong to `ownerId`? The persona-reattribution ownership belt: a line may be re-stamped
 *  only to a persona the acting user owns. */
type VerifyPersonaOwnedOp = (params: { readonly ownerId: UserId; readonly personaId: PersonaId }) => Promise<boolean>;

/** memory's digest write payload → `embeddings.store`. `contentHash` is the staleness/collapse key;
 *  `key.scopedCharacterId` is always a real CharacterId (the synthetic group-as-character bucket, or a cast
 *  member, never a sentinel/null). */
export interface StoreDigestParams {
  readonly lens: "digest";
  readonly key: BlockKey;
  readonly text: string;
  readonly contentHash: string;
  readonly topicAnchor: string;
  readonly keywords: readonly string[];
  readonly isGroup: boolean;
  readonly speakerCharacterIds: readonly CharacterId[];
}

/** memory's verbatim-segment write payload → `embeddings.store`. `(chatId, blockIdx)` is the upsert key;
 *  segments are shared per chat, not scope-keyed. */
export interface StoreSegmentParams {
  readonly lens: "segment";
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly text: string;
  readonly contentHash: string;
}

/** memory's digest/segment vector write — the one write path. */
export type EmbeddingsStoreOp = (params: StoreDigestParams | StoreSegmentParams) => Promise<void>;

/** memory's chat-scoped recall. Returns ranked block identities; memory resolves them back to digest text. */
type SearchDigestsOp = (query: MemoryQueryOptions) => Promise<readonly BlockKey[]>;

/** The cross-chat corpus/digest+segment scan; host-only scope is enforced by the caller. */
type SearchCorpusOp = (query: MemoryQueryOptions) => Promise<readonly BlockKey[]>;

/** The databank `{{databank}}`-slot GATHER op (DB6, databank-design/07 §1). OPTIONAL: absent ⇒ GATHER skips
 *  the branch entirely and the slot resolves empty, byte-identical to a non-databank deploy (the null-op pin).
 *  A `null` result = nothing retrieved (bankless scope / no hits / budget too small). chat reads ONLY `.text`
 *  (the slot value); databank's provenance/token fields never cross into chat. */
type GatherDatabankOp = (args: {
  readonly chatId: ChatId;
  readonly queryText: string;
  readonly tokenBudget: number;
}) => Promise<{ readonly text: string } | null>;

/** The chat's active preset's declared ChoiceBlock variables, resolved under the host's settings. Empty
 *  means no declared variables (or a hostless/stale room). */
type ResolvePromptVariablesOp = (chatId: ChatId) => Promise<readonly ChoiceBlockSpec[]>;

/** Parses a chat's raw metadata blob → its effective {@link GroupConfig} (default-applied). */
type GetGroupConfigOp = (rawMetadata: unknown) => GroupConfig;
/** Parses a chat's raw metadata blob → its effective {@link RoomOverrides} (default-applied). */
type GetRoomOverridesOp = (rawMetadata: unknown) => RoomOverrides;

/** The DI bundle every chat verb/subsystem closes over. `db` routes queries through `persistence/`; `now` +
 *  the id-minters are the determinism seams (no ambient Date.now()/mintTypeId() in a verb). */
export interface ChatContext {
  readonly db: Db;
  readonly now: () => number;
  /** The privilege-decision seam — every chat-authority verdict routes through this; chat never imports admin. */
  readonly can: Can;
  readonly newChatId: () => ChatId;
  readonly newMessageId: () => MessageId;
  readonly newMessageVariantId: () => MessageVariantId;
  readonly newParticipantId: () => ChatParticipantId;
  readonly newMessageAssetId: () => MessageAssetId;
  readonly newInjectionId: () => ChatInjectionId;
  readonly newEventId: () => ChatEventId;
  readonly newStreamEventId: () => ChatStreamEventId;
  readonly newInviteId: () => ChatInviteId;
  readonly newPendingTurnId: () => PendingTurnId;
  /** Mints the turn's ephemeral identity once per `executeTurn` (rpg-design/10 §R4) — threaded to the tool-exec
   *  frame + the rpg turn-end hooks so a turn-scoped registrant correlates a turn's tool writes to its flush. */
  readonly newChatTurnId: () => ChatTurnId;
  /** Hashes an invite token before persistence — never stored raw. */
  readonly hashToken: (token: string) => string;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** The chat-list recency fan — message-commit terminal path and chat-list-level ops (start/fork/rename/
   *  star/archive/delete/kick) fan `chatsChanged` after the durable write. Distinct from the per-chat `emit`,
   *  which only reaches subscribers of the open chat. */
  readonly emitChatChanged: EmitChatChanged;
  readonly applyRegexReplace: ApplyRegexReplaceOp;
  readonly runChatTurn: RunChatTurnOp;
  /** Null means tool-use isn't wired — byte-identical no-op. */
  readonly tools: ChatToolOps | null;
  readonly resolveChat: ResolveChatConnectionOp;
  readonly resolveCredential: ResolveCredentialOp;
  readonly maybeRevokeOnAuthFailed: MaybeRevokeOnAuthFailedOp;
  readonly getCard: GetCardOp;
  readonly resolveSeatDeco: ResolveSeatDecoOp;
  readonly mintSyntheticGroupCharacter: MintSyntheticGroupCharacterOp;
  readonly findSyntheticGroupCharacter: FindSyntheticGroupCharacterOp;
  readonly resolveUserPublics: ResolveUserPublicsOp;
  readonly resolveImageUrl: ResolveImageUrlOp;
  readonly resolveAssetHash: ResolveAssetHashOp;
  readonly filterOwnedAssetIds: FilterOwnedAssetIdsOp;
  /** Materialize a user-pasted external background URL into an owned CAS asset (side-eye F-P0-2) — the
   *  `setChatBackground` verb runs it for a `kind:"external"` source so a persisted carried background is
   *  always same-origin-paintable (an external URL is CSP-blocked). Compose-built from infra + assets.store. */
  readonly materializeBackground: MaterializeBackgroundOp;
  readonly applyStatsDelta: ApplyStatsDeltaOp;
  readonly summarize: SummarizeOp;
  /** The summarizer model's resolved context window (tokens) — the memory build's token-guard fits each
   *  summarizer call to the user's actual context. */
  readonly summarizerContextTokens: number;
  readonly emitNotification: NotificationsEmitOp;
  readonly resolveHandle: ResolveHandleOp;

  readonly readPresence: PresenceReadOp;
  readonly generatePicture: GeneratePictureOp;
  /** Null means expressions isn't wired — byte-identical no-op (the `tools: … | null` precedent). */
  readonly expressions: ChatExpressionsOps | null;
  /** The injected rpg turn ops (rpg-design/05 §0). Null when rpg isn't wired — byte-identical no-op. */
  readonly rpg: ChatRpgOps | null;
  /** The injected chat-crew director GATHER op (chat-crew-design/04 §1). Null when the crew isn't wired —
   *  byte-identical no-op (a non-director chat assembles identically). */
  readonly crew: ChatCrewOps | null;
  /** The D50 PromptTransform apply op (automation-design/04 §6). Null when no registrar is wired —
   *  byte-identical no-op (a chat with zero transforms assembles + streams identically). */
  readonly promptTransforms: ApplyPromptTransformsOp | null;
  readonly resolveDefaultPersona: ResolveDefaultPersonaOp;
  readonly resolveCurrentPersona: ResolveCurrentPersonaOp;
  readonly resolveConnectedPersona: ResolveConnectedPersonaOp;
  readonly verifyPersonaOwned: VerifyPersonaOwnedOp;
  readonly embeddingsStore: EmbeddingsStoreOp;
  readonly searchDigests: SearchDigestsOp;
  readonly searchCorpus: SearchCorpusOp;
  /** The databank slot GATHER op (DB6) — OPTIONAL; absent = the null-op byte-identical no-op. */
  readonly gatherDatabank?: GatherDatabankOp;
  /** The structured memory observability sink. */
  readonly log: MemoryLog;
  readonly getGroupConfig: GetGroupConfigOp;
  readonly getRoomOverrides: GetRoomOverridesOp;
  readonly resolvePromptVariables: ResolvePromptVariablesOp;
}

/** The injected per-member count budget debit. `budget === null` means unbounded (a no-op debit). */
export type DebitBudgetOp = (triggeredBy: UserId, budget: number | null) => Promise<void>;

/** The per-turn host policy resolved under the frozen `runAsUserId`: the budget cap + the max-pro-sub
 *  owner-consent flag. */
export type ResolveTurnPolicyOp = (runAsUserId: UserId) => Promise<{ readonly budget: number | null; readonly allowNonOwnerMaxProSub: boolean }>;

/** What `createChatService` receives from the entry root: collaborators not on {@link ChatContext} and not
 *  built inside the composition root. */
export interface ChatServiceDeps {
  /** The chat bus emit (durable-first). */
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  /** The in-flight lock-free turn registry (abort + concurrency). */
  readonly activeTurns: ActiveTurns;
  /** The seeded PRNG for arbitration sampling. */
  readonly prng: () => number;
  /** The inter-turn delay for the auto-mode chain. */
  readonly delay: (ms: number) => Promise<void>;
  readonly resolveConnection: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ResolvedConnection>;
  readonly resolveForeignInputs: ResolveForeignInputsOp;
  readonly debitBudget: DebitBudgetOp;
  readonly resolveTurnPolicy: ResolveTurnPolicyOp;
  /** The lock holder tag (this replica/turn id) for stale-takeover + holder-scoped release. */
  readonly holder: string;
  /** The per-chat lock TTL (ms), sized for one turn. */
  readonly lockTtlMs: number;
}
