// Finite owner library projections preserve native scopes and named stages; private rows and files never enter.
import { regexScriptUsageSchema, regexScriptViewSchema } from "@orb/contracts/regex";
import {
  bookAttachmentTargetsSchema,
  bookAttachmentViewSchema,
  bookViewSchema,
  bookWithUsageSchema,
  chatBookViewSchema,
  entryViewSchema,
} from "@orb/contracts/world-info";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { CorpusRead } from "./corpus-read.ts";

export const worldInfoLibrarySchema = z
  .strictObject({
    viewerUserId: brandedId<UserId>(),
    ids: z.strictObject({
      libraryBookId: typeIdSchema(ID_PREFIX.worldBook),
      orderedBookId: typeIdSchema(ID_PREFIX.worldBook),
      entryId: typeIdSchema(ID_PREFIX.worldEntry),
      demotedCharacterId: typeIdSchema(ID_PREFIX.character),
      characterId: typeIdSchema(ID_PREFIX.character),
      personaId: typeIdSchema(ID_PREFIX.persona),
      chatId: typeIdSchema(ID_PREFIX.chat),
    }),
    reads: z.strictObject({
      orderedEntries: entryViewSchema.array(),
      demoted: bookAttachmentViewSchema.array(),
      books: bookViewSchema.array(),
      detail: bookViewSchema,
      usage: bookWithUsageSchema.array(),
      targets: bookAttachmentTargetsSchema,
      entry: entryViewSchema,
      characterBooks: bookAttachmentViewSchema.array(),
      personaBooks: bookAttachmentViewSchema.array(),
      globalBooks: bookAttachmentViewSchema.array(),
      chatBooks: chatBookViewSchema.array(),
      inheritedBooks: chatBookViewSchema.array(),
    }),
  })
  .refine(
    ({ ids, reads }) =>
      reads.detail.id === ids.libraryBookId &&
      reads.entry.id === ids.entryId &&
      reads.entry.worldBookId === ids.orderedBookId &&
      reads.orderedEntries.every((entry) => entry.worldBookId === ids.orderedBookId),
    "Corpus world-info identity mismatch",
  );

export const regexLibrarySchema = z.strictObject({
  viewerUserId: brandedId<UserId>(),
  ids: z.strictObject({
    scriptId: typeIdSchema(ID_PREFIX.regexScript),
    characterId: typeIdSchema(ID_PREFIX.character),
    presetId: typeIdSchema(ID_PREFIX.preset),
    chatId: typeIdSchema(ID_PREFIX.chat),
  }),
  reads: z.strictObject({
    before: regexScriptViewSchema.array(),
    after: regexScriptViewSchema.array(),
    displayOff: regexScriptViewSchema.array(),
    displayOn: regexScriptViewSchema.array(),
    list: regexScriptViewSchema.array(),
    usage: regexScriptUsageSchema,
    global: regexScriptViewSchema.array(),
    character: regexScriptViewSchema.array(),
    preset: regexScriptViewSchema.array(),
  }),
});

export interface CorpusWorldInfoLibrary extends Omit<z.output<typeof worldInfoLibrarySchema>, "reads"> {
  readonly reads: {
    readonly orderedEntries: CorpusRead<"worldInfo.listEntries">;
    readonly demoted: CorpusRead<"worldInfo.listForCharacter">;
    readonly books: CorpusRead<"worldInfo.listBooks">;
    readonly detail: CorpusRead<"worldInfo.getBook">;
    readonly usage: CorpusRead<"worldInfo.listBooksWithUsage">;
    readonly targets: CorpusRead<"worldInfo.listAttachmentsForBook">;
    readonly entry: CorpusRead<"worldInfo.getEntry">;
    readonly characterBooks: CorpusRead<"worldInfo.listForCharacter">;
    readonly personaBooks: CorpusRead<"worldInfo.listForPersona">;
    readonly globalBooks: CorpusRead<"worldInfo.listGlobal">;
    readonly chatBooks: CorpusRead<"worldInfo.listForChat">;
    readonly inheritedBooks: CorpusRead<"worldInfo.listForChat">;
  };
}

