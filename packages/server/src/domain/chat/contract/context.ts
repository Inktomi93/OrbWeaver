// The explicit ChatContext DI bundle + every injected cross-feature op type. Homed under contract/ because
// the exported-type gate forbids it in the conventional context.ts slot; the top-level context.ts re-exports
// this. Every cross-feature/infra dependency is an injected op — chat never sideways-imports a sibling domain.

import type { CharacterCard } from "@orb/contracts/character";
import type {
  ChatBusEvent,
  ChatInjection,
  GroupConfig,
  HistoryFloorSeq,
  PromptTransform,
  PromptTransformPoint,
  RenderPolicy,
  RoomOverrides,
  ToolCallRecord,
  TurnAbortReason,
  TurnInitiator,
} from "@orb/contracts/chat";
import type { ChatSendAvailability, CredentialSource, ResolvedConnection, RouteChatAssignment } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Can, ChatRoster, ParticipantRole, Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { NotificationEvent, PresenceView } from "@orb/contracts/notifications";
import type { ChoiceBlockSpec, UserIntent, UserMacroSpec } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { ChatRpgPointer, RpgActorRef, RpgStatProfile } from "@orb/contracts/rpg";
import type { BlockKey, MemoryQueryOptions } from "@orb/contracts/search";
import type { MemorySummarizerConfig } from "@orb/contracts/settings";
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
import type { MessageRole } from "@orb/kit/message-role";
import type { RegexReplacer } from "@orb/kit/regex";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import type { AuditEntry } from "#foundation/observability";
import type { RoleClientsWithSignal, ToolCallInput, WireTool } from "#infra/providers";
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
  /** The SECOND projection (D48) for the STATEFUL agent-sdk wire: wrap the resolved set as an in-process
   *  MCP tool server (the opaque `AgentToolServer`, typed `unknown` here — chat never narrows it). The SDK
   *  owns the tool loop; every invocation still runs the ONE `executeToolCalls` path, and `onRecord` fires
   *  per completed invocation so the pipeline persists the SAME `ToolCallRecord`s the array-wire recurse
   *  loop produces. */
  readonly toAgentToolServer: (set: ChatToolSet, frame: ChatToolExecFrame, onRecord: (record: ToolCallRecord) => void) => Promise<unknown>;
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

/** A character's ACCEPTED canonical tag NAMES under the host's ownership — the `sheet`-tier slice of the D22
 *  member card (`clampMemberCard` clamps it). Names only (the member card shows chips, not the full `TagView`),
 *  resolved through the character domain so chat stays character-table-blind (the {@link GetCardOp} precedent).
 *  Empty ⇒ no accepted tags / a gone card. */
type ResolveCharacterTagsOp = (params: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<string[]>;

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

/** The memory summarizer + the smart-arbitrate side-LLM. The SIGNAL-BEARING variant of the isomorphic
 *  `RoleClients["summarize"]` (`RoleClientsWithSignal`): chat is the one caller that already owns a
 *  cancellation — the turn's active-turn `AbortSignal` — and a side-LLM call that cannot be cancelled hangs
 *  the whole turn when the box accepts the socket and never answers. */
export type SummarizeOp = RoleClientsWithSignal["summarize"];

/** The side-gen sampling ladder's middle rung for a chat-scoped side-gen call — the chat host's default-preset
 *  generation params. Resolved at the entry root (chat never reads the preset domain); a hostless/stale room
 *  degrades to the system-default params. Consumed by extract-quiet (compaction/quiet-generate/arbiter read
 *  their own analogous injected resolver). */
type ResolveChatPresetParamsOp = (chatId: ChatId) => Promise<SideGenSampling>;

/** The chat's app-tier PROSE overrides (PROSE-1 §4.3) — the ROOM HOST's `UserSettings.prose`, resolved at the
 *  entry root through the SAME `resolveChatHostUserId` seam `resolveChatPresetParams` uses. The host, not the
 *  triggering member, is the ruled principal (owner-decision 8, option (a)): these are ROOM-level side
 *  generations, so a chat's digests / director / summary marker must not change voice depending on who spoke.
 *  A hostless/stale room resolves `{}` ⇒ every slot falls to its shipped default, byte-identical. */
type ResolveChatProseOp = (chatId: ChatId) => Promise<ProseOverrides>;

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
  /** The CALLER's D16 canon floor — REQUIRED, not optional. The extraction's product is a model DISTILLATION
   *  of the recent transcript handed straight back to ONE human (`imagery.extractPrompt` returns the prompt
   *  string on the wire), so it is viewer-plane, not room-plane: unlike a turn reply it is not one shared
   *  utterance and CAN be clamped per reader without forking canon. Membership alone admitted this call, and
   *  membership is not visibility — so the caller must obtain this from chat's `resolveViewerVisibility` op.
   *  `NO_HISTORY_FLOOR` (0) is the unclamped common case. */
  readonly historyFloorSeq: HistoryFloorSeq;
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
  /** The chat host's default-preset params (the side-gen sampling ladder's middle rung — extract-quiet is
   *  chat-scoped). Wired at compose; a hostless/stale room degrades to the floor. */
  readonly resolveChatPresetParams: ResolveChatPresetParamsOp;
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
  readonly connection: ResolvedConnection;
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
  /** The chat host's default-preset params (the side-gen sampling ladder's middle rung — a quiet generation is
   *  chat-scoped). Folded UNDER the caller's `intent` (compaction's per-pass override wins) and OVER the
   *  `quiet_generate` floor; a hostless/stale room degrades to the floor. */
  readonly resolveChatPresetParams: ResolveChatPresetParamsOp;
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
 *  the F1 self-loop; the F5 mechanism on this write path).
 *
 *  STATE-ANCHOR slots (rpg between-turns hand-edit / resync clone-forward) are posted with EMPTY `content` —
 *  they exist only to key a snapshot (`rpg_snapshots.variantId` UNIQUE needs a real committed variant). No
 *  flag is needed: an empty-content assistant row is ALREADY dropped from the assembled prompt by the SHAPE
 *  stage's empty-row filter (`assembly/shape.ts` `runSquash`/`squashSameRole`), and the client message list
 *  hides an empty-content committed slot — so a hand edit never renders a blank bubble nor pollutes the prompt.
 *  Critically, the slot stays prompt-VISIBILITY-normal (`excludedFromPrompt` false) so the rpg snapshot-
 *  resolution ladder still finds its snapshot as a state head (the ladder keys on `excludedFromPrompt=false`). */
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

