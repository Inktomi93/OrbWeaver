// domain/databank/contract/service — the typed API surface: `DatabankContext` (the DI bundle every verb +
// the ingest subsystem close over), `DatabankService` (the tRPC-facing verb interface), `DatabankIngest`
// (the workload-env-facing ingest product), and the injected cross-feature op aliases. databank
// sideways-imports NO sibling runtime — the vector write path (`embeddingsStore`/`pruneDocumentChunks`),
// text extraction (`extractText`), the CAS write/read, the workload enqueue, and the chat-host guard all
// arrive as injected ops wired at `entry/compose` (D18/one-directional-flow).
//
// v1 surface (DB4): upload/createFromText producers · CRUD · reindex · the global+chat scope junctions.
// DB7 adds: scrapeWeb (fetch a page over the compose-bound ANY_HOST safeFetch guard → the §2 canon pipeline).
// DB8 adds: the character-scope junction (attachToCharacter/detachFromCharacter) — a roster character's docs
// join the chat retrieval union (resolveActiveDocumentIds, databank-design/05 §3.2) — and the youtube/wiki
// scrapers. DB6's injected `{{databank}}` chat GATHER op and DB5's `search.documents` lens on the unified
// `search()` are both BUILT (databank graduated D91).

import type { StoredAsset } from "@orb/contracts/assets";
import type { ResolveVisibleRoomsOp } from "@orb/contracts/chat";
import type { BankHealthView, DatabankSettings, IngestRunResult, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { ExtractTextOp } from "@orb/contracts/extraction";
import type { Principal } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { AssetId, CharacterId, ChatId, DocumentId, UserId, WorkloadId } from "@orb/kit/ids";
import type { EmbeddingsService, GenerationReceipt } from "#domain/embeddings";
import type { SearchService } from "#domain/search";
import type { AuditEntry } from "#foundation/observability";
import type {
  BankHealthParams,
  CharacterAttachParams,
  ChatAttachParams,
  CreateFromTextParams,
  DatabankGatherParams,
  GetDocumentParams,
  GlobalAttachParams,
  ListActiveForChatParams,
  ListDocumentsParams,
  ListGlobalParams,
  ReindexParams,
  RemoveDocumentParams,
  RenameDocumentParams,
  ScrapeWebParams,
  ScrapeWikiParams,
  ScrapeYoutubeParams,
  UploadDocumentParams,
} from "./params.ts";
import type { DatabankGatherResult, ListDocumentsResult, UploadResult } from "./results.ts";
import type { ActiveChatDocumentView, DocumentAttachmentsView, DocumentDetailView, DocumentView } from "./views.ts";

/** assets.store, narrowed to the CAS write databank drives (`kind:'document'`). Returns the stored blob's id
 *  + sha-256 hash (the hash IS the document's `importHash` — the CAS already content-addressed the bytes). */
type AssetsStoreOp = (args: {
  readonly principal: Principal;
  readonly bytes: Uint8Array;
  readonly kind: "document";
  readonly mime: string;
  readonly enforceMagic?: boolean;
  readonly maxBytes?: number;
}) => Promise<StoredAsset>;

/** Re-read a document's original CAS bytes by asset id (the re-extract path). `undefined` when the blob was
 *  purged (a degraded doc that can no longer re-extract — never a block). */
type LoadAssetBytesOp = (assetId: AssetId) => Promise<Uint8Array | undefined>;

/** Enqueue the post-upload `databank-ingest` workload for one freshly written document. */
type EnqueueIngestOp = (args: { documentId: DocumentId; ownerId: UserId }) => Promise<{ readonly workloadId: WorkloadId }>;

/** Enqueue a `databank-reindex` workload (the panel/verb-driven derived-layer maintenance). */
type EnqueueReindexOp = (args: { ownerId: UserId; scope: ReindexScope; mode: ReindexMode }) => Promise<{ readonly workloadId: WorkloadId }>;

/** The D18 chat-host predicate (chat's own guard). Attaching a document injects content into every
 *  participant's prompts on the host's dime — write authority is host, not any member. */
type EnsureChatHostOp = (principal: Principal, chatId: ChatId) => Promise<void>;

/** The D18 chat-member predicate (chat's own guard). `listActiveForChat` is member-readable — every
 *  participant deserves to SEE what feeds the room's prompts (even though only the host's docs are retrieved). */
type EnsureChatMemberOp = (principal: Principal, chatId: ChatId) => Promise<void>;

/** The active embed space `(model, dim)` the chunk-store arm tags rows with — PER OWNER (the owner's `embed`
 *  binding defines it, inference program §7.5/§10), read per call. `null` = no binding: nothing to embed into,
 *  and every chunk-count read answers zero through {@link NO_EMBED_SPACE_MODEL}. */
interface ActiveEmbedSpace {
  readonly model: string;
  readonly dim: number;
}

/** The model tag a count read uses when the owner has NO space: no stored chunk ever carries the empty tag, so
 *  the read is honestly zero without a second query shape. */
export const NO_EMBED_SPACE_MODEL = "";

/** Read a user's databank settings (chunk params + retrieval knobs). v1 returns the schema defaults (ST's
 *  bank-wide values); the per-user override lands with the Phase-6 panel. */
type GetDatabankSettingsOp = (ownerId: UserId) => Promise<DatabankSettings>;

/** The compose-bound web-document fetch for scrapeWeb (databank-design/06 §5; the hub-browse H1 `SafeFetchOp`
 *  — the ANY_HOST "arbitrary-URL class"). Reads the page bytes over the self-enforcing `safeFetch` (https-only,
 *  private-range denial, per-hop re-validation — ALL compose-bound and free; the allowlist + `maxBytes` are NOT
 *  caller-suppliable). THROWS on any refusal or fetch failure; the verb collapses that to a leak-free
 *  `ScrapeFailedError` WITHOUT importing infra to branch (the landed `fetchGifImage` precedent — a domain never
 *  imports `infra/network`). The scraper adds ZERO guard logic of its own. */
type SafeFetchOp = (url: string) => Promise<Uint8Array>;

/** The DI bundle every databank verb + the ingest subsystem close over (assembled at `entry/compose`). */
export interface DatabankContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newDocumentId: () => DocumentId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /**
   * The per-user freshness plane (`databankChanged`) — injected, never a sideways reach at the bus (D38).
   * Every persisting verb calls it with the OWNER after its durable write commits, and the ingest subsystem
   * fans it per touched owner at a pass terminal. The client's `USER_BUS_FILTERS` row path-invalidates
   * `trpc.databank`, which is what makes a second tab/device reconcile at all (event-bus coverage survey H3 —
   * before this the whole bank was writer-local `invalidates` at `staleTime: Infinity`).
   *
   * SCOPE — the OWNER's library, never the room's view. A chat/character/global attach also changes what a
   * PARTICIPANT sees (`listActiveForChat`); that half is member-visible state and fans to the ROOM on the
   * chat bus through the five room-fan ops below, never to one user (`membership-fan-guard`). This op
   * announces the bank you own, and it is no longer the ONLY announcement a junction write makes (#2471).
   *
   * FLAG[emit-is-total] — satisfied BY CONSTRUCTION, not by a classifier: the op is synchronous,
   * `void`-returning and non-throwing (transport's `publishUserEvent` → `defineBusChannel.publish`,
   * live-only, no durable row, no FK). The chat bus needs a classify-and-drop wrapper because a `void emit()`
   * over a REJECTABLE durable insert is an unhandled rejection — a process kill. Nothing here can reject, so
   * the rule is the simple one every user-bus producer follows: emit AFTER the commit.
   */
  readonly emitUserEvent: EmitUserEvent;
  /**
   * THE ROOM PLANE (#2471, the entity→room bridge's `databank` kind). The per-chat rack
   * (`listActiveForChat`) is member-readable room-public prompt context, so a junction write is NOT an
   * owner-only event: every co-member sitting in a credited room is reading the set it just changed. Each op
   * below fans a live-only `roomEntityChanged{entity:"databank"}` to the rooms whose rack MOVED; the
   * resolvers and the SQL live at `entry/compose/room-reach.ts` (a domain may not import chat, its bus, or
   * another domain's junctions to fan — the `RegexContext` precedent).
   *
   * FIVE ops rather than one, because each write knows a DIFFERENT key and the rule is always "resolve
   * through a junction this write did not tear down":
   *   • {@link emitRoomDatabankChanged} — `attachToChat`/`detachFromChat`, which already hold the `chatId`;
   *   • {@link fanDatabankRoomsForCharacter} — the character-scope pair, whose reach is the rooms SEATING
   *     the character (read off `chat_participants`, which the write does not touch, so one lookup serves
   *     the attach AND the detach);
   *   • {@link fanDatabankRoomsForMember} — the global-scope pair, same argument one axis over (D85 credits
   *     every PRESENT MEMBER's globals, so the reach is the owner's own seats);
   *   • {@link fanDatabankRoomsForDocument} — `rename`, where the library row moved and all three junctions
   *     survive, so the document's own full reach is resolvable after the write;
   *   • {@link captureRoomReachForDelete} — `remove`, whose three junctions CASCADE, so a post-write reach
   *     is ∅ ALWAYS: snapshot before the DELETE, fan the returned thunk once RETURNING confirms it.
   *
   * FLAG[emit-is-total] — the same by-construction argument as `emitUserEvent`: live-only, no durable row,
   * no FK. The async arms are error-isolated at compose (a failed reach query degrades to fanning nothing),
   * so no reach lookup can ever fault the write it follows.
   */
  readonly emitRoomDatabankChanged: (chatId: ChatId) => void;
  /** @see emitRoomDatabankChanged — the `rename` arm. */
  readonly fanDatabankRoomsForDocument: (documentId: DocumentId) => Promise<void>;
  /** @see emitRoomDatabankChanged — the character-scope attach/detach arm. */
  readonly fanDatabankRoomsForCharacter: (characterId: CharacterId) => Promise<void>;
  /** @see emitRoomDatabankChanged — the global-scope attach/detach arm. */
  readonly fanDatabankRoomsForMember: (ownerId: UserId) => Promise<void>;
  /** @see emitRoomDatabankChanged — the `remove` arm: call BEFORE the delete, fan the thunk after. */
  readonly captureRoomReachForDelete: (documentId: DocumentId) => Promise<() => void>;
  // injected cross-feature ops (types from the owning contracts; wired at compose)
  readonly assetsStore: AssetsStoreOp;
  readonly loadAssetBytes: LoadAssetBytesOp;
  readonly embeddingsStore: EmbeddingsService["store"];
  readonly pruneDocumentChunks: EmbeddingsService["pruneDocumentChunks"];
  /** The DocumentView chunk-count read — embeddings owns `document_chunks`, so databank never imports the
   *  vector table; it derives `chunkCount`/`embeddedCount` through this injected op (vector-scope-derived). */
  readonly countChunks: EmbeddingsService["countDocumentChunks"];
  /** The BANK-WIDE chunk read: the library PHASE lens's chunk half (its key set) and the health census's
   *  passage sums. Same boundary as `countChunks` and the same reason — the phase predicate needs a fact
   *  that lives in the vector table, and databank derives the phase from it rather than reading the table
   *  (verbs/list.ts states the declared limit and its escalation path). */
  readonly chunkCountsByOwner: EmbeddingsService["countDocumentChunksByOwner"];
  readonly extractText: ExtractTextOp;
  /** The current `infra/extraction` EXTRACTOR_VERSION — the re-extract-on-upgrade selection predicate. */
  readonly extractorVersion: string;
  /** The web-document fetch (DB7 scrapeWeb) — the ANY_HOST safeFetch guard, allowlist + cap compose-bound. */
  readonly fetchUrl: SafeFetchOp;
  readonly getActiveEmbedSpace: (ownerId: UserId) => Promise<ActiveEmbedSpace | null>;
  readonly getDatabankSettings: GetDatabankSettingsOp;
  readonly enqueueIngest: EnqueueIngestOp;
  readonly enqueueReindex: EnqueueReindexOp;
  readonly ensureChatHost: EnsureChatHostOp;
  readonly ensureChatMember: EnsureChatMemberOp;
  /** The leak-safe reverse-room read `listAttachments` names its rooms through (#276) — chat's answer to "of
   *  these rooms, which may this caller see, and what are they called". Injected for the same reason the two
   *  guards above are: D18 rooms scope on `chat_participants`, and databank reads neither the roster nor
   *  `chats`. The type is `@orb/contracts/chat`'s (shared with regex + preset); the ONE runtime is
   *  `entry/compose/visible-rooms.ts`. */
  readonly resolveVisibleRooms: ResolveVisibleRoomsOp;
  /** The `search.documents` lens (DB6) — the ONE retrieval capability databank consumes for the chat GATHER
   *  (cluster boundary: databank never re-implements cosine). Scope resolves inside the lens via the resolver
   *  databank itself injected into search; here databank is the CONSUMER (chat → databank → search). */
  readonly searchDocuments: SearchService["documents"];
}

