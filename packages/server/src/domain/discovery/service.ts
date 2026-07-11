// domain/discovery — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The
// `DiscoveryContext` is assembled at the entry root (db + the injected clock/id determinism seam + the bound
// `summarize` thunk + the injected `embeddings.writeHubScores` seam) and passed in. Each service method binds
// the context's sub-deps to the standalone `compute*`/read function (the same functions the `transport/jobs`
// runners call directly — the compute* passes stay standalone-exportable).

import type { UserId } from "@orb/kit/ids";
import type { ThemeLevel } from "./contract/params";
import type { DuplicateCharacterPair, DuplicateChatPair, ThemeRow } from "./contract/results";
import type { DiscoveryContext, DiscoveryService, ViewsDeps } from "./contract/service";
import { computeCooccurrence as runComputeCooccurrence } from "./cooccurrence/generate";
import { characterKeywords, cooccurringKeywords, topKeywords } from "./cooccurrence/retrieve";
import {
  computeChatDuplicatePairs as runComputeChatDuplicatePairs,
  computeDuplicatePairs as runComputeDuplicatePairs,
} from "./duplicates/generate";
import { readDuplicateCharacters, readDuplicateChats } from "./duplicates/retrieve";
import { createImageAnalyticsFacets } from "./image-analytics/facets";
import { createImageAnalyticsRetrieve } from "./image-analytics/retrieve";
import { backfillMsgMidAt } from "./themes/backfill";
import { computeThemes as runComputeThemes } from "./themes/generate";
import { readThemes } from "./themes/retrieve";
import { createArchetypes } from "./verbs/archetypes";
import { createBrowse } from "./verbs/browse";
import { createCatalog } from "./verbs/catalog";
import { createComputeHubScores } from "./verbs/compute-hub-scores";
import { createDistill } from "./verbs/distill";
import { createEconomicsInsights } from "./verbs/economics-insights";
import { createInsights } from "./verbs/insights";
import { createProjection } from "./verbs/projection";
import { createSimilarChats } from "./verbs/similar-chats";
import { createSimilarityGraph } from "./verbs/similarity-graph";
import { createViews } from "./verbs/views";

export function createDiscoveryService(ctx: DiscoveryContext): DiscoveryService {
  const dupDeps = {
    now: ctx.now,
    newDuplicateCharacterPairId: ctx.newDuplicateCharacterPairId,
  };
  const chatDupDeps = {
    now: ctx.now,
    newDuplicateChatPairId: ctx.newDuplicateChatPairId,
  };
  // Composed views compose sibling-subsystem reads — injected here (the verb may not import a subsystem).
  const viewsDeps: ViewsDeps = {
    themes: (userId: UserId, level?: ThemeLevel): Promise<ThemeRow[]> =>
      readThemes(ctx.db, userId, level),
    duplicateCharacters: (userId: UserId): Promise<DuplicateCharacterPair[]> =>
      readDuplicateCharacters(ctx.db, userId),
    duplicateChats: (userId: UserId, opts?): Promise<DuplicateChatPair[]> =>
      readDuplicateChats(ctx.db, userId, opts),
  };
  const themeDeps = {
    now: ctx.now,
    newThemeClusterId: ctx.newThemeClusterId,
    summarize: ctx.summarize,
  };
  const coocDeps = {
    now: ctx.now,
    newKeywordCooccurrenceId: ctx.newKeywordCooccurrenceId,
    newCharacterKeywordProfileId: ctx.newCharacterKeywordProfileId,
  };
  return {
    computeDuplicatePairs: (opts) => runComputeDuplicatePairs(ctx.db, dupDeps, opts),
    duplicateCharacters: (userId, opts) => readDuplicateCharacters(ctx.db, userId, opts),
    computeChatDuplicatePairs: (opts) => runComputeChatDuplicatePairs(ctx.db, chatDupDeps, opts),
    duplicateChats: (userId, opts) => readDuplicateChats(ctx.db, userId, opts),
    distillCharacters: createDistill(ctx),
    ...createBrowse(ctx),
    ...createArchetypes(ctx),
    ...createProjection(ctx),
    ...createCatalog(ctx),
    ...createImageAnalyticsRetrieve(ctx),
    ...createImageAnalyticsFacets(ctx),
    ...createSimilarityGraph(ctx),
    ...createSimilarChats(ctx),
    ...createViews(ctx, viewsDeps),
    computeThemes: (opts) => runComputeThemes(ctx.db, themeDeps, opts),
    themes: (userId, level) => readThemes(ctx.db, userId, level),
    backfillDigestStoryTime: (ownerId) => backfillMsgMidAt(ctx.db, ownerId),
    ...createInsights(ctx),
    ...createEconomicsInsights(ctx),
    computeCooccurrence: (opts) => runComputeCooccurrence(ctx.db, coocDeps, opts),
    topKeywords: (userId, opts) => topKeywords(ctx.db, userId, opts),
    cooccurringKeywords: (userId, keyword, limit) =>
      cooccurringKeywords(ctx.db, userId, keyword, limit),
    characterKeywords: (userId, characterId, limit) =>
      characterKeywords(ctx.db, userId, characterId, limit),
    ...createComputeHubScores(ctx),
  };
}
