// transport/trpc/routers/discovery — the read-side discovery analytics (core/Tier-4-Transport.md; the corpus→
// discovery rename). authed; reads take a positional `userId` = the resolved `Principal.userId` (audit #1:
// no caller-supplied owner). The `compute*` passes are workload-driven (the jobs runners), NOT tRPC. Thin:
// validate → `ctx.services.discovery.<verb>` → map errors. The `level` axis derives from `THEME_LEVELS`.
//
// "Map errors" is the domain-error MIDDLEWARE's job, never a procedure body: every read verb here refuses by
// RETURNING (null / []), and the one mutation (`suggestCharacterTags`) THROWS — `DomainNotFoundError` for a
// foreign/missing card (leak-free NOT_FOUND, the cross-tenant sweep's bar), `CardNotDistillableError` when
// the card is name-only (BAD_REQUEST + `data.reason: card_not_distillable`, which the editor's toast keys on
// — the caller's fix is to write the card, not to retry) and `DistillFailedError` when the summarizer
// produced nothing usable (SERVICE_UNAVAILABLE, retryable). `classifyDomainError` maps all three, and the
// content verdicts are ordered AFTER the ownership belt so neither is an existence oracle.

import { RELATIONS } from "@orb/contracts/discovery";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { BROWSE_SORTS, IMAGE_FACET_KEYS, THEME_LEVELS } from "#domain/discovery";
import { authedProcedure, t } from "../trpc";

