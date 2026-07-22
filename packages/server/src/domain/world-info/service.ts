// domain/world-info — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The world-info
// store: world books + their keyword-triggered lore entries, attached at FOUR scopes (character / global /
// persona / chat) for the per-turn chat pool to union. `WorldInfoContext` is assembled at the entry root
// (db + injected clock/id + db-bound `audit` + the PD-30 chat seams: the `requireChatHost`/
// `requireChatMember` guards wired from chat's own guard module and `emitWiEvent` wired to the chat bus's
// durable-first emit) and passed in. Every non-chat surface is ownership-scoped off `principal.userId`
// (a book via `worldBooks.ownerId`, an entry via its book, an attachment target via its own owner column);
// the chat scope is MEMBERSHIP-scoped (D18) through the injected guards (contract/service.ts header).

import type { WorldInfoContext } from "./context";
import type { WorldInfoService } from "./contract/service";
import {
  createAttachGlobal,
  createAttachToCharacter,
  createAttachToChat,
  createAttachToPersona,
  createDetachFromCharacter,
  createDetachFromChat,
  createDetachFromPersona,
  createDetachGlobal,
  createListForCharacter,
  createListForChat,
  createListForPersona,
  createListGlobal,
} from "./verbs/attachments";
import { createCreateBook, createDuplicateBook, createGetBook, createListBooks, createRemoveBook, createUpdateBook } from "./verbs/books";
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
} from "./verbs/entries";

export function createWorldInfoService(ctx: WorldInfoContext): WorldInfoService {
  return {
    listBooks: createListBooks(ctx),
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
