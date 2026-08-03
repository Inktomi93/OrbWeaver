// transport/trpc/routers/world-info — the books/entries + scope-junction surface (core/Tier-4-Transport.md).
// authed; owner-scoped. Thin: validate → `ctx.services.worldInfo.<verb>` → map errors. Input shapes + the
// `role` axis derive from `@orb/contracts/world-info`. The chat-attachment scope is MEMBERSHIP-scoped (D18):
// the verb's own injected chat guard rules — attach/detach are host-gated (room-wide prompt content), list is
// member-readable (the room's shared pool).

import { createBookSchema, createEntrySchema, updateBookSchema, updateEntrySchema, worldBookRoleSchema } from "@orb/contracts/world-info";
import type { CharacterId, ChatId, PersonaId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

// A lorebook is the biggest orb-native JSON artifact people share; the cap only fences a hostile upload.
const MAX_BOOK_FILE_CHARS = 8_000_000;
const DEC = new TextDecoder();

export const worldInfoRouter = t.router({
  listBooks: authedProcedure.query(({ ctx }) => ctx.services.worldInfo.listBooks({ principal: ctx.auth })),

  /** The Configuration roster read — the same owned books plus entry count + attachment rollup. */
  listBooksWithUsage: authedProcedure.query(({ ctx }) => ctx.services.worldInfo.listBooksWithUsage({ principal: ctx.auth })),

  getBook: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .query(({ ctx, input }) => ctx.services.worldInfo.getBook({ principal: ctx.auth, bookId: input.bookId })),

  createBook: authedProcedure
    .input(z.object({ input: createBookSchema }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.createBook({ principal: ctx.auth, input: input.input })),

  updateBook: authedProcedure.input(z.object({ bookId: brandedId<WorldBookId>(), input: updateBookSchema })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.updateBook({
      principal: ctx.auth,
      bookId: input.bookId,
      input: input.input,
    }),
  ),

  removeBook: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.removeBook({ principal: ctx.auth, bookId: input.bookId })),

  duplicateBook: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.duplicateBook({ principal: ctx.auth, bookId: input.bookId })),

  // The two single-book DOORS (F2 — the verbs shipped with none, so sharing one lorebook required a full
  // library-zip round-trip). Both are thin arms over the bundle descriptor's own verbs.
  exportBook: authedProcedure.input(z.object({ bookId: brandedId<WorldBookId>() })).query(async ({ ctx, input }) => {
    const file = await ctx.services.worldInfo.exportBook({ principal: ctx.auth, bookId: input.bookId });
    if (file === null) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That world-info book doesn't exist." });
    }
    return { filename: file.filename, fileText: DEC.decode(file.bytes) };
  }),

  importFile: authedProcedure.input(z.object({ fileText: z.string().max(MAX_BOOK_FILE_CHARS) })).mutation(async ({ ctx, input }) => {
    const outcome = await ctx.services.worldInfo.importFile({ principal: ctx.auth, fileText: input.fileText });
    if (!outcome.ok) {
      // The refusal REASON reaches the user as words — a book written by a newer orbweaver no longer reads
      // as "not a valid file". The import dialog renders this message.
      throw new TRPCError({ code: "BAD_REQUEST", message: outcome.error ?? "That file isn't a valid world-info book." });
    }
    return { created: outcome.created === true };
  }),

  listEntries: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .query(({ ctx, input }) => ctx.services.worldInfo.listEntries({ principal: ctx.auth, bookId: input.bookId })),

  getEntry: authedProcedure
    .input(z.object({ entryId: brandedId<WorldEntryId>() }))
    .query(({ ctx, input }) => ctx.services.worldInfo.getEntry({ principal: ctx.auth, entryId: input.entryId })),

  createEntry: authedProcedure.input(z.object({ bookId: brandedId<WorldBookId>(), input: createEntrySchema })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.createEntry({
      principal: ctx.auth,
      bookId: input.bookId,
      input: input.input,
    }),
  ),

  updateEntry: authedProcedure.input(z.object({ entryId: brandedId<WorldEntryId>(), input: updateEntrySchema })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.updateEntry({
      principal: ctx.auth,
      entryId: input.entryId,
      input: input.input,
    }),
  ),

  removeEntry: authedProcedure
    .input(z.object({ entryId: brandedId<WorldEntryId>() }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.removeEntry({ principal: ctx.auth, entryId: input.entryId })),

  backfillTitles: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.backfillTitles({ principal: ctx.auth, bookId: input.bookId })),

  applyEntryOrder: authedProcedure
    .input(
      z.object({
        bookId: brandedId<WorldBookId>(),
        orderedEntryIds: z.array(brandedId<WorldEntryId>()),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.worldInfo.applyEntryOrder({
        principal: ctx.auth,
        bookId: input.bookId,
        orderedEntryIds: input.orderedEntryIds,
      }),
    ),

  attachToCharacter: authedProcedure
    .input(
      z.object({
        characterId: brandedId<CharacterId>(),
        bookId: brandedId<WorldBookId>(),
        role: worldBookRoleSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.worldInfo.attachToCharacter({
        principal: ctx.auth,
        characterId: input.characterId,
        bookId: input.bookId,
        role: input.role,
      }),
    ),

  detachFromCharacter: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>(), bookId: brandedId<WorldBookId>() })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.detachFromCharacter({
      principal: ctx.auth,
      characterId: input.characterId,
      bookId: input.bookId,
    }),
  ),

  listForCharacter: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>() })).query(({ ctx, input }) =>
    ctx.services.worldInfo.listForCharacter({
      principal: ctx.auth,
      characterId: input.characterId,
    }),
  ),

  attachGlobal: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.attachGlobal({ principal: ctx.auth, bookId: input.bookId })),

  detachGlobal: authedProcedure
    .input(z.object({ bookId: brandedId<WorldBookId>() }))
    .mutation(({ ctx, input }) => ctx.services.worldInfo.detachGlobal({ principal: ctx.auth, bookId: input.bookId })),

  listGlobal: authedProcedure.query(({ ctx }) => ctx.services.worldInfo.listGlobal({ principal: ctx.auth })),

  attachToPersona: authedProcedure.input(z.object({ personaId: brandedId<PersonaId>(), bookId: brandedId<WorldBookId>() })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.attachToPersona({
      principal: ctx.auth,
      personaId: input.personaId,
      bookId: input.bookId,
    }),
  ),

  detachFromPersona: authedProcedure.input(z.object({ personaId: brandedId<PersonaId>(), bookId: brandedId<WorldBookId>() })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.detachFromPersona({
      principal: ctx.auth,
      personaId: input.personaId,
      bookId: input.bookId,
    }),
  ),

  listForPersona: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .query(({ ctx, input }) => ctx.services.worldInfo.listForPersona({ principal: ctx.auth, personaId: input.personaId })),

  attachToChat: authedProcedure.input(z.object({ chatId: brandedId<ChatId>(), bookId: brandedId<WorldBookId>() })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.attachToChat({
      principal: ctx.auth,
      chatId: input.chatId,
      bookId: input.bookId,
    }),
  ),

  detachFromChat: authedProcedure.input(z.object({ chatId: brandedId<ChatId>(), bookId: brandedId<WorldBookId>() })).mutation(({ ctx, input }) =>
    ctx.services.worldInfo.detachFromChat({
      principal: ctx.auth,
      chatId: input.chatId,
      bookId: input.bookId,
    }),
  ),

  listForChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.worldInfo.listForChat({ principal: ctx.auth, chatId: input.chatId })),
});