/** The opaque rpg-pointer WRITE op (rpg-design/05 §3.1): merge the healed `metadata.rpg` `{gameId}` sub-blob so
 *  the client's takeover gate is a sync read off `ChatDetail`. Called ONCE by rpg's `createGame`; chat never
 *  dereferences it (the truth is `rpg_games` — this is a SYNC SIGNAL). STANDALONE + principal-free (createGame
 *  gated host authority; the `GetMembership`/`PostNarratorMessage` injected-op precedent). The pointer schema is
 *  rpg's (`ChatRpgPointer`) — the foreign-schema precedent (chat stores it blind). A `null` pointer DELETES the
 *  `metadata.rpg` sub-blob (the dangling-pointer heal, fork-clones-the-game §3.3 — `detachDanglingPointer`
 *  nulls a pointer at a game that no longer exists). */
export type SetRpgPointer = (chatId: ChatId, pointer: ChatRpgPointer | null) => Promise<void>;

/** One present roster participant projected for rpg's tracker view (roster ∪ sheets, rpg-design/05 §4.3): a
 *  `character`/`user` actor ref + the RESOLVED display name + avatar hash. rpg stays table-blind — the
 *  name/avatar joins live HERE (chat/character). Structurally the rpg-facing `RpgRosterActor` (rpg declares its
 *  own copy — the foreign-op-shape precedent; the `avatar` is the renderable CAS hash, absent when none). */
export interface RpgRosterActor {
  readonly actorRef: RpgActorRef;
  readonly name: string;
  readonly avatar?: string;
}

/** The roster-resolution op (rpg-design/05 §4.3): resolve a chat's PRESENT participants into rpg actor refs +
 *  display name + avatar. STANDALONE + principal-free (rpg gated the read; the `GetMembership`/`SetRpgPointer`
 *  injected-op precedent). Wired into `RpgContext.resolveRoster` at the composition root (W1c-b). */
export type ResolveRpgRoster = (chatId: ChatId) => Promise<readonly RpgRosterActor[]>;

/** The DEEP canon-window read op (crunchy-cluster §1.3 — the `resyncFromStory` host escape hatch's story feed).
 *  STANDALONE + principal-free (the `ResolveRpgRoster` precedent — the rpg resync verb gated its host caller
 *  before invoking; this op only reads canon). Resolves the chat's selected-lineage canon into the SAME
 *  name-stamped, token-measured {@link RpgTurnTranscriptMessage} projection the engine threads at
 *  `fireRpgTurnCompleted` (one shared substrate builder — the state round and the resync can't drift), sliced to
 *  the last `maxTokens` (newest-first fill, oldest→newest order). Room-plane per D106; hidden-class spans stay
 *  INTACT (model-plane, D110 §3.6 — the member never sees this read). Wired into `RpgContext.resolveCanonWindow`
 *  at the composition root. */
