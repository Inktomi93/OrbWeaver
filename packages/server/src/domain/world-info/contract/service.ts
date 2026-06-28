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
// DEFERRED — the CHAT scope (3 verbs) + the WI bus. world-info.md lists `attachToChat`/`detachFromChat`/
// `listForChat` (emitting `WiBusEvent`) as the fourth attachment scope, but they are NOT built here:
//   • chats are MEMBERSHIP-scoped (D18 — there is NO `chats.ownerId`); the authority to attach a book to a
//     chat is the host participant, gated by the `can({ kind: 'chat', roster })` resource arm — which is
//     explicitly NOT built yet (admin contract/guard.ts FLAG[PD-1]: `ResourceRef = GlobalResource` only,
//     "the resource-role axis lands with chat"). The chat-resource `can()` call does not even type-check
//     today, so this is a hard compile-time block, not a soft one.
//   • the chat-scoped attach emits `WiBusEvent` onto the chat bus (`ChatBusEvent`) — a chat-domain concern
//     not built until Phase 5.
// Building either now would collapse the chat tier into world-info (the precise neo-pattern failure mode the
// orbweaver rigor exists to prevent). This mirrors persona's `setActivePersona` deferral (persona
// service.ts FLAG[PD-20], same root cause). The `WiBusEvent` type + the `chatBooks` table already exist
// (declared in contracts/db); only the verbs + the bus wiring wait. The injected bundle below therefore
// carries NO `emitWiEvent`/`ensureChatOwned` — those arrive type-only on the context when the chat scope
// lands. FLAG[PD-30]: chat-scope attach/detach/list + WiBusEvent emit → domain/world-info when the
// `can({kind:'chat',roster})` resource arm + the chat bus exist (Phase 5 chat build).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

import type { Db } from "@orb/db";
import type { WorldBookId, WorldEntryId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type {
  ApplyEntryOrderParams,
  AttachGlobalParams,
  AttachToCharacterParams,
  AttachToPersonaParams,
  BackfillTitlesParams,
  CreateBookParams,
  CreateEntryParams,
  DetachFromCharacterParams,
  DetachFromPersonaParams,
  DetachGlobalParams,
  DuplicateBookParams,
  GetBookParams,
  GetEntryParams,
  ListBooksParams,
  ListEntriesParams,
  ListForCharacterParams,
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
 * No guard + no cross-feature op: world info is user-owned (ownership IS the gate). The deferred chat scope
 * would extend this with `emitWiEvent` + `ensureChatOwned` (type-only) — see the file header.
 */
export interface WorldInfoContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newBookId: () => WorldBookId;
  readonly newEntryId: () => WorldEntryId;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
}

export interface WorldInfoService {
  // ── Books ──────────────────────────────────────────────────────────────────
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

  // ── Entries ──────────────────────────────────────────────────────────────────
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

  // ── Attachments — character (the only scope carrying a role) ─────────────────
  /** Attach an owned book to an owned character at `role`. `primary` atomically demotes any other primary
   *  on that character (single demote+upsert batch). Idempotent on the composite key. */
  readonly attachToCharacter: (params: AttachToCharacterParams) => Promise<void>;
  /** Detach a book from a character (idempotent — `detached:false` when already absent). */
  readonly detachFromCharacter: (params: DetachFromCharacterParams) => Promise<DetachResult>;
  /** The books attached to an owned character, primary first then newest. Carries the per-attachment role. */
  readonly listForCharacter: (params: ListForCharacterParams) => Promise<BookAttachmentView[]>;

  // ── Attachments — global (deployment scope; owner-gated via the book) ─────────
  /** Mark an owned book global (fires for every chat). Gate is plain book ownership. Idempotent. */
  readonly attachGlobal: (params: AttachGlobalParams) => Promise<void>;
  /** Un-mark an owned book global (idempotent — `detached:false` when not global). */
  readonly detachGlobal: (params: DetachGlobalParams) => Promise<DetachResult>;
  /** The caller's global books, newest first (owner-scoped via the book). `role` is null. */
  readonly listGlobal: (params: ListGlobalParams) => Promise<BookAttachmentView[]>;

  // ── Attachments — persona ────────────────────────────────────────────────────
  /** Attach an owned book to an owned persona (idempotent on the composite key). */
  readonly attachToPersona: (params: AttachToPersonaParams) => Promise<void>;
  /** Detach a book from a persona (idempotent — `detached:false` when already absent). */
  readonly detachFromPersona: (params: DetachFromPersonaParams) => Promise<DetachResult>;
  /** The books attached to an owned persona, newest first. `role` is null. */
  readonly listForPersona: (params: ListForPersonaParams) => Promise<BookAttachmentView[]>;
}
