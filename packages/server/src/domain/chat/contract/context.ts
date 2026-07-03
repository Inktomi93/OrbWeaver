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
import type { ChatBusEvent, GroupConfig, RoomOverrides } from "@orb/contracts/chat";
import type { ChatSource, ResolvedConnection, RoutableChat } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { AgentSourceKind, Can, Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
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
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  Handle,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { RegexReplacer } from "@orb/kit/regex";
import type { AuditEntry } from "#foundation/observability";
import type { ActiveTurns } from "./active-turns";
import type { ResolveForeignInputsOp } from "./foreign";
import type { MemoryLog } from "./memory";
import type { TurnRequest, TurnStreamChunk } from "./results";

// ── The regex watchdog seam (D53 — every host-side regex execution point) ─────
/** `regex.applyReplace` — the node:vm ReDoS watchdog (`@orb/server/kit/regex.createRegexApplyReplace`). Wraps
 *  the ONE `text.replace(regex, replacer)` of a user-authored regex in a hard per-call timeout so a
 *  catastrophic-backtracking host-tier pattern THROWS (caught by the kit executor's per-script try/catch →
 *  `onScriptFailure`) instead of hanging the turn. EVERY host-side regex execution point passes it as
 *  `executeRegexScripts({ applyReplace })`: WORLD_INFO + SEND (assembly), AI_OUTPUT + REASONING (pipeline). The
 *  shape mirrors the kit `RegexExecuteOptions.applyReplace` seam. Bound at the root to `createRegexApplyReplace()`. */
export type ApplyRegexReplaceOp = (text: string, regex: RegExp, replacer: RegexReplacer) => string;

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

/** `users.resolveUserPublics` — resolve a human participant's display fields (the entry root decorates this). */
export type ResolveUserPublicsOp = (
  userId: UserId,
  personaId: PersonaId | null,
) => Promise<{
  displayName: string | null;
  handle: string | null;
  avatarAssetId: string | null;
} | null>;

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
// ── Stats (the turn-economics delta; builders are chat's, the apply is stats') ─
/** `stats.applyDelta` — persist the turn-economics delta the chat-side builders produced (the injected-op
 *  signature is the ONE home in `@orb/contracts/stats`). `Batch`/`Db` stay generic per that contract. */
export type ApplyStatsDeltaOp = ApplyStatsDelta<unknown, Db>;

// ── Summarizer side-LLM (memory digest + smart-arbitrate; RoleClients) ────────
/** `RoleClients.summarize` — the memory summarizer + the smart-arbitrate side-LLM (one home on RoleClients). */
export type SummarizeOp = RoleClients["summarize"];

// ── Notifications + presence (the non-member reach + cast-gating; Part III §3/§4) ──
/** `notifications.emit` — deliver an invite/kick/handoff to a NON-member the per-chat bus can't reach.
 *  Durable-first: the row INSERTs before the after-commit fan-out. `coStatements` (PD-24) carries the
 *  producer's membership-transition statements — the op COMMITS them in ONE `db.batch` WITH the INSERT
 *  (the producer must NOT pre-execute them), so the transition + the notification are crash-atomic. The
 *  statements ride erased (`unknown` — the `ApplyStatsDelta` generic-batch precedent). */
export type NotificationsEmitOp = (
  event: NotificationEvent,
  coStatements?: readonly unknown[],
) => Promise<void>;

/** `sessions.resolveHandle` — the EXACT handle→userId lookup for TARGETED invites (PD-66; chat.md §2 —
 *  no listing, rate-limited at transport). Unknown/disabled collapses to null. Sessions is the sanctioned
 *  `users` reader; chat never reads `users` itself (`no-direct-users-read`). */
export type ResolveHandleOp = (handle: Handle) => Promise<UserId | null>;

/** `sessions.provisionAgentPrincipal` — lazily find-or-mint the owner's agent principal (D60; the D60 mint
 *  gates the owner human+enabled). `seatAgent` calls it at the seat moment (doc 04 §3). Sessions is the
 *  sanctioned `users` WRITER; chat never touches `users`. The `AgentSourceKind`/result are re-spelled
 *  structurally (the {@link GroupCharacterRef} precedent) so chat takes no `→ sessions` server edge. */
export type ProvisionAgentPrincipalOp = (params: {
  readonly ownerUserId: UserId;
  readonly sourceKind: AgentSourceKind;
}) => Promise<{ readonly agentUserId: UserId; readonly created: boolean }>;

/** `users.resolveAgentEnabled` — is this agent principal's kill switch ON (`users.enabled`)? The containment
 *  read (doc 03 §5 / doc 02 §1.1): a disabled agent is refused a seat AND dropped from every cast. The entry
 *  root is the sanctioned `users` reader; chat never reads `users` (`no-direct-users-read`). */
export type ResolveAgentEnabledOp = (agentUserId: UserId) => Promise<boolean>;

/** `presence.read` — the server-derived SSE liveness for a `userId` (NEVER client-asserted — a spoofable
 *  presence is a prompt-composition attack). Read once per round for cast-gating (a flip takes next round). */
export type PresenceReadOp = (userId: UserId) => Promise<PresenceView>;

/** `imagery.generatePicture` — the injected image-generation op (imagery-design/04 §2). Chat CANNOT import
 *  `domain/imagery` (domain-no-cross-feature), so it declares the STRUCTURAL result it consumes (the stored
 *  asset ids + the warnings) and the composition root maps imagery's `GeneratedPicture` onto it. Chat holds
 *  message-write authority; imagery is caller-blind (it returns blocks, never posts — §2.3). */
export type GeneratePictureOp = (p: {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly mode: PromptTemplateMode;
  readonly prompt?: string | undefined;
  readonly n?: number | undefined;
}) => Promise<{
  readonly images: readonly { readonly assetId: string }[];
  readonly warnings: readonly { readonly code: string; readonly detail: string }[];
}>;

/** `settings`+`persona` — the starter's USER-LEVEL active persona (`seeds.defaultPersonaId`, validated
 *  owned/alive at the root — stale/unowned collapses to null so a dead id never lands in the
 *  `chats.anchorPersonaId` FK). The `startChat` default-seed source (persona.md: no explicit anchor ⇒ the
 *  starter's active persona anchors the room; the card {{user}} POV is theirs from message one). */
export type ResolveDefaultPersonaOp = (userId: UserId) => Promise<PersonaId | null>;

// ── Memory substrate (injected here, consumed by `memory/` — see FLAG[memory-substrate]) ──
// REFINED by the memory chunk (the FLAG[memory-substrate] grant): the minimal `{lens,text,blockKey}` store
// op could not carry the `chat_digests`/`chat_segments` row facets memory produces (topicAnchor/keywords/
// contentHash/isGroup/speakers + the segment seq-span), so the store op is a per-lens discriminated union.
// Memory still holds NO vector write + NO cosine: it hands `embeddings.store` the distilled `text` (embeddings
// embeds it + stamps model/dim/hubScore-untouched) plus the non-vector facets; the scan is `search.*`.

/** memory's DIGEST write payload → `embeddings.store` (the ONE write path). `text` is the distilled digest
 *  body embeddings embeds (the sharp key); the rest are the `chat_digests` row facets memory computes
 *  (`contentHash` = the staleness/collapse key, NEVER coerced; `speakerCharacterIds` → the
 *  `chat_digest_speakers` join). `key.scopedCharacterId` is ALWAYS a real `CharacterId` (inv 8 — the synthetic
 *  group-as-character for the shared bucket, a cast char for scoped; no `''` sentinel, no NULL — D20/§4).
 *  FLAG[chat-digest-speakers]: the foundation's embeddings `DigestStoreParams` carries NO `speakerCharacterIds`
 *  (pinned by `params.contract.test`), so the eventual chat→embeddings adapter (PD-41) — not `embeddings.store`
 *  — must persist this join; `embeddings.store` writes `chat_digests` only. */
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

/** memory's VERBATIM SEGMENT write payload → `embeddings.store`. `text` is the raw block transcript embeddings
 *  embeds; `(chatId, blockIdx)` is the `chat_segments` upsert key; the seq-span points back to canon. Segments
 *  are NOT scope-keyed (shared per chat — `chat_segments` has no `scopedCharacterId`). */
export interface StoreSegmentParams {
  readonly lens: "segment";
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly text: string;
  readonly contentHash: string;
}

/** `embeddings.store` — memory's digest/segment vector write (the ONE write path; kills the `hub_score=null`
 *  conflation — movement table). The per-lens union is the embeddings `chat-block` store arm (FLAG[PD-34]). */
export type EmbeddingsStoreOp = (params: StoreDigestParams | StoreSegmentParams) => Promise<void>;

// The foundation homed the egocentric `queryText` + `scopedCharacterId`
// (§4/§3b #4) directly on `MemoryQueryOptions` (was carried chat-side on a `MemoryRecallQuery` wrapper as a
// workaround). The wrapper is therefore GONE (no-doubling — the two fields had one home now); both recall ops
// take `MemoryQueryOptions` directly. `scopedCharacterId` is a real `CharacterId` there (inv 8).

/** `search.digests` — memory's chat-scoped recall (the 6 semantics; chat-scope + egocentric bucket + bridge
 *  candidates first-class on `MemoryQueryOptions`). Returns the ranked block identities (memory resolves them
 *  back to the digest `text` for `{{memory}}`). */
export type SearchDigestsOp = (query: MemoryQueryOptions) => Promise<readonly BlockKey[]>;

/** `search.corpus` — the cross-chat corpus/digest+segment scan (Q6), distinct from the dissolved corpus
 *  domain. Same query seam; host-only scope is enforced by the caller. */
export type SearchCorpusOp = (query: MemoryQueryOptions) => Promise<readonly BlockKey[]>;

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
  readonly newInviteId: () => ChatInviteId;
  /** Hash an invite token before persistence (the sessions discipline — never stored raw; PD-61: an entry
   *  crypto op like the minters, bound to `SESSION_SECRET` at the root — `invites`). */
  readonly hashToken: (token: string) => string;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  // ── the regex ReDoS watchdog (D53 — injected into every host-side executeRegexScripts) ──
  readonly applyRegexReplace: ApplyRegexReplaceOp;
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
  readonly resolveUserPublics: ResolveUserPublicsOp;
  readonly resolveImageUrl: ResolveImageUrlOp;
  // ── stats / summarizer ──
  readonly applyStatsDelta: ApplyStatsDeltaOp;
  readonly summarize: SummarizeOp;
  /** The summarizer model's resolved context window (tokens) — the memory build's token-guard reads it to fit
   *  each summarizer call to the user's ACTUAL context (knowledge-cluster §3a/§10). Bound at the root from
   *  `roleClients.summarizerContextTokens`. */
  readonly summarizerContextTokens: number;
  // ── notifications / presence ──
  readonly emitNotification: NotificationsEmitOp;
  readonly resolveHandle: ResolveHandleOp;
  // ── agent principals (D60 — the seatAgent mint + the containment enabled-read; both sanctioned users ops) ──
  readonly provisionAgentPrincipal: ProvisionAgentPrincipalOp;
  readonly resolveAgentEnabled: ResolveAgentEnabledOp;
  readonly readPresence: PresenceReadOp;
  /** `imagery.generatePicture` — the injected image-generation op (the `chat.generateImage` verb's executor). */
  readonly generatePicture: GeneratePictureOp;
  /** The starter's user-level active persona — startChat's anchor default-seed (null = no seed). */
  readonly resolveDefaultPersona: ResolveDefaultPersonaOp;
  // ── memory substrate (consumed by memory/) ──
  readonly embeddingsStore: EmbeddingsStoreOp;
  readonly searchDigests: SearchDigestsOp;
  readonly searchCorpus: SearchCorpusOp;
  /** The structured memory observability sink (knowledge-cluster §3a — `memoryTrace` + the greppable
   *  `memory.build`/`memory.recall` log points). Bound at the root to `#foundation/observability`. */
  readonly log: MemoryLog;
  // ── metadata parse-seam convenience ──
  readonly getGroupConfig: GetGroupConfigOp;
  readonly getRoomOverrides: GetRoomOverridesOp;
}