export type ResolveCanonWindow = (chatId: ChatId, opts: { readonly maxTokens: number }) => Promise<readonly RpgTurnTranscriptMessage[]>;

/** The BORN-STATE corpus one character's populate round reads (the host `populateFromCharacter` verb, owner
 *  ruling 2026-08-01): the card's authored prose + the room's OPENING line. This is deliberately NOT the story
 *  window — a populate round establishes what the character walked IN with, so reading play would let a beat
 *  that already happened bleed into the born state (that is `resyncFromStory`'s job, and it is a different
 *  verb). Card reads resolve under the room HOST's ownership (the `ResolveRpgRoster` seat precedent, D18/D19). */
export interface RpgCardCorpus {
  /** The card's display name — the `targetRef` the round's inventory writes must name. */
  readonly name: string;
  /** The card's authored prose (description · personality · scenario), labeled + joined. Empty sections are
   *  omitted, so a thin card yields a short corpus rather than a scaffold of empty headings. */
  readonly card: string;
  /** The room's OPENING line (the first canon slot's selected body — the greeting as actually posted, edits
   *  included). `""` when the room has no message yet (a game opened before its first beat). */
  readonly opening: string;
}

/** Resolve one roster character's {@link RpgCardCorpus}. STANDALONE + principal-free (the rpg verb gated its
 *  HOST caller before invoking — the `ResolveCanonWindow` precedent). `null` = no such card under the room
 *  host / a hostless room: the caller refuses the round rather than running it on nothing. Wired into
 *  `RpgContext.resolveCardCorpus` at the composition root. */
export type ResolveRpgCardCorpus = (chatId: ChatId, characterId: CharacterId) => Promise<RpgCardCorpus | null>;

/** ONE human's read-visibility over ONE chat — membership AND the D16 canon floor as a SINGLE value, because
 *  they are one inseparable answer. `historyFloorSeq` is the INCLUSIVE `messages.seq` floor this viewer may
 *  read from (`NO_HISTORY_FLOOR` = 0 = unclamped); it is DERIVED by the one resolver
 *  (`substrate/auth/clamp::resolveHistoryFloorSeq`), never re-computed by the consumer. There is deliberately
 *  no "member: yes" projection without the floor — a consumer that only wants membership still receives the
 *  floor, so "forgot to clamp" is unrepresentable rather than merely discouraged. */
export interface ViewerVisibility {
  readonly role: ParticipantRole;
  readonly historyFloorSeq: HistoryFloorSeq;
  /** The parity-plus §3.6 / D106 hidden-content verdict for THIS viewer: `true` ⇒ they read hidden-class spans
   *  (`<lie>`/`<ofilter>`) verbatim — the host reveal plane; `false` ⇒ a member, whose canon must be
   *  hidden-stripped before any cross-domain consumer serves the body. DERIVED here from `role` via chat's ONE
   *  `viewerReadsHidden` home so a cross-domain consumer (the plugin realm) never re-derives `role === "host"`. */
  readonly readsHidden: boolean;
}

/** THE cross-domain viewer-visibility op (the D-ledger read-visibility entry). Any NON-chat domain that must
 *  decide "may this human see this chat's CONTENT" consumes this — never a membership read of its own, and
 *  never a second clamp home (a mirrored floor computation in another domain is the defect class the plugin
 *  fan-out already demonstrated).
 *
 *  `null` = NOT a present member (or no such chat — one leak-free answer, the `GetMembership` posture). `null`
 *  is the sentinel precisely BECAUSE the alternative (`{ member: false, historyFloorSeq: 0 }`) reads as
 *  "no floor in force" to a caller that forgets to test membership first: a floor of 0 means UNCLAMPED, so a
 *  non-member would inherit the widest possible visibility on the exact code path where the check was
 *  skipped. `null` fails CLOSED under `?.` / `if (v === null)` and cannot be misread as a permissive floor.
 *
 *  STANDALONE + principal-free (the `GetMembership`/`ExtractQuiet` precedent — the consumer's own authority
 *  gate runs around it) and compose-wired: `userId` is the VIEWER whose visibility is being resolved and MUST
 *  be a server-resolved identity, never a caller-supplied one (the injected-op caller-gate rule — an op whose
 *  params drop the caller is a latent cross-tenant hole). */