/** The tRPC-facing verb surface. Every verb gates on `principal.userId` (ownership is the gate); chat-attach
 *  additionally requires host authority via `ensureChatHost`. */
export interface DatabankService {
  /** The sync canon write: CAS store → extract → documents row → enqueue the ingest workload. A failed
   *  extraction fails the upload atomically (nothing persisted — `extractedText` is NOT NULL canon). */
  readonly upload: (params: UploadDocumentParams) => Promise<UploadResult>;
  /** origin 'text' — no bytes, no extraction; straight to canon + enqueue ingest. */
  readonly createFromText: (params: CreateFromTextParams) => Promise<UploadResult>;
  /** origin 'web' (DB7): fetch the page over the ANY_HOST safeFetch guard → html extraction → the §2 canon
   *  pipeline. A refused/failed fetch throws a leak-free `ScrapeFailedError` (BAD_REQUEST); never retried. */
  readonly scrapeWeb: (params: ScrapeWebParams) => Promise<UploadResult>;
  /** origin 'youtube' (DB8): fetch the video's timedtext caption track over the SAME guard → plain-text join →
   *  the §2 canon pipeline. A refused/failed fetch (or no captions) throws a leak-free `ScrapeFailedError`. */
  readonly scrapeYoutube: (params: ScrapeYoutubeParams) => Promise<UploadResult>;
  /** origin 'wiki' (DB8): fetch the MediaWiki plain-text extract (endpoint derived from the article host) over
   *  the SAME guard → the §2 canon pipeline. A refused/failed fetch (or a missing article) throws leak-free. */
  readonly scrapeWiki: (params: ScrapeWikiParams) => Promise<UploadResult>;