export const discoveryRouter = t.router({
  // PD-40 write-half, on-demand: distill ONE owned character into `character_summaries` + staged `pending`
  // tag suggestions (the editor "Suggest tags" button). Owner-scoped — `ownerId` is the resolved principal
  // (audit #1: no caller-supplied owner), so a foreign/missing character is a no-op (never a cross-owner write).
  // The whole-library batch is the `distill-characters` workload (not tRPC). Returns the pass summary.
  suggestCharacterTags: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>() })).mutation(({ ctx, input }) =>
    ctx.services.discovery.distillCharacters({
      characterId: input.characterId,
      ownerId: ctx.auth.userId,
    }),
  ),

  duplicateCharacters: authedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().optional(),
          minScore: z.number().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.discovery.duplicateCharacters(ctx.auth.userId, {
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
        ...(input?.minScore !== undefined ? { minScore: input.minScore } : {}),
      }),
    ),

  // PD-40 chat near-dup arm: the owner's near-duplicate CHAT pairs (Jaccard + fork relation). Self-scoped.
  duplicateChats: authedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().optional(),
          minScore: z.number().optional(),
          relation: z.enum(RELATIONS).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.discovery.duplicateChats(ctx.auth.userId, {
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
        ...(input?.minScore !== undefined ? { minScore: input.minScore } : {}),
        ...(input?.relation !== undefined ? { relation: input.relation } : {}),
      }),
    ),

  // PD-40 distill read-half: the owner's filterable distilled catalog (CONTENT-only). `ownerId` is the
  // resolved principal (audit #1: no caller-supplied owner). The filter is validated + narrowed here.
  browseCharacters: authedProcedure
    .input(
      z
        .object({
          genre: z.string().optional(),
          tone: z.string().optional(),
          tag: z.string().optional(),
          q: z.string().optional(),
          sort: z.enum(BROWSE_SORTS).optional(),
          limit: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.discovery.browseCharacters(ctx.auth.userId, {
        ...(input?.genre !== undefined ? { genre: input.genre } : {}),
        ...(input?.tone !== undefined ? { tone: input.tone } : {}),
        ...(input?.tag !== undefined ? { tag: input.tag } : {}),
        ...(input?.q !== undefined ? { q: input.q } : {}),
        ...(input?.sort !== undefined ? { sort: input.sort } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  characterFacets: authedProcedure.query(({ ctx }) => ctx.services.discovery.characterFacets(ctx.auth.userId)),

  // PD-40 catalog: the distill-powered collection overview (CONTENT-only). Owner = resolved principal.
  catalog: authedProcedure.query(({ ctx }) => ctx.services.discovery.catalog(ctx.auth.userId)),

  // PD-40 compareCharacters: a two-card facet diff. Both ids are owner-belted (a foreign id → null).
  compareCharacters: authedProcedure
    .input(z.object({ idA: brandedId<CharacterId>(), idB: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.discovery.compareCharacters(ctx.auth.userId, input.idA, input.idB)),

  // PD-40 compareCharactersDeep: the facet diff PLUS a grounded LLM narrative. Both ids owner-belted (→ null).
  compareCharactersDeep: authedProcedure
    .input(z.object({ idA: brandedId<CharacterId>(), idB: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.discovery.compareCharactersDeep(ctx.auth.userId, input.idA, input.idB)),

  // PD-40 askCard: a grounded Q&A over ONE owned/distilled character's recent PLAYED scenes (CONTENT-only).
  // Owner-belted (a foreign/undistilled character → null). Owner = the resolved principal (audit #1).
  askCard: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), question: z.string().min(1) }))
    .query(({ ctx, input }) => ctx.services.discovery.askCard(ctx.auth.userId, input.characterId, input.question)),

  // PD-40 swipeHotspots: one chat's most-re-rolled assistant slots. Owner-belted via characters.ownerId (a
  // foreign chat → [], proved by the cross-tenant sweep probe). Owner = the resolved principal (audit #1).
  swipeHotspots: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>(), limit: z.number().int().positive().optional() }))
    .query(({ ctx, input }) => ctx.services.discovery.swipeHotspots(ctx.auth.userId, input.chatId, input.limit)),

  // PD-40 archetypes: k-means clusters of the owner's card embeddings, labelled from distilled facets.
  archetypes: authedProcedure.input(z.object({ k: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) =>
    ctx.services.discovery.archetypes(ctx.auth.userId, {
      ...(input?.k !== undefined ? { k: input.k } : {}),
    }),
  ),

  // PD-40 corpus galaxy: the owner's cards projected to 2D (PCA) — the semantic map.
  corpusProjection: authedProcedure.query(({ ctx }) => ctx.services.discovery.corpusProjection(ctx.auth.userId)),

  themes: authedProcedure
    .input(z.object({ level: z.enum(THEME_LEVELS).optional() }).optional())
    .query(({ ctx, input }) => ctx.services.discovery.themes(ctx.auth.userId, input?.level)),

  // PD-40 insights (pure-semantics half): story-time theme drift + never-played characters. Owner-scoped.
  themeDrift: authedProcedure
    .input(z.object({ level: z.enum(THEME_LEVELS).optional() }).optional())
    .query(({ ctx, input }) => ctx.services.discovery.themeDrift(ctx.auth.userId, input?.level)),

  unusedCharacters: authedProcedure.query(({ ctx }) => ctx.services.discovery.unusedCharacters(ctx.auth.userId)),

  // PD-22/PD-40 economics-composed insights (the stats↔discovery seam Tier 3). Owner = resolved principal
  // (audit #1); the economics arrive via the injected stats op (discovery reads no raw messages economics).
  forgottenGems: authedProcedure
    .input(z.object({ limit: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.discovery.forgottenGems(ctx.auth.userId, input?.limit)),

  modelRouting: authedProcedure.query(({ ctx }) => ctx.services.discovery.modelRouting(ctx.auth.userId)),

  // PD-40 image analytics (avatar-lens reads). Owner = resolved principal.
  imageDuplicates: authedProcedure
    .input(z.object({ threshold: z.number().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.discovery.imageDuplicates(ctx.auth.userId, input?.threshold)),

  visualArchetypes: authedProcedure
    .input(z.object({ k: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.discovery.visualArchetypes(ctx.auth.userId, input?.k)),

  portraitAlignment: authedProcedure.query(({ ctx }) => ctx.services.discovery.portraitAlignment(ctx.auth.userId)),

  imageFacets: authedProcedure.query(({ ctx }) => ctx.services.discovery.imageFacets(ctx.auth.userId)),

  charactersByImageFacet: authedProcedure
    .input(z.object({ facet: z.enum(IMAGE_FACET_KEYS), value: z.string() }))
    .query(({ ctx, input }) => ctx.services.discovery.charactersByImageFacet(ctx.auth.userId, input.facet, input.value)),

  // PD-40 similarity (DISCOVERY-NATIVE in-RAM analytics; ZERO search). Owner = resolved principal.
  // `similarityGraph` takes no id (self-scoped); `similarChats` takes a chatId, owner-belted via present-host
  // (a foreign chat → [], proved by the cross-tenant sweep probe).
  similarityGraph: authedProcedure
    .input(
      z
        .object({
          minSimilarity: z.number().optional(),
          maxNodes: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.discovery.similarityGraph(ctx.auth.userId, {
        ...(input?.minSimilarity !== undefined ? { minSimilarity: input.minSimilarity } : {}),
        ...(input?.maxNodes !== undefined ? { maxNodes: input.maxNodes } : {}),
      }),
    ),

  similarChats: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>(), limit: z.number().int().positive().optional() }))
    .query(({ ctx, input }) => ctx.services.discovery.similarChats(ctx.auth.userId, input.chatId, input.limit)),

  // PD-40 composed views (CONTENT-only). Owner = resolved principal.
  home: authedProcedure.query(({ ctx }) => ctx.services.discovery.home(ctx.auth.userId)),

  themeDetail: authedProcedure
    .input(z.object({ clusterIdx: z.number().int().nonnegative(), level: z.enum(THEME_LEVELS) }))
    .query(({ ctx, input }) => ctx.services.discovery.themeDetail(ctx.auth.userId, input.clusterIdx, input.level)),

  // PD-40 characterDossier: one character's composed dossier (facets + portrait alignment + injected `similar`
  // neighbours). Owner-belted (a foreign/undistilled character → null). Owner = the resolved principal.
  characterDossier: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.discovery.characterDossier(ctx.auth.userId, input.characterId)),

  // PD-40 cooccurrence reads (owner-scoped). The heavy recompute is the `compute-cooccurrence` workload.
  topKeywords: authedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().optional(),
          minCount: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.discovery.topKeywords(ctx.auth.userId, {
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
        ...(input?.minCount !== undefined ? { minCount: input.minCount } : {}),
      }),
    ),

  cooccurringKeywords: authedProcedure
    .input(z.object({ keyword: z.string(), limit: z.number().int().positive().optional() }))
    .query(({ ctx, input }) => ctx.services.discovery.cooccurringKeywords(ctx.auth.userId, input.keyword, input.limit)),

  characterKeywords: authedProcedure
    .input(
      z.object({
        characterId: brandedId<CharacterId>(),
        limit: z.number().int().positive().optional(),
      }),
    )
    .query(({ ctx, input }) => ctx.services.discovery.characterKeywords(ctx.auth.userId, input.characterId, input.limit)),
});
