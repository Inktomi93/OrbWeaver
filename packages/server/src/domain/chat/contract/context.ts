// The explicit ChatContext DI bundle + every injected cross-feature op type. Homed under contract/ because
// the exported-type gate forbids it in the conventional context.ts slot; the top-level context.ts re-exports
// this. Every cross-feature/infra dependency is an injected op — chat never sideways-imports a sibling domain.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent, GroupConfig, RenderPolicy, RoomOverrides, ToolCallRecord } from "@orb/contracts/chat";
import type { CredentialSource, ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { AgentSourceKind, Can, ChatRoster, Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { NotificationEvent, PresenceView } from "@orb/contracts/notifications";
import type { ChoiceBlockSpec } from "@orb/contracts/preset";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { BlockKey, MemoryQueryOptions } from "@orb/contracts/search";
import type { ApplyStatsDelta } from "@orb/contracts/stats";
import type { ThemeOverride } from "@orb/contracts/theme";
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
  Handle,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  PendingTurnId,
  PersonaId,
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

/** Resolves a roster member's content-render policy (override ?? global). `characterId: null` (a human
 *  seat) resolves to the global floor alone. */
type ResolveRenderPolicyOp = (params: {
  /** Null (no resolvable host) falls back to the global floor — fail-closed. */
  readonly ownerId: UserId | null;
  readonly characterId: CharacterId | null;
}) => Promise<RenderPolicy>;

/** Resolves a roster member's raw per-character theme override, unmerged — chat never reads the themes
 *  table itself; the override/global/default cascade is a client concern. */
type ResolveThemeOverrideOp = (params: { readonly ownerId: UserId | null; readonly characterId: CharacterId | null }) => Promise<ThemeOverride | null>;

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

/** Delivers an invite/kick/handoff to a non-member the per-chat bus can't reach. Durable-first; `coStatements`
 *  carries the producer's membership-transition statements, committed in the same batch as the notification row. */
type NotificationsEmitOp = (event: NotificationEvent, coStatements?: readonly unknown[]) => Promise<void>;

/** The exact handle→userId lookup for targeted invites; unknown/disabled collapses to null. Chat never
 *  reads `users` itself. */
type ResolveHandleOp = (handle: Handle) => Promise<UserId | null>;

/** Lazily finds-or-mints the owner's agent principal. Chat never touches `users` directly. */
type ProvisionAgentPrincipalOp = (params: {
  readonly ownerUserId: UserId;
  readonly sourceKind: AgentSourceKind;
}) => Promise<{ readonly agentUserId: UserId; readonly created: boolean }>;

/** Is this agent principal's kill switch on? A disabled agent is refused a seat and dropped from every cast. */
type ResolveAgentEnabledOp = (agentUserId: UserId) => Promise<boolean>;

/** Server-derived SSE liveness for a userId (never client-asserted — a spoofable presence is a
 *  prompt-composition attack). Read once per round for cast-gating. */
export type PresenceReadOp = (userId: UserId) => Promise<PresenceView>;

/** The injected image-generation op. Chat holds message-write authority; imagery is caller-blind (returns
 *  blocks, never posts). */
export type GeneratePictureOp = (p: {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly mode: PromptTemplateMode;
  readonly prompt?: string | undefined;
  readonly n?: number | undefined;
}) => Promise<{
  readonly images: readonly { readonly assetId: AssetId }[];
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
  readonly resolveRenderPolicy: ResolveRenderPolicyOp;
  readonly resolveThemeOverride: ResolveThemeOverrideOp;
  readonly mintSyntheticGroupCharacter: MintSyntheticGroupCharacterOp;
  readonly findSyntheticGroupCharacter: FindSyntheticGroupCharacterOp;
  readonly resolveUserPublics: ResolveUserPublicsOp;
  readonly resolveImageUrl: ResolveImageUrlOp;
  readonly resolveAssetHash: ResolveAssetHashOp;
  readonly filterOwnedAssetIds: FilterOwnedAssetIdsOp;
  readonly applyStatsDelta: ApplyStatsDeltaOp;
  readonly summarize: SummarizeOp;
  /** The summarizer model's resolved context window (tokens) — the memory build's token-guard fits each
   *  summarizer call to the user's actual context. */
  readonly summarizerContextTokens: number;
  readonly emitNotification: NotificationsEmitOp;
  readonly resolveHandle: ResolveHandleOp;
  readonly provisionAgentPrincipal: ProvisionAgentPrincipalOp;
  readonly resolveAgentEnabled: ResolveAgentEnabledOp;
  readonly readPresence: PresenceReadOp;
  readonly generatePicture: GeneratePictureOp;
  readonly resolveDefaultPersona: ResolveDefaultPersonaOp;
  readonly resolveCurrentPersona: ResolveCurrentPersonaOp;
  readonly resolveConnectedPersona: ResolveConnectedPersonaOp;
  readonly verifyPersonaOwned: VerifyPersonaOwnedOp;
  readonly embeddingsStore: EmbeddingsStoreOp;
  readonly searchDigests: SearchDigestsOp;
  readonly searchCorpus: SearchCorpusOp;
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
