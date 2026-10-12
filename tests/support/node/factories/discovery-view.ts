// Wire-output builders for the discovery reads and mutations. Defaults parse through the contract schema; an
// override is spread after the parse.

import {
  browseCharacterSchema,
  browseCharactersPageSchema,
  catalogStatsSchema,
  characterComparisonSchema,
  characterDossierSchema,
  characterFacetsSchema,
  distillStatsSchema,
  dossierNeighborSchema,
  homeViewSchema,
  modelRoutingRowSchema,
  similarityGraphEdgeSchema,
  similarityGraphNodeSchema,
  similarityGraphSchema,
  themeDetailSchema,
  themeRowSchema,
} from "@orb/contracts/discovery";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type DistillStatsWire = TrpcWireOutput<"discovery.suggestCharacterTags">;
type CatalogStatsWire = TrpcWireOutput<"discovery.catalog">;
type BrowsePageWire = TrpcWireOutput<"discovery.browseCharacters">;
type BrowseCharacterWire = BrowsePageWire["items"][number];
type CharacterFacetsWire = TrpcWireOutput<"discovery.characterFacets">;
type SimilarityGraphWire = TrpcWireOutput<"discovery.similarityGraph">;
type SimilarityNodeWire = SimilarityGraphWire["nodes"][number];
type SimilarityEdgeWire = SimilarityGraphWire["edges"][number];
type ComparisonWire = NonNullable<TrpcWireOutput<"discovery.compareCharacters">>;
type HomeViewWire = TrpcWireOutput<"discovery.home">;
type ThemeRowWire = HomeViewWire["sceneThemes"][number];
type ModelRoutingRowWire = TrpcWireOutput<"discovery.modelRouting">[number];
type DossierWire = NonNullable<TrpcWireOutput<"discovery.characterDossier">>;
type DossierNeighborWire = DossierWire["similar"][number];
type ThemeDetailWire = NonNullable<TrpcWireOutput<"discovery.themeDetail">>;

/** A distill pass that scanned nothing and changed nothing. */
export function makeDistillStats(overrides: Partial<DistillStatsWire> = {}): DistillStatsWire {
  return { ...distillStatsSchema.parse({ scanned: 0, distilled: 0, failed: 0, skipped: 0, tagsStaged: 0 }), ...overrides };
}

/** An empty library's catalog: nothing distilled, nothing counted. */
export function makeCatalogStats(overrides: Partial<CatalogStatsWire> = {}): CatalogStatsWire {
  return {
    ...catalogStatsSchema.parse({ genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0, totalCharacters: 0 }),
    ...overrides,
  };
}