/** Select only the named native DTOs; exact captured inputs remain available for publication comparison. */
export function publishWorldInfoLibrary(section: CorpusWorldInfoLibrary): z.output<typeof worldInfoLibrarySchema> {
  return worldInfoLibrarySchema.parse({
    viewerUserId: section.viewerUserId,
    ids: section.ids,
    reads: {
      orderedEntries: section.reads.orderedEntries.output,
      demoted: section.reads.demoted.output,
      books: section.reads.books.output,
      detail: section.reads.detail.output,
      usage: section.reads.usage.output,
      targets: section.reads.targets.output,
      entry: section.reads.entry.output,
      characterBooks: section.reads.characterBooks.output,
      personaBooks: section.reads.personaBooks.output,
      globalBooks: section.reads.globalBooks.output,
      chatBooks: section.reads.chatBooks.output,
      inheritedBooks: section.reads.inheritedBooks.output,
    },
  });
}

/** Reconstruct only this finite recipe; the serializer compares against each original captured request. */
export function hydrateWorldInfoLibrary(section: z.output<typeof worldInfoLibrarySchema>): CorpusWorldInfoLibrary {
  const { ids } = section;
  return {
    viewerUserId: section.viewerUserId,
    ids,
    reads: {
      orderedEntries: { input: { bookId: ids.orderedBookId }, output: section.reads.orderedEntries },
      demoted: { input: { characterId: ids.demotedCharacterId }, output: section.reads.demoted },
      books: { input: undefined, output: section.reads.books },
      detail: { input: { bookId: ids.libraryBookId }, output: section.reads.detail },
      usage: { input: undefined, output: section.reads.usage },
      targets: { input: { bookId: ids.libraryBookId }, output: section.reads.targets },
      entry: { input: { entryId: ids.entryId }, output: section.reads.entry },
      characterBooks: { input: { characterId: ids.characterId }, output: section.reads.characterBooks },
      personaBooks: { input: { personaId: ids.personaId }, output: section.reads.personaBooks },
      globalBooks: { input: undefined, output: section.reads.globalBooks },
      chatBooks: { input: { chatId: ids.chatId }, output: section.reads.chatBooks },
      inheritedBooks: { input: { chatId: ids.chatId, includeInherited: true }, output: section.reads.inheritedBooks },
    },
  };
}

export interface CorpusRegexLibrary extends Omit<z.output<typeof regexLibrarySchema>, "reads"> {
  readonly reads: {
    readonly before: CorpusRead<"regex.listForChat">;
    readonly after: CorpusRead<"regex.listForChat">;
    readonly displayOff: CorpusRead<"regex.listRoomDisplayScripts">;
    readonly displayOn: CorpusRead<"regex.listRoomDisplayScripts">;
    readonly list: CorpusRead<"regex.listScripts">;
    readonly usage: CorpusRead<"regex.listScriptUsage">;
    readonly global: CorpusRead<"regex.listGlobal">;
    readonly character: CorpusRead<"regex.listForCharacter">;
    readonly preset: CorpusRead<"regex.listForPreset">;
  };
}

/** Select only the named native DTOs; exact captured inputs remain available for publication comparison. */
export function publishRegexLibrary(section: CorpusRegexLibrary): z.output<typeof regexLibrarySchema> {
  return regexLibrarySchema.parse({
    viewerUserId: section.viewerUserId,
    ids: section.ids,
    reads: {
      before: section.reads.before.output,
      after: section.reads.after.output,
      displayOff: section.reads.displayOff.output,
      displayOn: section.reads.displayOn.output,
      list: section.reads.list.output,
      usage: section.reads.usage.output,
      global: section.reads.global.output,
      character: section.reads.character.output,
      preset: section.reads.preset.output,
    },
  });
}

/** Reconstruct only this finite recipe; the serializer compares against each original captured request. */
export function hydrateRegexLibrary(section: z.output<typeof regexLibrarySchema>): CorpusRegexLibrary {
  const { ids } = section;
  return {
    viewerUserId: section.viewerUserId,
    ids,
    reads: {
      before: { input: { chatId: ids.chatId }, output: section.reads.before },
      after: { input: { chatId: ids.chatId }, output: section.reads.after },
      displayOff: { input: { chatId: ids.chatId }, output: section.reads.displayOff },
      displayOn: { input: { chatId: ids.chatId }, output: section.reads.displayOn },
      list: { input: undefined, output: section.reads.list },
      usage: { input: { scriptId: ids.scriptId }, output: section.reads.usage },
      global: { input: undefined, output: section.reads.global },
      character: { input: { characterId: ids.characterId }, output: section.reads.character },
      preset: { input: { presetId: ids.presetId }, output: section.reads.preset },
    },
  };
}
