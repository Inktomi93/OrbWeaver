// domain/world-info — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The world-info
// store: world books + their keyword-triggered lore entries, attached at three scopes (character / global /
// persona) for the per-turn chat pool to union. `WorldInfoContext` is assembled at the entry root (db +
// injected clock/id + db-bound `audit`) and passed in; world-info injects NO guard + NO cross-feature op —
// every surface is ownership-scoped off `principal.userId` (a book via `worldBooks.ownerId`, an entry via
// its book, an attachment target via its own owner column).
//
// DEFERRED — the CHAT attachment scope (`attachToChat`/`detachFromChat`/`listForChat` + the `WiBusEvent`
// emit). NOT wired here: chats are membership-scoped (D18 — no `chats.ownerId`), so the authority is the
// host participant via the `can({ kind: 'chat', roster })` resource arm, which is explicitly NOT built yet
// (admin contract/guard.ts FLAG[PD-1]: `ResourceRef = GlobalResource` only — the chat-resource `can()` call
// doesn't even type-check today). The emit rides the chat bus (`ChatBusEvent`), a Phase-5 chat concern.
// Wiring either now would collapse the chat tier into world-info. Mirrors persona's `setActivePersona`
// deferral. FLAG[PD-30]: chat-scope attach/detach/list + WiBusEvent emit → here when the
// `can({kind:'chat',roster})` resource arm + the chat bus exist (Phase 5 chat build). See contract/service.ts.

import type { WorldInfoContext, WorldInfoService } from "./contract/service";
import {
  createAttachGlobal,
  createAttachToCharacter,
  createAttachToPersona,
  createDetachFromCharacter,
  createDetachFromPersona,
  createDetachGlobal,
  createListForCharacter,
  createListForPersona,
  createListGlobal,
} from "./verbs/attachments";
import {
  createCreateBook,
  createDuplicateBook,
  createGetBook,
  createListBooks,
  createRemoveBook,
  createUpdateBook,
} from "./verbs/books";
import {
  createApplyEntryOrder,
  createBackfillTitles,
  createCreateEntry,
  createGetEntry,
  createListEntries,
  createRemoveEntry,
  createUpdateEntry,
} from "./verbs/entries";

export function createWorldInfoService(ctx: WorldInfoContext): WorldInfoService {
  return {
    // Books
    listBooks: createListBooks(ctx),
    getBook: createGetBook(ctx),
    createBook: createCreateBook(ctx),
    updateBook: createUpdateBook(ctx),
    removeBook: createRemoveBook(ctx),
    duplicateBook: createDuplicateBook(ctx),
    // Entries
    listEntries: createListEntries(ctx),
    getEntry: createGetEntry(ctx),
    createEntry: createCreateEntry(ctx),
    updateEntry: createUpdateEntry(ctx),
    removeEntry: createRemoveEntry(ctx),
    backfillTitles: createBackfillTitles(ctx),
    applyEntryOrder: createApplyEntryOrder(ctx),
    // Attachments — character
    attachToCharacter: createAttachToCharacter(ctx),
    detachFromCharacter: createDetachFromCharacter(ctx),
    listForCharacter: createListForCharacter(ctx),
    // Attachments — global
    attachGlobal: createAttachGlobal(ctx),
    detachGlobal: createDetachGlobal(ctx),
    listGlobal: createListGlobal(ctx),
    // Attachments — persona
    attachToPersona: createAttachToPersona(ctx),
    detachFromPersona: createDetachFromPersona(ctx),
    listForPersona: createListForPersona(ctx),
  };
}
