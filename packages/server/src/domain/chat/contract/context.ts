// domain/chat/contract/context — the explicit `ChatContext` DI bundle + every injected cross-feature op TYPE
// (chat.md Part I 8-slot context + the "Cross-feature composition (the injection model)" table). HOMED under
// `contract/` because the `types-in-contract`/`no-context-returntype` gate forbids an exported type in the
// conventional `context.ts` slot (the connection precedent — `ConnectionContext` lives in `contract/`); the
// top-level `context.ts` RE-EXPORTS this so the feature root + tests reference the DI bundle by name. It is an
// explicit `interface`, NEVER `ReturnType<typeof createChatContext>` (inv §14).
//
// BOUNDARIES ARE PHYSICS: every cross-feature/infra dependency is an INJECTED op (chat sideways-imports NO
// sibling-domain runtime — `domain-no-cross-feature`; the ops are wired at the entry composition root). The op
// TYPES reference only DOWN-the-cake contract/kit/db + foundation types; the runtime is adapted at the root.
//
// The chat ROLE (`runChatTurn`) is the ONE turn dispatch (chat.md §2 — "the domain calls a role, never a
// backend"): NO agent-sdk session/seed/runner vocab (inv §2/§3 — that is sealed in `infra/providers`).
//
// FLAG[memory-substrate]: `embeddings.store` / `search.digests` / `search.corpus` are injected at THIS seam but
// CONSUMED by the `memory/` subsystem (a separate build chunk). They are declared against the cross-domain seam
// types available now (`MemoryQueryOptions`/`BlockKey`); the memory-subsystem chunk owns + may refine their
// precise param/result shapes (the rich search hit/result + the embeddings store-params are not on the seam node).

