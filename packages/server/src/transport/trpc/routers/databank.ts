// transport/trpc/routers/databank — the source-document producer + scope-junction surface (Tier-4-Transport).
// authed; owner-scoped. Thin: validate → `ctx.services.databank.<verb>` → the global error-mapping maps
// DocumentNotFoundError → NOT_FOUND. Input shapes (origin/reindex axes) derive from `@orb/contracts/databank`.
//
// `upload` is NOT here: it takes raw bytes, so it rides the `POST /api/databank/upload` multipart route
// (entry/http/upload.ts) — the PD-136 doc-ingest façade. `scrapeWeb` (DB7) IS here — it takes a url string, not
// bytes; the fetch rides the compose-bound ANY_HOST safeFetch guard, a refused/failed fetch surfaces as a
// leak-free BAD_REQUEST (`ScrapeFailedError`). The chat GATHER op + the search.documents lens are later waves
// (DB5/DB6). The character-scope attach/detach verbs are DB8 (owner-gated on BOTH sides).

import { docOriginSchema, documentListCursorSchema, ingestPhaseSchema, reindexModeSchema, reindexScopeSchema } from "@orb/contracts/databank";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
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
    .input(z.object({ id: typeIdSchema(ID_PREFIX.document), includeText: z.boolean().optional() }))
    .query(({ ctx, input }) =>
      ctx.services.databank.get({ principal: ctx.auth, id: input.id, ...(input.includeText !== undefined ? { includeText: input.includeText } : {}) }),
    ),

  // Keyset-paged, and EVERY lens is an input here (owner ruling 2026-08-13 — a paged list's filters are the
  // server's, or they are a claim about rows the client never fetched). `cursor` rides as ONE field because
  // tRPC's `infiniteQueryOptions` threads exactly one `cursor` input through as the page param, overwriting
  // it wholesale per next-page fetch (the `character.list` shape); `search`/`phase`/`origin`/`limit` are
  // separate top-level inputs, so changing a lens RESETS the infinite query's pages rather than mixing
  // keysets. `.nullish()` on the cursor because the client seeds the first page with `initialCursor: null`.
  list: authedProcedure
    .input(
      z.object({
        origin: docOriginSchema.optional(),
        // Bounded like every other free-text lens: a needle longer than the longest storable name can only
        // match nothing, and an unbounded `like` argument is a request-size hole.
        search: z.string().max(NAME_MAX).optional(),
        phase: ingestPhaseSchema.optional(),
        limit: z.number().int().min(LIMIT_MIN).max(LIMIT_MAX).optional(),
        cursor: documentListCursorSchema.nullish(),
      }),
    )
    .query(({ ctx, input }) =>
      ctx.services.databank.list({
        principal: ctx.auth,
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.search !== undefined ? { search: input.search } : {}),
        ...(input.phase !== undefined ? { phase: input.phase } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined && input.cursor !== null ? { cursor: input.cursor } : {}),
      }),
    ),

  // The home tile's D-7 census (owner-wide counts + passage sums). Its own read, never a field on `list`:
  // resolving it costs a bank-wide chunk read that the paging library must not pay per page (verbs/bank-health.ts).
  bankHealth: authedProcedure.query(({ ctx }) => ctx.services.databank.bankHealth({ principal: ctx.auth })),

  rename: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.document), name: z.string().min(1).max(NAME_MAX) }))
    .mutation(({ ctx, input }) => ctx.services.databank.rename({ principal: ctx.auth, id: input.id, name: input.name })),

  remove: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.document) }))
    .mutation(({ ctx, input }) => ctx.services.databank.remove({ principal: ctx.auth, id: input.id })),

  reindex: authedProcedure
    .input(z.object({ scope: reindexScopeSchema, mode: reindexModeSchema.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.databank.reindex({ principal: ctx.auth, scope: input.scope, ...(input.mode !== undefined ? { mode: input.mode } : {}) }),
    ),

  attachGlobal: authedProcedure
    .input(z.object({ documentId: typeIdSchema(ID_PREFIX.document) }))
    .mutation(({ ctx, input }) => ctx.services.databank.attachGlobal({ principal: ctx.auth, documentId: input.documentId })),

  detachGlobal: authedProcedure
    .input(z.object({ documentId: typeIdSchema(ID_PREFIX.document) }))
    .mutation(({ ctx, input }) => ctx.services.databank.detachGlobal({ principal: ctx.auth, documentId: input.documentId })),

  // D-1 (databank-surface-spec.md): the library row's `Everywhere` state as ONE read — the `worldInfo.listGlobal`
  // twin. Without it the row toggle's only source is a `listAttachments` per row (legacy's N+1).
  listGlobal: authedProcedure.query(({ ctx }) => ctx.services.databank.listGlobal({ principal: ctx.auth })),

  attachToChat: authedProcedure
    .input(z.object({ documentId: typeIdSchema(ID_PREFIX.document), chatId: typeIdSchema(ID_PREFIX.chat) }))
    .mutation(({ ctx, input }) => ctx.services.databank.attachToChat({ principal: ctx.auth, documentId: input.documentId, chatId: input.chatId })),

  detachFromChat: authedProcedure
    .input(z.object({ documentId: typeIdSchema(ID_PREFIX.document), chatId: typeIdSchema(ID_PREFIX.chat) }))
    .mutation(({ ctx, input }) => ctx.services.databank.detachFromChat({ principal: ctx.auth, documentId: input.documentId, chatId: input.chatId })),

  attachToCharacter: authedProcedure
    .input(z.object({ documentId: typeIdSchema(ID_PREFIX.document), characterId: typeIdSchema(ID_PREFIX.character) }))
    .mutation(({ ctx, input }) =>
      ctx.services.databank.attachToCharacter({ principal: ctx.auth, documentId: input.documentId, characterId: input.characterId }),
    ),

  detachFromCharacter: authedProcedure
    .input(z.object({ documentId: typeIdSchema(ID_PREFIX.document), characterId: typeIdSchema(ID_PREFIX.character) }))
    .mutation(({ ctx, input }) =>
      ctx.services.databank.detachFromCharacter({ principal: ctx.auth, documentId: input.documentId, characterId: input.characterId }),
    ),

  listAttachments: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.document) }))
    .query(({ ctx, input }) => ctx.services.databank.listAttachments({ principal: ctx.auth, id: input.id })),

  listActiveForChat: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .query(({ ctx, input }) => ctx.services.databank.listActiveForChat({ principal: ctx.auth, chatId: input.chatId })),
});