/** One browse row: a card with no distilled facets. */
export function makeBrowseCharacter(overrides: Partial<BrowseCharacterWire> = {}): BrowseCharacterWire {
  return {
    ...browseCharacterSchema.parse({
      characterId: ids.next(ID_PREFIX.character),
      name: "Character",
      genre: null,
      tone: null,
      setting: null,
      tags: [],
      elevatorPitch: null,
      avatarHash: null,
      createdAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}

/** A browse page over `items`; `totalCount` is the item count unless the override says otherwise. */
export function makeBrowseCharactersPage(items: BrowsePageWire["items"] = [], overrides: Partial<BrowsePageWire> = {}): BrowsePageWire {
  return { ...browseCharactersPageSchema.parse({ items: [], nextCursor: null, totalCount: 0 }), items, totalCount: items.length, ...overrides };
}

/** No distilled genres or tones. */
export function makeCharacterFacets(overrides: Partial<CharacterFacetsWire> = {}): CharacterFacetsWire {
  return { ...characterFacetsSchema.parse({ genres: [], tones: [] }), ...overrides };
}

export function makeSimilarityGraphNode(overrides: Partial<SimilarityNodeWire> = {}): SimilarityNodeWire {
  return {
    ...similarityGraphNodeSchema.parse({ characterId: ids.next(ID_PREFIX.character), name: "Character", degree: 0, genre: null }),
    ...overrides,
  };
}

export function makeSimilarityGraphEdge(overrides: Partial<SimilarityEdgeWire> = {}): SimilarityEdgeWire {
  return {
    ...similarityGraphEdgeSchema.parse({ source: ids.next(ID_PREFIX.character), target: ids.next(ID_PREFIX.character), similarity: 0.5 }),
    ...overrides,
  };
}

/** A similarity graph over the given nodes and edges. */
export function makeSimilarityGraph(nodes: SimilarityGraphWire["nodes"] = [], edges: SimilarityGraphWire["edges"] = []): SimilarityGraphWire {
  return { ...similarityGraphSchema.parse({ nodes: [], edges: [] }), nodes, edges };
}

/** A two-card comparison with nothing shared. */
export function makeCharacterComparison(overrides: Partial<ComparisonWire> = {}): ComparisonWire {
  const compared = (name: string): ComparisonWire["a"] => ({ characterId: ids.next(ID_PREFIX.character), name, genre: null, tone: null, pitch: null });
  return {
    ...characterComparisonSchema.parse({
      a: compared("A"),
      b: compared("B"),
      sameGenre: false,
      sameTone: false,
      sharedTags: [],
      onlyA: [],
      onlyB: [],
      redundancy: 0,
    }),
    ...overrides,
  };
}

/** A scene-level theme cluster row. */
export function makeThemeRow(overrides: Partial<ThemeRowWire> = {}): ThemeRowWire {
  return {
    ...themeRowSchema.parse({
      id: ids.next(ID_PREFIX.themeCluster),
      level: "scene",
      clusterIdx: 0,
      name: null,
      size: 1,
      model: "model",
      computedAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}

/** A corpus home with no coverage and no themes. */
export function makeHomeView(overrides: Partial<HomeViewWire> = {}): HomeViewWire {
  return {
    ...homeViewSchema.parse({
      coverage: { characters: 0, digests: 0, segments: 0 },
      sceneThemes: [],
      arcThemes: [],
      duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
    }),
    ...overrides,
  };
}

/** A model-routing row with no recorded generations. */
export function makeModelRoutingRow(overrides: Partial<ModelRoutingRowWire> = {}): ModelRoutingRowWire {
  return {
    ...modelRoutingRowSchema.parse({
      genre: "genre",
      model: "model",
      provider: null,
      generations: 0,
      tokensOut: null,
      tokensOutProvenance: "unrecorded",
      avgGenTimeMs: null,
      genTimeSamples: 0,
      costUsd: null,
    }),
    ...overrides,
  };
}

export function makeDossierNeighbor(overrides: Partial<DossierNeighborWire> = {}): DossierNeighborWire {
  return {
    ...dossierNeighborSchema.parse({
      characterId: ids.next(ID_PREFIX.character),
      name: "Neighbor",
      score: 0,
      relevance: 0,
      avatarHash: null,
      genre: null,
      tone: null,
      elevatorPitch: null,
    }),
    ...overrides,
  };
}

/** A character dossier with no facets, portrait, score or neighbours. */
export function makeCharacterDossier(overrides: Partial<DossierWire> = {}): DossierWire {
  return {
    ...characterDossierSchema.parse({
      characterId: ids.next(ID_PREFIX.character),
      name: "Character",
      genre: null,
      tone: null,
      elevatorPitch: null,
      tags: [],
      portrait: null,
      refineryScore: null,
      similar: [],
    }),
    ...overrides,
  };
}

/** A scene theme with no sources, timeline or members. */
export function makeThemeDetail(overrides: Partial<ThemeDetailWire> = {}): ThemeDetailWire {
  return {
    ...themeDetailSchema.parse({
      sources: [],
      sourceLimit: 0,
      computedAt: FROZEN_AT_MS,
      id: ids.next(ID_PREFIX.themeCluster),
      level: "scene",
      clusterIdx: 0,
      name: null,
      size: 1,
      model: "model",
      timeline: [],
      members: [],
    }),
    ...overrides,
  };
}
