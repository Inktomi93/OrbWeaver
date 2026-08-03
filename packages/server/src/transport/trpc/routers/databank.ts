// transport/trpc/routers/databank — the source-document producer + scope-junction surface (Tier-4-Transport).
// authed; owner-scoped. Thin: validate → `ctx.services.databank.<verb>` → the global error-mapping maps
// DocumentNotFoundError → NOT_FOUND. Input shapes (origin/reindex axes) derive from `@orb/contracts/databank`.
//
// `upload` is NOT here: it takes raw bytes, so it rides the `POST /api/databank/upload` multipart route
// (entry/http/upload.ts) — the PD-136 doc-ingest façade. `scrapeWeb` (DB7) IS here — it takes a url string, not
// bytes; the fetch rides the compose-bound ANY_HOST safeFetch guard, a refused/failed fetch surfaces as a
// leak-free BAD_REQUEST (`ScrapeFailedError`). The chat GATHER op + the search.documents lens are later waves
// (DB5/DB6). The character-scope attach/detach verbs are DB8 (owner-gated on BOTH sides).

import { docOriginSchema, reindexModeSchema, reindexScopeSchema } from "@orb/contracts/databank";
import type { CharacterId, ChatId, DocumentId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

const NAME_MAX = 500;
const TEXT_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 500;

export const databankRouter = t.router({
  createFromText: authedProcedure
    .input(z.object({ name: z.string().min(1).max(NAME_MAX), text: z.string().min(TEXT_MIN) }))
    .mutation(({ ctx, input }) => ctx.services.databank.createFromText({ principal: ctx.auth, name: input.name, text: input.text })),

  scrapeWeb: authedProcedure
    .input(z.object({ url: z.url() }))
    .mutation(({ ctx, input }) => ctx.services.databank.scrapeWeb({ principal: ctx.auth, url: input.url })),

  scrapeYoutube: authedProcedure
    .input(z.object({ url: z.url(), lang: z.string().default("en") }))
    .mutation(({ ctx, input }) => ctx.services.databank.scrapeYoutube({ principal: ctx.auth, url: input.url, lang: input.lang })),

  scrapeWiki: authedProcedure
    .input(z.object({ url: z.url() }))
    .mutation(({ ctx, input }) => ctx.services.databank.scrapeWiki({ principal: ctx.auth, url: input.url })),

  get: authedProcedure
    .input(z.object({ id: brandedId<DocumentId>(), includeText: z.boolean().optional() }))
    .query(({ ctx, input }) =>
      ctx.services.databank.get({ principal: ctx.auth, id: input.id, ...(input.includeText !== undefined ? { includeText: input.includeText } : {}) }),
    ),

  list: authedProcedure
    .input(
      z.object({
        origin: docOriginSchema.optional(),
        limit: z.number().int().min(LIMIT_MIN).max(LIMIT_MAX).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.databank.list({
        principal: ctx.auth,
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      }),
    ),

  rename: authedProcedure
    .input(z.object({ id: brandedId<DocumentId>(), name: z.string().min(1).max(NAME_MAX) }))
    .mutation(({ ctx, input }) => ctx.services.databank.rename({ principal: ctx.auth, id: input.id, name: input.name })),

  remove: authedProcedure
    .input(z.object({ id: brandedId<DocumentId>() }))
    .mutation(({ ctx, input }) => ctx.services.databank.remove({ principal: ctx.auth, id: input.id })),

  reindex: authedProcedure
    .input(z.object({ scope: reindexScopeSchema, mode: reindexModeSchema.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.databank.reindex({ principal: ctx.auth, scope: input.scope, ...(input.mode !== undefined ? { mode: input.mode } : {}) }),
    ),

  attachGlobal: authedProcedure
    .input(z.object({ documentId: brandedId<DocumentId>() }))
    .mutation(({ ctx, input }) => ctx.services.databank.attachGlobal({ principal: ctx.auth, documentId: input.documentId })),

  detachGlobal: authedProcedure
    .input(z.object({ documentId: brandedId<DocumentId>() }))
    .mutation(({ ctx, input }) => ctx.services.databank.detachGlobal({ principal: ctx.auth, documentId: input.documentId })),

  // D-1 (databank-surface-spec.md): the library row's `Everywhere` state as ONE read — the `worldInfo.listGlobal`
  // twin. Without it the row toggle's only source is a `listAttachments` per row (legacy's N+1).
  listGlobal: authedProcedure.query(({ ctx }) => ctx.services.databank.listGlobal({ principal: ctx.auth })),

  attachToChat: authedProcedure
    .input(z.object({ documentId: brandedId<DocumentId>(), chatId: brandedId<ChatId>() }))
    .mutation(({ ctx, input }) => ctx.services.databank.attachToChat({ principal: ctx.auth, documentId: input.documentId, chatId: input.chatId })),

  detachFromChat: authedProcedure
    .input(z.object({ documentId: brandedId<DocumentId>(), chatId: brandedId<ChatId>() }))
    .mutation(({ ctx, input }) => ctx.services.databank.detachFromChat({ principal: ctx.auth, documentId: input.documentId, chatId: input.chatId })),

  attachToCharacter: authedProcedure
    .input(z.object({ documentId: brandedId<DocumentId>(), characterId: brandedId<CharacterId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.databank.attachToCharacter({ principal: ctx.auth, documentId: input.documentId, characterId: input.characterId }),
    ),

  detachFromCharacter: authedProcedure
    .input(z.object({ documentId: brandedId<DocumentId>(), characterId: brandedId<CharacterId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.databank.detachFromCharacter({ principal: ctx.auth, documentId: input.documentId, characterId: input.characterId }),
    ),

  listAttachments: authedProcedure
    .input(z.object({ id: brandedId<DocumentId>() }))
    .query(({ ctx, input }) => ctx.services.databank.listAttachments({ principal: ctx.auth, id: input.id })),

  listActiveForChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.databank.listActiveForChat({ principal: ctx.auth, chatId: input.chatId })),
});
