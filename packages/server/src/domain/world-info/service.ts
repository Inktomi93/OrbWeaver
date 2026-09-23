// domain/world-info — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The world-info
// store: world books + their keyword-triggered lore entries, attached at FOUR scopes (character / global /
// persona / chat) for the per-turn chat pool to union. `WorldInfoContext` is assembled at the entry root
// (db + injected clock/id + db-bound `audit` + the chat seams: the `requireChatHost`/
// `requireChatMember` guards wired from chat's own guard module and `emitWiEvent` wired to the chat bus's
// durable-first emit) and passed in. Every non-chat surface is ownership-scoped off `principal.userId`
// (a book via `worldBooks.ownerId`, an entry via its book, an attachment target via its own owner column);
// the chat scope is MEMBERSHIP-scoped (D18) through the injected guards (contract/service.ts header).

import type { WorldInfoContext } from "./context.ts";
import type { WorldInfoService } from "./contract/service.ts";
import { createImportStandaloneLorebook } from "./persistence/import-write.ts";
import {
  createAttachGlobal,
  createAttachToCharacter,
  createAttachToChat,
  createAttachToPersona,
  createDetachFromCharacter,
  createDetachFromChat,
  createDetachFromPersona,
  createDetachGlobal,
  createListAttachmentsForBook,
  createListForCharacter,
  createListForChat,
  createListForPersona,
  createListGlobal,
} from "./verbs/attachments/index.ts";
import {
  createCreateBook,
  createDuplicateBook,
  createGetBook,
  createListBooks,
  createListBooksWithUsage,
  createRemoveBook,
  createUpdateBook,
} from "./verbs/books/index.ts";
import {
  createBackfillTitles,
  createCreateEntry,
  createGetEntry,
  createListConstantCanon,
  createListEntries,
  createListEntryIndex,
  createRemoveEntry,
  createReorder,
  createUpdateEntry,
  createUpsertEntries,
} from "./verbs/entries/index.ts";
import { createExport } from "./verbs/export.ts";
import { createImport } from "./verbs/import.ts";

export function createWorldInfoService(ctx: WorldInfoContext): WorldInfoService {
  // The two single-book DOORS are thin arms over the SAME two verbs the bundle descriptor composes (the
  // ratified thin-arm law): one producer, one parser, so a book shared one-at-a-time and a book inside a
  // backup zip can never diverge. Both factories are pure over this same DI bundle.
  const exportBook = createExport(ctx);
  const importBook = createImport({ importStandalone: createImportStandaloneLorebook(ctx) });
  return {
    exportBook: ({ principal, bookId }) => exportBook({ ownerId: principal.userId, bookId }),
    importFile: ({ principal, fileText }) => importBook({ ownerId: principal.userId, bytes: new TextEncoder().encode(fileText) }),
    listBooks: createListBooks(ctx),
    listBooksWithUsage: createListBooksWithUsage(ctx),
    getBook: createGetBook(ctx),
    createBook: createCreateBook(ctx),
    updateBook: createUpdateBook(ctx),
    removeBook: createRemoveBook(ctx),
    duplicateBook: createDuplicateBook(ctx),
    listEntries: createListEntries(ctx),
    getEntry: createGetEntry(ctx),
    createEntry: createCreateEntry(ctx),
    updateEntry: createUpdateEntry(ctx),
    removeEntry: createRemoveEntry(ctx),
    backfillTitles: createBackfillTitles(ctx),
    applyEntryOrder: createReorder(ctx),
    attachToCharacter: createAttachToCharacter(ctx),
    detachFromCharacter: createDetachFromCharacter(ctx),
    listForCharacter: createListForCharacter(ctx),
    listAttachmentsForBook: createListAttachmentsForBook(ctx),
    attachGlobal: createAttachGlobal(ctx),
    detachGlobal: createDetachGlobal(ctx),
    listGlobal: createListGlobal(ctx),
    attachToPersona: createAttachToPersona(ctx),
    detachFromPersona: createDetachFromPersona(ctx),
    listForPersona: createListForPersona(ctx),
    attachToChat: createAttachToChat(ctx),
    detachFromChat: createDetachFromChat(ctx),
    listForChat: createListForChat(ctx),
    upsertEntries: createUpsertEntries(ctx),
    listEntryIndex: createListEntryIndex(ctx),
    listConstantCanon: createListConstantCanon(ctx),
  };
}