export type ResolveViewerVisibility = (chatId: ChatId, userId: UserId) => Promise<ViewerVisibility | null>;

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
  // The `{{expr::…}}` CEL activation a game turn contributes (parity-plus §12) — a data-only `rpg` binding whose
  // value is the tracker view shaped as a CelValue tree (scalars/lists/maps, NO functions). STRUCTURAL — chat
  // threads it onto the AssembleContext's `celBindings` verbatim, never learning the `rpg` shape. Absent ⇒
  // `{{expr::rpg.…}}` errors-to-"" (non-game).
  readonly celBindings?: Readonly<Record<string, unknown>> | undefined;
  /** The M2 keep-last-X card wire knob (parity-plus §3.5) — a plain number chat threads to
   *  `runTurnPipeline.cardKeepLastX` (0 = every history card collapses to its stub). STRUCTURAL: chat
   *  learns a wire-projection scalar, never an rpg type. */
  readonly cardKeepLastX: number;
  /** TERMINAL tools the contributor mounts on THIS turn (the R1 folded-extraction seam). STRUCTURAL — these
   *  are plain {@link WireTool}s; chat never learns what they mean. They differ from `tools` (registry names)
   *  in exactly one way, and it is the whole point: chat attaches them with `tool_choice:"auto"`, NEVER
   *  RESOLVES, EXECUTES, OR RECURSES on them, and never persists their calls as `ToolCallRecord`s — the
   *  co-emitted `tool_calls` are handed straight back to the contributor on
   *  {@link RpgTurnContext.terminalToolCalls}. So the model answers in prose AND emits structured state in ONE
   *  completion, and the tool traffic stays server-internal exactly as the separate round's did.
   *  Absent/empty ⇒ byte-identical to a tool-less turn (every non-folded turn). */
  readonly terminalTools?: readonly WireTool[] | undefined;
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
/** One name-stamped canon row the state round reads as story evidence (crunchy-cluster redesign §1.3). The
 *  ENGINE projects it from the canon it already loaded; rpg receives STORY TEXT AS DATA and reads no chat
 *  table (§2 one-directional flow). `tokens` (an `estimateTokens` of the content) lets the consumer
 *  budget-slice its window cheaply. Hidden-class spans are INTACT — the round is model-plane, the model always
 *  reads its own lies (D110 §3.6). */
export interface RpgTurnTranscriptMessage {
  /** The canon row's role (derived from `MESSAGE_ROLES` — never a re-spelled inline union, §7.5). */
  readonly role: MessageRole;
  /** Resolved via the engine's `historyMacroNames` ("Mara", "You (Aldric)"); `null` for a system row. */
  readonly speakerName: string | null;
  /** The stored body (post-freeze canon, macro-raw identity ok — the state round reads the raw story). */
  readonly content: string;
  readonly tokens: number;
}

/** The character turn's RESOLVED route + consent verdict + its OWN canon transcript, handed to
 *  {@link ChatRpgOps.onTurnCompleted} so the post-commit rpg state round rides the EXACT connection +
 *  owner-consent the engine already resolved + enforced for THIS turn AND reasons from the story it just
 *  told — the [foreign-inputs-seam] shape (already-resolved values threaded IN, never re-derived).
 *  The connection/consent are the F1 fix: without them the state round resolved the host's GLOBAL chat default
 *  (`resolveRole`) and force-stamped `ownerConsented:true`, so a room pinned to vllm could fire a metered-sub
 *  round the turn's consent belt never approved. `connection.capability` also gates the round's readonly
 *  verdict (F2). The `transcript` is the §1.3 fix: the extraction was CONTEXT-BLIND (state JSON + one beat), so
 *  deep in a story it forgot fields and never reconciled inventory/quests against what happened — now it rides
 *  the turn's own loaded canon (zero extra model reads, §1.4). */