  readonly get: (params: GetDocumentParams) => Promise<DocumentDetailView>;
  /** Keyset-paged (`{ items, nextCursor, totalCount }`), with every library lens applied server-side. */
  readonly list: (params: ListDocumentsParams) => Promise<ListDocumentsResult>;
  /** The bank's ingest health as a CENSUS (the D-7 home tile). Separate from `list` on purpose — see the
   *  verb header: its bank-wide chunk read must not be paid on every page fetch of the paging library. */
  readonly bankHealth: (params: BankHealthParams) => Promise<BankHealthView>;
  /** Mutable display metadata only; bumps `updatedAt`, touches nothing derived. */
  readonly rename: (params: RenameDocumentParams) => Promise<DocumentView>;
  /** DB cascade clears the chunks + all scope-junction rows; the CAS blob self-heals on the next GC sweep. */
  readonly remove: (params: RemoveDocumentParams) => Promise<void>;

  /** Enqueue a `databank-reindex` workload (param/model/extractor change). */
  readonly reindex: (params: ReindexParams) => Promise<{ readonly workloadId: WorkloadId }>;

  readonly attachGlobal: (params: GlobalAttachParams) => Promise<void>;
  readonly detachGlobal: (params: GlobalAttachParams) => Promise<void>;
  /** WHICH owned documents are global (D-1) — the id SET, not views: its consumer is a membership test
   *  against a list the caller already holds (the `worldInfo.listGlobal` twin, narrowed). */
  readonly listGlobal: (params: ListGlobalParams) => Promise<DocumentId[]>;
  /** Host authority — room-wide prompt content is a one-shot jailbreak surface. */
  readonly attachToChat: (params: ChatAttachParams) => Promise<void>;
  readonly detachFromChat: (params: ChatAttachParams) => Promise<void>;
  /** Character scope (DB8) — plain ownership on BOTH the document and the character; a roster character's docs
   *  feed the chat retrieval union (databank-design/05 §3.2). */
  readonly attachToCharacter: (params: CharacterAttachParams) => Promise<void>;
  readonly detachFromCharacter: (params: CharacterAttachParams) => Promise<void>;
  /** Where a document is attached (owner-gated). */
  readonly listAttachments: (params: GetDocumentParams) => Promise<DocumentAttachmentsView>;
  /** The panel read: the documents ACTIVE for a chat's prompts (D85 membership-widened). Any participant may
   *  see what feeds the room; the HOST additionally sees host-hidden documents (each flagged) to govern the
   *  per-document visibility override, while a member's payload is filtered to the visible set. */
  readonly listActiveForChat: (params: ListActiveForChatParams) => Promise<ActiveChatDocumentView[]>;

