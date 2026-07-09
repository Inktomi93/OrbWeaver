// domain/world-info/contract/service — the typed API surface (read THIS to know everything the domain does).
// Holds:
//   • WorldInfoContext   the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4 /
//                        no-context-returntype; the conventional re-export BUILDER is context.ts)
//   • WorldInfoService   the verb interface (the front door re-exports the type)
//
// The world-info store: world books + their keyword-triggered lore entries, attached at three scopes
// (character / global / persona) for the per-turn chat pool to union. Every verb gates on
// `principal.userId` — ownership IS the gate (no admin/owner guard is injected; world info is user-owned).
// A book is owned via `worldBooks.ownerId`; an entry via its book (the `loadOwnedEntry` inArray-over-owned-
// books guard — entries carry no `ownerId`, D23); an attachment target (character/persona) via its own
// owner column (a sanctioned `@orb/db` schema read, NOT a cross-feature domain import).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The CHAT scope (PD-30 cleared) — the fourth attachment surface (`attachToChat`/`detachFromChat`/
// `listForChat`), built WITHOUT collapsing the chat tier into world-info:
//   • chats are MEMBERSHIP-scoped (D18 — NO `chats.ownerId`); the authority is the host participant.
//     World-info NEVER reads the roster — the gates arrive as INJECTED ops on the context
//     (`requireChatHost` for the room-config writes, `requireChatMember` for the list read), wired from
//     chat's own guards at the composition root (the persona/tag PD-19/PD-20 precedent).
//   • the chat-scoped attach/detach emits `WiBusEvent` (a `ChatBusEvent` member — the contract embeds it
//     so this domain emits WITHOUT importing chat) via the injected `emitWiEvent`, wired to the chat bus's
//     durable-first `emit` at the root. Only a REAL change emits (an idempotent no-op is silent).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

import type { Principal } from "@orb/contracts/identity";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { WiBusEvent } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { ChatId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
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
  GetBookParams,
  GetEntryParams,
  ListBooksParams,
  ListEntriesParams,
  ListForCharacterParams,
  ListForChatParams,
  ListForPersonaParams,
  ListGlobalParams,
  RemoveBookParams,
  RemoveEntryParams,
  UpdateBookParams,
  UpdateEntryParams,
} from "./params";
import type { BackfillResult, DetachResult, RemoveResult, ReorderResult } from "./results";
import type { BookAttachmentView, BookView, EntryView } from "./views";

/**
 * The DI bundle every world-info verb closes over (wired at `service.ts`). Explicit interface (not
 * `ReturnType<typeof …>`) per §7.4 + the `no-context-returntype` gate.
 *   - `db` — the libSQL handle (all queries route through `persistence/`).
 *   - `now` — the INJECTED clock (epoch-ms). Production passes the real clock at `entry/`; tests the frozen
 *     clock. No ambient `Date.now()` in a verb (determinism — `test-determinism`).
 *   - `newBookId` / `newEntryId` — the INJECTED id minters (production `mintTypeId(ID_PREFIX.world*)`; tests
 *     the seeded generator). No ambient `mintTypeId()` in a verb (the same determinism seam).
 *   - `audit` — `foundation/observability`'s `logAudit`, pre-bound to `db` at the root (best-effort; the
 *     verb supplies the timestamp from `now`).
 *
 * The book/entry/character/persona/global surfaces are user-owned (ownership IS the gate). The CHAT scope
 * (PD-30) carries three INJECTED cross-feature ops (file header):
 *   - `requireChatHost` / `requireChatMember` — chat's own membership guards (a non-member gets chat's
 *     leak-free not-found; a non-host write gets its `not_host`), wired at the root. World-info never
 *     reads the roster.
 *   - `emitWiEvent` — the chat bus's durable-first emit (`WiBusEvent` is embedded in `ChatBusEvent`).
 */
export interface WorldInfoContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly requireChatHost: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly requireChatMember: (principal: Principal, chatId: ChatId) => Promise<void>;
  readonly emitWiEvent: (event: WiBusEvent) => Promise<void>;
  /** The user-bus live-freshness emit (PD user-bus lane) — every world-info book/entry/attachment mutation
   *  fires `worldInfoChanged` with the owner's `userId` AFTER its durable write, so a second device's
   *  world-info list refetches. DISTINCT from `emitWiEvent` (the per-OPEN-CHAT bus for `WiBusEvent`
   *  attachment changes). Wired to transport's `publishUserEvent` at the entry root; fire-and-forget. */
  readonly emitUserEvent: EmitUserEvent;
}