export interface RpgTurnContext {
  /** The character turn's effective `{api, model, credential, capability}` — the agent-speaker's own or the
   *  round connection; the state round runs on THIS, never a re-resolve. */
  readonly connection: ResolvedConnection;
  /** The engine's enforced owner-consent verdict for this turn (`resolveOwnerConsented`, engine.ts) — the state
   *  round inherits it rather than force-stamping `true`; a metered-sub round is by-proxy-safe by construction. */
  readonly ownerConsented: boolean;
  /** The selected-lineage canon UP TO AND INCLUDING the committed reply, oldest→newest, name-stamped — the FULL
   *  loaded canon; the CONSUMER slices to its window (the knob is rpg config, not chat's business). Projected by
   *  the ENGINE (`fireRpgTurnCompleted`) from `canonAll ∪ {the committed reply}`. */
  readonly transcript: readonly RpgTurnTranscriptMessage[];
  /** The TERMINAL tool calls this turn's completion co-emitted alongside its prose (the R1 fold), or `null`
   *  when terminal tools did NOT ride this turn — because the contributor mounted none, or because the
   *  connection could not carry them at all (a tools-incapable model; a wire whose backend could not build the
   *  declaration). Note the DELIVERY is per-wire and is not an eligibility question: the array wires carry them
   *  in `tools[]`, the stateful agent-sdk wire mounts them as a deny-on-use MCP server (D112 R1). The
   *  distinction is load-bearing and must stay TOTAL: `null` means "the fold did not happen — run your own
   *  post-commit round", while an EMPTY ARRAY means "the fold ran and the model chose to record nothing"
   *  (a legitimate quiet beat, never an error). These calls were never executed, never recursed on, and are
   *  NOT on the committed variant's `toolCalls` — they exist only here. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
}

export interface ChatRpgOps {
  /** The #40 DRAFT-TIME game birth: `startChat` carried a `startAsGame` intent, so rpg mints the lite game
   *  for the just-created chat RIGHT AFTER the creation batch commits and BEFORE the opening turn runs —
   *  turn 1 is already in-game (the gather sees the row). The startChat CALLER is the just-minted host, so
   *  no second authority resolve rides this op (the chat verb is the gate); idempotent (an existing game is
   *  a no-op). `profile` is rpg's own contract shape (the `ChatRpgPointer` foreign-schema precedent — chat
   *  threads it BLIND from the wire to this op, never reading inside it). */
  readonly startGame: (chatId: ChatId, params: { readonly profile?: RpgStatProfile | undefined }) => Promise<void>;
  /** The GM-voice preset redirect: the game's `gmPresetId` (or `null` = not a game / no override), resolved
   *  before preset resolution so the turn assembles THAT preset instead of the host default. */
  readonly resolvePresetOverride: (chatId: ChatId) => Promise<PresetId | null>;
  /** The GAME's authored user macros (`rpg_games.config.userMacros`) — the game half of the two-home
   *  definition rule (owner ruling #20; the preset half is {@link ResolvePromptUserMacrosOp}). Empty for a
   *  non-game / DISENGAGED chat (#40 ⇒ byte-identical to a non-game turn). Chat learns no rpg type: the
   *  return is contracts' own `UserMacroSpec`, the SAME shape the preset half returns, and chat merges the
   *  two under the ruled collision policy (`shadowPresetUserMacros` — the game shadows the preset).
   *
   *  Its own op rather than a {@link ChatRpgGatherResult} field because the DECLARATIONS have two consumers
   *  with different shapes of work: the turn build (which runs the gather anyway) and the picks-pane read
   *  `getUserMacroPicks` (a cheap member read that must NOT drive a whole turn gather). One op, both
   *  callers — the alternative was two homes for one fact. */
  readonly resolveUserMacros: (chatId: ChatId) => Promise<readonly UserMacroSpec[]>;
  /** GATHER (after the WI pool): a game turn's contribution, or `null` for a non-game chat (byte-identical).
   *  Args shape: {@link GatherTurnContextArgs}.
   *  `respondsToLatestUserTurn` is chat's slot-adjacency verdict (rpg-design/05 §6): is THIS turn (re)generating
   *  the assistant slot that DIRECTLY responds to the latest user message? It drives the `playerRolledDice`
   *  reminder flag (and, paired with {@link markDicePreRollEligible}, the dice feed) so a stale die never
   *  re-feeds a later GM/auto round. Chat computes it (slot mechanics stay chat-owned); rpg consumes it blind.
   *  `steerIdentity` is chat's authoritative identity binding for the host-authored `steeringNote`, both values
   *  resolved CHAT-SIDE (chat owns `{{user}}`/`{{char}}` resolution): `user` = the triggering human's ACTIVE
   *  persona display name (`undefined` ⇒ no active persona → the "User" floor); `char` = the Ruling-B
   *  host/null-speaker `{{char}}` (Chat-Macro-Resolution.md ruling B — the JOINED CAST in a multi-character
   *  room / the single character in solo). Threaded so rpg can render the steeringNote's identity macros
   *  (guided-safe subset only, mirroring the nudge/guided path) instead of shipping literal braces — rpg SPLICES
   *  chat's values, never re-deriving identity. Absent ⇒ the steeringNote ships verbatim (byte-identical).
   *  `regenSlotMessageId` is the assistant slot this turn is REGENERATING — a swipe/reroll's `targetMessageId`
   *  (the `append-variant` persist mode), whose canon context also stops BEFORE the slot. rpg reads its state
   *  as of before that slot, so a reroll is never told the abandoned variant's beats (VER-1b; without it the
   *  reminder describes the very prose the model is being asked to rewrite). Absent for a fresh turn AND for
   *  `continue` — a continuation's context INCLUDES the slot, so its state genuinely is the head. */
  readonly gatherTurnContext: (args: GatherTurnContextArgs) => Promise<ChatRpgGatherResult | null>;
  /** Turn start (after the engine mints `turnId`): mark this turn eligible to feed the player's queued d20 into
   *  its FIRST skill check (rpg-design/05 §6). Called ONLY when `respondsToLatestUserTurn` — an ineligible turn
   *  (later GM/auto/director round) is never marked, so `resolveCheck` refuses to re-read the stale die. A no-op
   *  for a non-game chat. Sync (an in-memory per-turn flag); the engine has the `turnId` gather's prep phase lacks. */
  readonly markDicePreRollEligible: (turnId: ChatTurnId) => void;
  /** SEND path, after the user row commits — fires the snapshot COMMIT (+ consumes queued dice rolls). */
  readonly onUserCommit: (chatId: ChatId, messageId: MessageId) => Promise<void>;
  /** Post-turn (commit): FLUSH the turn's staged tool writes onto the committed variant, keyed by `turnId`.
   *  `turn` carries the NARRATION turn's ALREADY-RESOLVED route + consent verdict + its OWN canon transcript
   *  (see {@link RpgTurnContext}) so the rpg state round rides the EXACT connection + consent the engine
   *  enforced — never a second hand-rolled resolve/consent path (stickler F1: a state round must not resolve the
   *  host's global default nor force-stamp consent; a room on vllm runs its round on vllm, a metered-sub round
   *  inherits the turn's owner-consent) — AND reasons from the story it just told (§1.3 transcript threading). */
  readonly onTurnCompleted: (chatId: ChatId, messageId: MessageId, variantId: MessageVariantId, turnId: ChatTurnId, turn: RpgTurnContext) => Promise<void>;
  /** Turn abort/failure: CLEAR the turn's staged tool writes so a dead turn never flushes into the next turn. */
  readonly onTurnAborted: (chatId: ChatId, turnId: ChatTurnId, reason: TurnAbortReason) => Promise<void>;
  /** The GM seat holder's FK-derived KIND for the game rooted at this chat (agent-principal-design/05 §2 AP4a),
   *  or `null` = not a game / NULL AI-narrator seat / holder vanished. `setGroupConfig` reads it to SEAL the
   *  narrator+merged invariant (F5): a game whose GM seat is AGENT-held may not be flipped to `per-speaker`
   *  (unseat the agent GM first — else a player-character turn would carry GM tools). Chat stays rpg-table-blind
   *  — this ONE injected read mirrors rpg's `resolvePartyActorKind` shape; chat branches only on `agent`. */
  readonly resolveGmSeatHolderKind: (chatId: ChatId) => Promise<GmSeatHolderKind | null>;
  /** Is the game rooted at this chat DECEPTION-ACTIVE (parity-plus §3.6 — deception OR omniscience config on)?
   *  `false` for a non-game chat / a game with neither hidden channel on. This is the SERVER-side
   *  gate for the member REASONING-STRIP: when true AND the viewer is not the room host, the whole reasoning/
   *  thinking channel is withheld from that member (a deceptive model can spill a lie's truth in its reasoning —
   *  the whole-channel host-only cut is the clean threat boundary, §3.6). Chat stays rpg-table-blind — this ONE
   *  injected read mirrors `resolveGmSeatHolderKind`'s FK-derived shape; chat branches only on the boolean. The
   *  BODY hidden-span strip is unconditional (a lie is always stripped for members); THIS gate is the ADDITIONAL,
   *  game-conditional reasoning cut P3 adds beside it. */
  readonly resolveReasoningHostOnly: (chatId: ChatId) => Promise<boolean>;
  /** FORK CLONES THE GAME (fork-clones-the-game §3.2). Called by `forkChat` AFTER its atomic fork batch commits:
   *  rpg re-keys its whole 6-table vertical from the source game onto the fork through the fork's id maps and
   *  writes the fork's `metadata.rpg` pointer LAST (crash safety — a mid-clone failure leaves the fork a valid
   *  PLAIN chat, the `8306a2b9`/`forkMetadataWithoutGame` stopgap as the structural fallback). The maps ENCODE
   *  the fork horizon: a snapshot/journal row whose variant was not copied (truncated past the fork's `throughSeq`,
   *  or withheld below the forker's D106 join-floor) has no `variantIdMap` entry and is dropped by construction —
   *  no separate horizon param. `forker` drives the host-secret strip: a NON-`readsHidden` forker becomes HOST of
   *  the copy, so anything host-only in the source (config `steeringNote`, a foreign `gmPresetId`, hidden-span
   *  tracker prose) must not launder into their new host view (the §3.6 member→host boundary — the SAME transition
   *  `resolveReasoningHostOnly`/`copyVariantStmt` already strip the reasoning + body channels across). `null` when
   *  rpg isn't wired / the source isn't a game ⇒ `{cloned:false}` and the fork stays plain. */
  readonly forkGame: (args: ForkGameArgs) => Promise<ForkGameResult>;
}