// ── Engine deps (the §9 security belts — injected, NOT on ctx; see engine/engine.ts header) ──
/** The injected per-member COUNT budget debit (the transport `MemberBudget.debit` shape). `budget === null`
 *  ⇒ unbounded (a no-op debit — the supervisor-limited domain floor). Homed here (not file-local on engine/
 *  budget) so {@link ChatServiceDeps} can reference it — the `types-in-contract` gate. */
export type DebitBudgetOp = (triggeredBy: UserId, budget: number | null) => Promise<void>;

/** The per-turn host policy resolved under the frozen `runAsUserId` (the budget CAP + the max-pro-sub
 *  owner-consent flag) — read from host settings, for which there is no `ChatContext` op (engine.ts header). */
export type ResolveTurnPolicyOp = (
  runAsUserId: UserId,
) => Promise<{ readonly budget: number | null; readonly allowNonOwnerMaxProSub: boolean }>;

/**
 * What `createChatService` receives from the entry root — the collaborators that are NOT on {@link ChatContext}
 * and are NOT built inside the composition root (the engine + `loadParticipantViews` are constructed there). The
 * entry root assembles every field; chat sideways-imports none of it. The chat bus `emit`, the auto-mode `prng`/
 * `delay` determinism seams (D46), the per-turn connection/foreign resolvers, and the engine's budget/policy/
 * lock belts are all wired here (their FLAGs in bus.ts / budget.ts / engine.ts point at this seam). The invite
 * crypto (`hashToken`/`newInviteId`) moved to {@link ChatContext} (PD-61 — ctx minter/crypto siblings).
 */