  /** The chat GATHER op (DB6): retrieve the scope-active document context for a chat turn + fit it into the
   *  slot's token budget. `null` = nothing to inject (bankless / no hits / budget too small) ⇒ a
   *  byte-identical non-databank turn. Reached ONLY through the compose-injected op on `ChatContext`, never
   *  the tRPC surface. */
  readonly gatherRetrieval: (params: DatabankGatherParams) => Promise<DatabankGatherResult | null>;
}

/** The workload-env-facing ingest product (the chunk→embed→prune orchestration). Reached ONLY through the
 *  injected `env.databank.*` at dispatch — never on the tRPC surface. Idempotent end to end. */
export interface DatabankIngest {
  /** chunk+embed+prune ONE document (the databank-ingest runner's body). */
  readonly ingestDocument: (args: { documentId: DocumentId; signal: AbortSignal }) => Promise<IngestRunResult>;
  /** Re-run the derived layer for one document or every document of an owner (`null` = box-wide). */
  readonly reindex: (args: { ownerId: UserId | null; scope: ReindexScope; mode: ReindexMode; signal: AbortSignal }) => Promise<IngestRunResult>;
}

/** What the domain's `WorkloadContribution` factory needs from the composition root (the two RAG kinds).
 *  `purgeDocumentVectors` is the ONE cross-domain reach — the PD-139(c) old-embed-space reclaim, whose
 *  DELETE lives in embeddings/persistence (the ONE vector write path), injected here as a typed op. */
export interface DatabankWorkloadDeps {
  readonly databankIngest: DatabankIngest;
  readonly beginDocumentVectorSweep: () => Promise<readonly { readonly ownerId: UserId; readonly generation: GenerationReceipt }[]>;
  readonly purgeDocumentVectors: (receipts: readonly { readonly ownerId: UserId; readonly generation: GenerationReceipt }[]) => Promise<void>;
}