/** {@link ChatRpgOps.gatherTurnContext}'s call args. Chat OWNS this shape (rpg satisfies it, the same
 *  front-door type-import precedent as {@link ForkGameArgs}). `pendingUserText`/`respondsToLatestUserTurn`
 *  are full's dice-feed inputs — lite's gather ignores both (ratified: lite has no d20 checks); required
 *  here anyway because every caller (turn build, preview) already resolves them for chat's own use, and an
 *  optional pair a mode silently ignores is exactly the shape the honest-degrade doctrine (§4.6) warns against
 *  for a KNOWN, not a hypothetical, ignorer — the doc on `gatherTurnContext` above names lite as the ignorer
 *  and why. `steerIdentity`/`regenSlotMessageId` stay optional (a caller-side absence, not a callee-side
 *  ignore): the preview path never regenerates a slot, and identity binding is threaded only when resolved. */
export interface GatherTurnContextArgs {
  readonly chatId: ChatId;
  /** Full's dice-feed input — lite's gather ignores it (rpg-design/05 §6; see `gatherTurnContext`'s doc). */
  readonly pendingUserText: string | undefined;
  /** Full's dice-feed input — lite's gather ignores it (rpg-design/05 §6; see `gatherTurnContext`'s doc). */
  readonly respondsToLatestUserTurn: boolean;
  readonly steerIdentity?: { readonly user: string | undefined; readonly char: string } | undefined;
  readonly regenSlotMessageId?: MessageId | undefined;
}