import type { CharacterCard } from "@orb/contracts/character";
import type { GroupConfig, RoomOverrides } from "@orb/contracts/chat";
import type { ChatSource, ResolvedConnection, RoutableChat } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Can } from "@orb/contracts/identity";
import type { NotificationEvent, PresenceView } from "@orb/contracts/notifications";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { BlockKey, MemoryQueryOptions } from "@orb/contracts/search";
import type { ApplyStatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { ContentImageRef } from "@orb/kit/content";
import type {
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatParticipantId,
  ChatStreamEventId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type { TurnRequest, TurnStreamChunk } from "./results";

// ── The turn role (chat.md §2 — the ONE dispatch) ─────────────────────────────
/** The injected `chat` role (`infra/providers.runChatTurn`): the engine builds a {@link TurnRequest} and
 *  streams chunks back (text/reasoning deltas + a terminal `final` economics chunk). The 4 per-backend
 *  dispatch arms collapse into this ONE call; the runner translates `TurnRequest` → its sealed request. */
export type RunChatTurnOp = (req: TurnRequest) => AsyncIterable<TurnStreamChunk>;

// ── Connection / credentials (per-turn resolution; chat.md §7.1/§5) ───────────
/** `connection.resolveChat` — resolve `{api, model, credential, capability}` for a turn from the chat row's
 *  routable fields + the host's UserSettings, under the FROZEN `runAsUserId` (D19 — never the caller). */
export type ResolveChatConnectionOp = (params: {
  readonly runAsUserId: UserId;
  readonly routable: RoutableChat;
  readonly signal?: AbortSignal | undefined;
}) => Promise<ResolvedConnection>;

/** `credentials.resolve` — the brand-protected credential for a `{runAsUserId, source}` (the side-LLM /
 *  summarizer path; the per-turn credential rides {@link ResolveChatConnectionOp}'s `ResolvedConnection`). */
export type ResolveCredentialOp = (params: {
  readonly runAsUserId: UserId;
  readonly source: ChatSource;
}) => Promise<ResolvedCredential>;

/** `credentials.maybeRevokeOnAuthFailed` — the post-turn auth_failed side-effect (un-invert the `_shared`
 *  drawer; chat.md movement table). Best-effort; never throws into the turn path. */
export type MaybeRevokeOnAuthFailedOp = (params: {
  readonly runAsUserId: UserId;
  readonly source: ChatSource;
  readonly status: number;
}) => Promise<void>;

// ── Character (live identity per roster member; D28) ──────────────────────────
/** `character.getCard` — the live card (flat `characters` row, D28) for a roster member under the host's
 *  ownership. `null` ⇒ gone / mid-delete (the caller treats null as "skip", never an error). */
export type GetCardOp = (params: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
}) => Promise<CharacterCard | null>;

/** `assets.resolveImageUrl` — resolve a parsed message-image ref (D45) to a model-fetchable URL/data-URI at
 *  the engine REQUEST seam: an `asset` ref → the owner's CAS object URL; an `external` ref → itself, or `null`
 *  when blocked by `forbidExternalMedia` (D44 §12.3) or the asset is gone. `null` ⇒ the engine drops that
 *  image part. Owner-scoped like {@link GetCardOp} (the host's CAS, D16 host-only-corpus). */
export type ResolveImageUrlOp = (params: {
  readonly ownerId: UserId;
  readonly ref: ContentImageRef;
}) => Promise<string | null>;

/** A handle to a synthetic group-character identity row (chat consumes character's `CharacterRef` shape
 *  cross-feature; declared structurally so chat takes no `→ character` server edge). */
export interface GroupCharacterRef {
  readonly characterId: CharacterId;
}

/** `character.mintSyntheticGroupCharacter` — find-or-mint the hidden `__group__${chatId}` identity (the
 *  narrator-authoring + scoped-group-memory bucket; a real id, never NULL — Part III §10). Idempotent. */
export type MintSyntheticGroupCharacterOp = (params: {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}) => Promise<GroupCharacterRef>;

/** `character.findSyntheticGroupCharacter` — the group identity for a room, or `null` if not yet minted. */
export type FindSyntheticGroupCharacterOp = (params: {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
}) => Promise<GroupCharacterRef | null>;

// ── Persona (per-participant active persona; host-or-self) ────────────────────
/** `persona.setActivePersona` — set the live `{{user}}` for a human participant (host-or-self; the
 *  `chats.personaId` drop relocated this to `chat_participants.activePersonaId` — movement table). */
export type SetActivePersonaOp = (params: {
  readonly principalUserId: UserId;
  readonly chatId: ChatId;
  readonly personaId: PersonaId | null;
}) => Promise<void>;

// ── Stats (the turn-economics delta; builders are chat's, the apply is stats') ─
/** `stats.applyDelta` — persist the turn-economics delta the chat-side builders produced (the injected-op
 *  signature is the ONE home in `@orb/contracts/stats`). `Batch`/`Db` stay generic per that contract. */
export type ApplyStatsDeltaOp = ApplyStatsDelta<unknown, Db>;

// ── Summarizer side-LLM (memory digest + smart-arbitrate; RoleClients) ────────
/** `RoleClients.summarize` — the memory summarizer + the smart-arbitrate side-LLM (one home on RoleClients). */
export type SummarizeOp = RoleClients["summarize"];

// ── Notifications + presence (the non-member reach + cast-gating; Part III §3/§4) ──
/** `notifications.emit` — deliver an invite/kick/handoff to a NON-member the per-chat bus can't reach
 *  (durable-first: the row is inserted in the membership-transition tx; this fan-out runs after commit). */
export type NotificationsEmitOp = (event: NotificationEvent) => Promise<void>;

/** `presence.read` — the server-derived SSE liveness for a `userId` (NEVER client-asserted — a spoofable
 *  presence is a prompt-composition attack). Read once per round for cast-gating (a flip takes next round). */
export type PresenceReadOp = (userId: UserId) => Promise<PresenceView>;

// ── Memory substrate (injected here, consumed by `memory/` — see FLAG[memory-substrate]) ──
/** `embeddings.store` — memory's digest/segment vector write (the ONE write path; kills the `hub_score=null`
 *  conflation — movement table). The precise store-params are the embeddings domain's; declared minimally. */
export type EmbeddingsStoreOp = (params: {
  readonly lens: "digest" | "segment";
  readonly text: string;
  readonly blockKey: BlockKey;
}) => Promise<void>;

/** `search.digests` — memory's chat-scoped recall (the 6 semantics as `MemoryQueryOptions`; chat-scope +
 *  bridge candidates first-class). Returns the ranked block identities. */
export type SearchDigestsOp = (options: MemoryQueryOptions) => Promise<readonly BlockKey[]>;

/** `search.corpus` — the cross-chat corpus/digest+segment scan (Q6), distinct from the dissolved corpus
 *  domain. Same options seam; host-only scope is enforced by the caller. */
export type SearchCorpusOp = (options: MemoryQueryOptions) => Promise<readonly BlockKey[]>;

// ── The effective room-behavior readers (parse seam injected, so verbs don't re-import the parser) ──
/** Parse a chat's raw `metadata` blob → its effective {@link GroupConfig} (default-applied, fault-isolated).
 *  A thin convenience the root binds to `contract/metadata.getGroupConfig`. */
export type GetGroupConfigOp = (rawMetadata: unknown) => GroupConfig;
/** Parse a chat's raw `metadata` blob → its effective {@link RoomOverrides} (default-applied). */
export type GetRoomOverridesOp = (rawMetadata: unknown) => RoomOverrides;

/**
 * The DI bundle every chat verb / subsystem closes over (assembled at the entry composition root and handed
 * to `createChatService`). `db` routes all queries through `persistence/`; `now` + the id-minters are the
 * determinism seams (no ambient `Date.now()`/`mintTypeId()` in a verb — testing §3); `audit` is the
 * pre-bound best-effort audit write. Everything else is an injected cross-feature/infra op (above).
 */
export interface ChatContext {
  readonly db: Db;
  readonly now: () => number;
  // ── the privilege-decision seam (PD-1) — admin's `can()` injected DOWN; chat NEVER imports admin. The
  //    guard/deciders route every chat-authority verdict through this (`can(principal, 'read'|'host',
  //    {kind:'chat', roster})`); the only role/host comparison is INSIDE `can()` (spine #6). ──
  readonly can: Can;
  // ── id minters (the in-scope chat tables this slice's verbs create) ──
  readonly newChatId: () => ChatId;
  readonly newMessageId: () => MessageId;
  readonly newMessageVariantId: () => MessageVariantId;
  readonly newParticipantId: () => ChatParticipantId;
  readonly newInjectionId: () => ChatInjectionId;
  readonly newEventId: () => ChatEventId;
  readonly newStreamEventId: () => ChatStreamEventId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  // ── the turn role ──
  readonly runChatTurn: RunChatTurnOp;
  // ── connection / credentials ──
  readonly resolveChat: ResolveChatConnectionOp;
  readonly resolveCredential: ResolveCredentialOp;
  readonly maybeRevokeOnAuthFailed: MaybeRevokeOnAuthFailedOp;
  // ── character ──
  readonly getCard: GetCardOp;
  readonly mintSyntheticGroupCharacter: MintSyntheticGroupCharacterOp;
  readonly findSyntheticGroupCharacter: FindSyntheticGroupCharacterOp;
  // ── assets ──
  readonly resolveImageUrl: ResolveImageUrlOp;
  // ── persona ──
  readonly setActivePersona: SetActivePersonaOp;
  // ── stats / summarizer ──
  readonly applyStatsDelta: ApplyStatsDeltaOp;
  readonly summarize: SummarizeOp;
  // ── notifications / presence ──
  readonly emitNotification: NotificationsEmitOp;
  readonly readPresence: PresenceReadOp;
  // ── memory substrate (consumed by memory/) ──
  readonly embeddingsStore: EmbeddingsStoreOp;
  readonly searchDigests: SearchDigestsOp;
  readonly searchCorpus: SearchCorpusOp;
  // ── metadata parse-seam convenience ──
  readonly getGroupConfig: GetGroupConfigOp;
  readonly getRoomOverrides: GetRoomOverridesOp;
}

/** What `createChatService` receives from the entry root. Identical to {@link ChatContext} — no
 *  deps→context transform; named for front-door surface symmetry with the other domains. */
export type ChatServiceDeps = ChatContext;
