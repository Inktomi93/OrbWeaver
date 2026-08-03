// domain/world-info/contract/service — typed API surface: WorldInfoContext (DI bundle) + WorldInfoService
// (verb interface). World books + keyword-triggered lore entries, attached at character/global/persona/chat
// scopes for the per-turn chat pool to union. Every verb gates on principal.userId (ownership is the gate).
//
// The chat scope is membership-scoped (D18 — no chats.ownerId); its guards (requireChatHost/Member) and
// emit (emitWiEvent) arrive as injected ops from chat's own guards/bus, wired at the composition root.

import type { Principal } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { LoreConstantCanonRow, LoreEntryIndexRow, UpsertEntriesResult, WiBusEvent } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { ChatId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type { ExportedWorldBook } from "./export";
import type { ImportWorldBookOutcome } from "./import";
import type {
  ApplyEntryOrderParams,
  AttachGlobalParams,
  AttachToCharacterParams,
  AttachToChatParams,
  AttachToPersonaParams,
  BackfillTitlesParams,
  CreateBookParams,
  CreateEntryParams,
  DetachFromCharacterParams,
  DetachFromChatParams,
  DetachFromPersonaParams,
  DetachGlobalParams,
  DuplicateBookParams,
  ExportBookParams,
  GetBookParams,
  GetEntryParams,
  ImportBookFileParams,
  ListBooksParams,
  ListConstantCanonParams,
  ListEntriesParams,
  ListEntryIndexParams,
  ListForCharacterParams,
  ListForChatParams,
  ListForPersonaParams,
  ListGlobalParams,
  RemoveBookParams,
  RemoveEntryParams,
  UpdateBookParams,
  UpdateEntryParams,
  UpsertEntriesParams,
} from "./params";
import type { BackfillResult, DetachResult, RemoveResult, ReorderResult } from "./results";
import type { BookAttachmentView, BookView, EntryView } from "./views";

/** DI bundle every world-info verb closes over. Chat-scope guards/emit are injected from chat itself. */
export interface WorldInfoContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireChatHost: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly requireChatMember: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly emitWiEvent: (event: WiBusEvent) => Promise<void>;
  /** Live-freshness emit; distinct from emitWiEvent (the per-open-chat bus for attachment changes). */
  readonly emitUserEvent: EmitUserEvent;
}

export interface WorldInfoService {
  readonly listBooks: (params: ListBooksParams) => Promise<BookView[]>;
  readonly getBook: (params: GetBookParams) => Promise<BookView>;
  readonly createBook: (params: CreateBookParams) => Promise<BookView>;
  readonly updateBook: (params: UpdateBookParams) => Promise<BookView>;
  /** DB cascade clears its entries + all junction rows. */
  readonly removeBook: (params: RemoveBookParams) => Promise<RemoveResult>;
  /** Deep-copies a book + all its entries into a fresh "<name> (copy)" book, unattached at every scope. */
  readonly duplicateBook: (params: DuplicateBookParams) => Promise<BookView>;
  /** THE single-book export door (F2 — the verbs were built and had ZERO doors, so sharing one lorebook
   *  meant a full library-zip round-trip). A thin arm over the SAME `ExportWorldBook` the bundle descriptor
   *  streams, so a shared book is byte-identical to the one inside a backup. `null` = not the caller's. */
  readonly exportBook: (params: ExportBookParams) => Promise<ExportedWorldBook | null>;
  /** THE single-book import door — a thin arm over the SAME `ImportWorldBook` the bundle descriptor calls,
   *  so the dedupe-by-name semantics are the bundle's by construction. Never throws for a malformed file;
   *  the refusal reason is what the import dialog renders. */
  readonly importFile: (params: ImportBookFileParams) => Promise<ImportWorldBookOutcome>;

  /** By descending priority (the display/injection order). */
  readonly listEntries: (params: ListEntriesParams) => Promise<EntryView[]>;
  readonly getEntry: (params: GetEntryParams) => Promise<EntryView>;
  readonly createEntry: (params: CreateEntryParams) => Promise<EntryView>;
  readonly updateEntry: (params: UpdateEntryParams) => Promise<EntryView>;
  readonly removeEntry: (params: RemoveEntryParams) => Promise<RemoveResult>;
  /** Fills the title of every blank-titled entry from its keys (comma-joined). */
  readonly backfillTitles: (params: BackfillTitlesParams) => Promise<BackfillResult>;
  /** Rewrites entry order: position i → priority = N - i. Stale/foreign ids dropped. */
  readonly applyEntryOrder: (params: ApplyEntryOrderParams) => Promise<ReorderResult>;

  /** Only scope carrying a role. `primary` atomically demotes any other primary on that character. */
  readonly attachToCharacter: (params: AttachToCharacterParams) => Promise<void>;
  readonly detachFromCharacter: (params: DetachFromCharacterParams) => Promise<DetachResult>;
  readonly listForCharacter: (params: ListForCharacterParams) => Promise<BookAttachmentView[]>;

  /** Marks a book global (fires for every chat). Gate is plain book ownership. */
  readonly attachGlobal: (params: AttachGlobalParams) => Promise<void>;
  readonly detachGlobal: (params: DetachGlobalParams) => Promise<DetachResult>;
  readonly listGlobal: (params: ListGlobalParams) => Promise<BookAttachmentView[]>;

  readonly attachToPersona: (params: AttachToPersonaParams) => Promise<void>;
  readonly detachFromPersona: (params: DetachFromPersonaParams) => Promise<DetachResult>;
  readonly listForPersona: (params: ListForPersonaParams) => Promise<BookAttachmentView[]>;

  /** Host authority — room-wide prompt content is a one-shot jailbreak surface. */
  readonly attachToChat: (params: AttachToChatParams) => Promise<void>;
  readonly detachFromChat: (params: DetachFromChatParams) => Promise<DetachResult>;
  /** Room-public, not owner-filtered — the room's pool is what every member's turns assemble against. */
  readonly listForChat: (params: ListForChatParams) => Promise<BookAttachmentView[]>;

  /** The SHARED machine-writer bulk upsert (chat-crew-design/02 §7; CC-D). Upserts entries by (bookId,
   *  title), owner-gated on the book; NEVER overwrites a human-curated entry (the stored
   *  `metadata.crew.contentHash` guard). Injected into the chat/rpg crew + D46 automation — the ONE
   *  hand-edit-safe home. */
  readonly upsertEntries: (params: UpsertEntriesParams) => Promise<UpsertEntriesResult>;
  /** The lean per-book entry index a machine writer reads to build its merge prompt + count against a cap. */
  readonly listEntryIndex: (params: ListEntryIndexParams) => Promise<readonly LoreEntryIndexRow[]>;
  /** A chat's CONSTANT ("always"-scope) lorebook canon (rpg-design/06 §4) — the pre-play world truth a
   *  producer reads. Principal-less: room-public prompt content (the caller gated membership upstream). */
  readonly listConstantCanon: (params: ListConstantCanonParams) => Promise<readonly LoreConstantCanonRow[]>;
}