/** The `forkChat`→rpg clone call args (§3.2). Chat OWNS this shape (rpg satisfies it, the one-directional-flow
 *  front-door type-import rule already governing `ChatRpgOps`). Carries the fork's id remaps (snapshots/journal
 *  re-key THROUGH them — an entry off the map is dropped) + the forker's source-room posture (drives the
 *  host-secret strip). No `throughSeq`: the maps already exclude every row past the fork horizon (the maps are
 *  built from the floor-clamped, throughSeq-truncated slot/variant set `buildCanonCopy` copies). */
export interface ForkGameArgs {
  readonly sourceChatId: ChatId;
  readonly newChatId: ChatId;
  /** The fork's slot remap (source `messages.id` → fork id). journal `sourceMessageId` re-keys through it. */
  readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
  /** The fork's variant remap (source `messageVariants.id` → fork id). snapshots (UNIQUE variantId) and model
   *  journal entries re-key THROUGH it; a variant with no entry (past the horizon) drops its rpg rows. */
  readonly variantIdMap: ReadonlyMap<MessageVariantId, MessageVariantId>;
  /** The forker's SOURCE-room posture. `readsHidden` = the source-room host verdict (`viewerReadsHidden`): a
   *  non-host forker never had host-plane access to the source's secrets, so the clone strips them (the
   *  member→host laundering rule, §3.6). `userId` is the ownership axis for the `gmPresetId` carry gate. */
  readonly forker: { readonly userId: UserId; readonly readsHidden: boolean };
}

/** The clone outcome. `cloned:false` = a non-game source (or rpg unwired) ⇒ the fork ships plain, no pointer
 *  (the stopgap's `forkMetadataWithoutGame` already dropped the copied pointer, so this is the correct steady
 *  state). `cloned:true` = the game rows exist and the fork's pointer is live. */