export interface WorldInfoService {
  /** The caller's books, newest first. Empty array when they have none. */
  readonly listBooks: (params: ListBooksParams) => Promise<BookView[]>;
  /** One owned book by id. Throws `WorldInfoNotFoundError` when missing OR not the caller's. */
  readonly getBook: (params: GetBookParams) => Promise<BookView>;
  /** Create a book owned by the caller; returns the new book view. */
  readonly createBook: (params: CreateBookParams) => Promise<BookView>;
  /** Patch an owned book (whitelisted fields; undefined skips). Throws when not owned/found. */
  readonly updateBook: (params: UpdateBookParams) => Promise<BookView>;
  /** Delete an owned book — the DB CASCADE clears its entries + all junction rows. Throws when not owned. */
  readonly removeBook: (params: RemoveBookParams) => Promise<RemoveResult>;
  /** Deep-copy an owned book + ALL its entries into a fresh `"<name> (copy)"` book (new ids, unattached at
   *  every scope). One atomic batch. Returns the new book view. Throws when the source isn't owned/found. */
  readonly duplicateBook: (params: DuplicateBookParams) => Promise<BookView>;

  /** The entries of an owned book, by descending `priority` (the display/injection order). */
  readonly listEntries: (params: ListEntriesParams) => Promise<EntryView[]>;
  /** One entry, owner-scoped via its book. Throws when missing OR not the caller's. */
  readonly getEntry: (params: GetEntryParams) => Promise<EntryView>;
  /** Create an entry in an owned book; returns the new entry view (metadata coerced + stored typed). */
  readonly createEntry: (params: CreateEntryParams) => Promise<EntryView>;
  /** Patch an entry (whitelisted; undefined skips, null clears). Ownership folds into the WHERE via the
   *  owned-book inArray subquery — a foreign entry id is NotFound, never a silent write. */
  readonly updateEntry: (params: UpdateEntryParams) => Promise<EntryView>;
  /** Delete an entry, owner-scoped via the owned-book subquery. Throws when not owned/found. */
  readonly removeEntry: (params: RemoveEntryParams) => Promise<RemoveResult>;
  /** Fill the title of every blank-titled entry in an owned book from that entry's keys (comma-joined);
   *  entries with no keys are left blank. Returns the fill count. */
  readonly backfillTitles: (params: BackfillTitlesParams) => Promise<BackfillResult>;
  /** Rewrite entry order: position i → `priority = N - i` (position 0 sorts first). Stale/foreign ids are
   *  dropped; unlisted entries keep their priority. One atomic batch. Returns the rewrite count. */
  readonly applyEntryOrder: (params: ApplyEntryOrderParams) => Promise<ReorderResult>;

  /** Only scope carrying a role. Attach an owned book to an owned character at `role`. `primary` atomically
   *  demotes any other primary on that character (single demote+upsert batch). Idempotent on the composite key. */
  readonly attachToCharacter: (params: AttachToCharacterParams) => Promise<void>;
  /** Detach a book from a character (idempotent — `detached:false` when already absent). */
  readonly detachFromCharacter: (params: DetachFromCharacterParams) => Promise<DetachResult>;
  /** The books attached to an owned character, primary first then newest. Carries the per-attachment role. */
  readonly listForCharacter: (params: ListForCharacterParams) => Promise<BookAttachmentView[]>;

  /** Mark an owned book global (fires for every chat). Gate is plain book ownership. Idempotent. */
  readonly attachGlobal: (params: AttachGlobalParams) => Promise<void>;
  /** Un-mark an owned book global (idempotent — `detached:false` when not global). */
  readonly detachGlobal: (params: DetachGlobalParams) => Promise<DetachResult>;
  /** The caller's global books, newest first (owner-scoped via the book). `role` is null. */
  readonly listGlobal: (params: ListGlobalParams) => Promise<BookAttachmentView[]>;

  /** Attach an owned book to an owned persona (idempotent on the composite key). */
  readonly attachToPersona: (params: AttachToPersonaParams) => Promise<void>;
  /** Detach a book from a persona (idempotent — `detached:false` when already absent). */
  readonly detachFromPersona: (params: DetachFromPersonaParams) => Promise<DetachResult>;
  /** The books attached to an owned persona, newest first. `role` is null. */
  readonly listForPersona: (params: ListForPersonaParams) => Promise<BookAttachmentView[]>;

  /** Attach a caller-OWNED book to a chat room (HOST authority — room-wide prompt content is a one-shot
   *  jailbreak surface, the chat-injection precedent). Idempotent on the composite key; only a REAL insert
   *  emits `wiBookAttached` + audits. */
  readonly attachToChat: (params: AttachToChatParams) => Promise<void>;
  /** Detach a book from a chat room (HOST authority; idempotent — `detached:false` when already absent).
   *  Only a real removal emits `wiBookDetached` + audits. */
  readonly detachFromChat: (params: DetachFromChatParams) => Promise<DetachResult>;
  /** The books attached to a chat the caller is a PRESENT member of, newest first. `role` is null.
   *  Room-public (NOT owner-filtered — the room's pool is what every member's turns assemble against). */
  readonly listForChat: (params: ListForChatParams) => Promise<BookAttachmentView[]>;
}