export interface ChatServiceDeps {
  /** The chat bus emit (durable-first; chat's own collaborator — used by ~every factory + the engine). */
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  /** The in-flight lock-free turn registry (abort + concurrency; `turn`). */
  readonly activeTurns: ActiveTurns;
  /** The seeded PRNG for arbitration sampling (D46 — no ambient `Math.random`; `turn`). */
  readonly prng: () => number;
  /** The inter-turn delay for the auto-mode chain (D46 — no ambient timers; `turn`). */
  readonly delay: (ms: number) => Promise<void>;
  /** Resolve `{api, model, credential, capability}` for a turn under the frozen host (`turn`/`read`/`start-chat`). */
  readonly resolveConnection: (args: {
    readonly runAsUserId: UserId;
    readonly chatId: ChatId;
  }) => Promise<ResolvedConnection>;
  /** The FOREIGN half of the assemble ctx (preset/persona/settings) from chat-supplied keys (`turn`/`read`/`start-chat`). */
  readonly resolveForeignInputs: ResolveForeignInputsOp;
  /** The per-member COUNT budget debit (engine §9 belt). */
  readonly debitBudget: DebitBudgetOp;
  /** The per-turn host policy — budget cap + max-pro-sub consent (engine §9 belt). */
  readonly resolveTurnPolicy: ResolveTurnPolicyOp;
  /** The lock holder tag (this replica/turn id) for stale-takeover + holder-scoped release (engine). */
  readonly holder: string;
  /** The per-chat lock TTL (ms), sized for one turn (engine). */
  readonly lockTtlMs: number;
}