export interface ForkGameResult {
  readonly cloned: boolean;
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

/** The chat's active preset's authored USER MACROS (#24), resolved under the host's settings — the
 *  DECLARATION half of the picks pane (`getUserMacroPicks`); the picks themselves live on the chat row.
 *  The `resolvePromptVariables` sibling, and the same resolution the turn build reads
 *  (`foreign.promptConfig.userMacros`) minus a feature preset OVERRIDE, which is a per-turn decision no
 *  read can anticipate. Empty means no authored macros (or a hostless/stale room). */
type ResolvePromptUserMacrosOp = (chatId: ChatId) => Promise<readonly UserMacroSpec[]>;

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
  /** The chat host's default-preset params (the side-gen sampling ladder's middle rung) — used by the
   *  quiet-generate factory (compaction) and the smart-arbitrate seam. Wired at compose. */
  readonly resolveChatPresetParams: ResolveChatPresetParamsOp;
  /** The room host's app-tier prose overrides — read by assembly (the anchor identity lead-in), the smart
   *  arbiter, compaction and the memory build. Empty ⇒ the shipped defaults. */
  readonly resolveChatProse: ResolveChatProseOp;
  /** Null means tool-use isn't wired — byte-identical no-op. */
  readonly tools: ChatToolOps | null;
  readonly resolveChat: ResolveChatConnectionOp;
  readonly resolveCredential: ResolveCredentialOp;
  readonly maybeRevokeOnAuthFailed: MaybeRevokeOnAuthFailedOp;
  readonly getCard: GetCardOp;
  readonly resolveCharacterTags: ResolveCharacterTagsOp;
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
  /** The admin-resolved memory-summarizer sampling (`AppSettings.memorySummarizer`) — the memory build passes
   *  `{maxTokens, temperature}` onto every `summarize` call AND mirrors `maxTokens` into the token-guard's
   *  output reserve (one home, so the fit and the request can't diverge). Both fields absent ⇒ the summarizer
   *  runs on its own defaults + the token-guard's baseline reserve (byte-identical to pre-wire). */
  readonly memorySummarizer: MemorySummarizerConfig;
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
  /** The chat's active preset's authored user macros (#24) — the picks pane's declaration half. */
  readonly resolvePromptUserMacros: ResolvePromptUserMacrosOp;
  /** ⑧(a) — the caller's `UserSettings.chat.tempChatTtlHours`, the per-user temporary-chat reap TTL (the
   *  FOREIGN-inputs seam: chat never reads the settings domain; wired at compose from `loadUserSettings`).
   *  Always resolves (the setting is `.default`ed); `reapTemporaryChats` converts hours→ms for its cutoff. */
  readonly resolveTempChatTtlHours: ResolveTempChatTtlHoursOp;
}

/** Resolve a user's temporary-chat reap TTL in HOURS (`UserSettings.chat.tempChatTtlHours`). */
type ResolveTempChatTtlHoursOp = (userId: UserId) => Promise<number>;

/** The injected per-member count budget debit. `budget === null` means unbounded (a no-op debit). */
export type DebitBudgetOp = (triggeredBy: UserId, budget: number | null) => Promise<void>;

/** The per-turn host policy resolved under the frozen `runAsUserId`: the budget cap + the max-pro-sub
 *  owner-consent flag. */
export type ResolveTurnPolicyOp = (runAsUserId: UserId) => Promise<{ readonly budget: number | null; readonly allowNonOwnerMaxProSub: boolean }>;

/** What `createChatService` receives from the entry root: collaborators not on {@link ChatContext} and not
 *  built inside the composition root. */
/** Resolve a chat creator's `UserSettings.groupDefaults` — the per-user default `GroupConfig` a NEW chat
 *  seeds its `metadata.group` from (the FOREIGN-inputs seam: chat never reads the settings domain; the op is
 *  wired at compose from `loadUserSettings`). Always resolves (the setting is `.default(DEFAULT_GROUP_CONFIG)`),
 *  so `start-chat` compares against `DEFAULT_GROUP_CONFIG` to decide whether the seed is meaningful. */
export type ResolveCreatorGroupDefaultsOp = (userId: UserId) => Promise<GroupConfig>;

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
  /** The deterministic pre-send serveability verdict for the chat's own resolved connection (#54) — the
   *  honest-refusal gate the composer disables SEND on. Reads the SAME chat-row routing overlay
   *  `resolveConnection` reads; fires no turn or API call. Wired at the entry composition root. */
  readonly checkSendAvailability: (args: { readonly runAsUserId: UserId; readonly chatId: ChatId }) => Promise<ChatSendAvailability>;
  readonly resolveForeignInputs: ResolveForeignInputsOp;
  /** The creator's per-user default GroupConfig — `start-chat` seeds a new chat's `metadata.group` from it. */
  readonly resolveCreatorGroupDefaults: ResolveCreatorGroupDefaultsOp;
  readonly debitBudget: DebitBudgetOp;
  readonly resolveTurnPolicy: ResolveTurnPolicyOp;
  /** The lock holder tag (this replica/turn id) for stale-takeover + holder-scoped release. */
  readonly holder: string;
  /** The per-chat lock TTL (ms), sized for one turn. */
  readonly lockTtlMs: number;
}
