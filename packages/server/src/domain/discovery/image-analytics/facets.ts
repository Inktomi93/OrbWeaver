// domain/discovery/image-analytics/facets — cross-modal alignment + caption-facet analytics (owner-scoped
// reads): portraitAlignment (paired in-RAM cosine of card-text vs avatar vector), imageFacets (caption_meta
// facet distributions), charactersByImageFacet (drill a facet to its avatars).
//
// Alignment computes cosineSim in-RAM — never vector_distance_cos SQL (that's search-only). SCALAR_FACET_PATHS
// derives from ImageFacetKey so a new facet without an allowlisted json path fails tsc.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { cosineSim } from "@orb/kit/vector-math";
import type { DiscoveryContext } from "../context";
import type { ImageFacetKey } from "../contract/params";
import type {
  FacetCount,
  ImageFacetMember,
  ImageFacets,
  PortraitAlignment,
  PortraitAlignmentReport,
} from "../contract/results";
import type { DiscoveryService } from "../contract/service";
import {
  readCaptionRowsByFacet,
  readOwnedCaptionRows,
  readOwnedPortraitPairs,
} from "../persistence/embed-store-reads";

const LIST_FACET_PATHS = { tag: "$.tags", exposedPart: "$.exposedParts" } as const;
type ListFacetKey = keyof typeof LIST_FACET_PATHS;
const isListFacet = (f: ImageFacetKey): f is ListFacetKey => f === "tag" || f === "exposedPart";

const SCALAR_FACET_PATHS: Record<Exclude<ImageFacetKey, ListFacetKey>, string> = {
  artStyle: "$.artStyle",
  rating: "$.rating",
  shotType: "$.shotType",
  cameraAngle: "$.cameraAngle",
  gender: "$.gender",
  coverage: "$.coverage",
  bodyType: "$.bodyType",
  chestSize: "$.chestSize",
  skinTone: "$.skinTone",
  outfitType: "$.outfitType",
  clothingState: "$.clothingState",
  nudityLevel: "$.nudityLevel",
};

const TOP_TAGS_LIMIT = 40;

export function createImageAnalyticsFacets(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "portraitAlignment" | "imageFacets" | "charactersByImageFacet"> {
  return {
    portraitAlignment: (userId) => portraitAlignment(ctx.db, userId),
    imageFacets: (userId) => imageFacets(ctx.db, userId),
    charactersByImageFacet: (userId, facet, value) =>
      charactersByImageFacet(ctx.db, userId, facet, value),
  };
}

const metaStr = (m: Record<string, unknown> | null, key: string): string | null =>
  m !== null && typeof m[key] === "string" ? (m[key] as string) : null;

/** Ascending — worst-matched art first (the curation signal). */
async function portraitAlignment(db: Db, ownerId: UserId): Promise<PortraitAlignmentReport> {
  const [pairs, captions] = await Promise.all([
    readOwnedPortraitPairs(db, ownerId),
    readOwnedCaptionRows(db, ownerId),
  ]);
  const metaById = new Map(captions.map((c) => [c.characterId, c.captionMeta]));
  const characters: PortraitAlignment[] = pairs
    .map((p) => ({
      characterId: p.characterId,
      name: p.name,
      avatarHash: p.avatarHash,
      alignment: cosineSim(p.cardVec, p.imageVec),
      rating: metaStr(metaById.get(p.characterId) ?? null, "rating"),
      artStyle: metaStr(metaById.get(p.characterId) ?? null, "artStyle"),
    }))
    .sort((a, b) => a.alignment - b.alignment);
  const n = characters.length;
  if (n === 0) {
    return { count: 0, mean: 0, median: 0, characters: [] };
  }
  const vals = characters.map((c) => c.alignment);
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? (vals[mid] ?? 0) : ((vals[mid - 1] ?? 0) + (vals[mid] ?? 0)) / 2;
  return { count: n, mean, median, characters };
}

function bump(m: Map<string, number>, v: unknown): void {
  if (typeof v === "string" && v.length > 0) {
    m.set(v, (m.get(v) ?? 0) + 1);
  }
}

function bumpArr(m: Map<string, number>, v: unknown): void {
  if (Array.isArray(v)) {
    for (const x of v) {
      bump(m, x);
    }
  }
}

const toFacetCounts = (m: Map<string, number>): FacetCount[] =>
  [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);

async function imageFacets(db: Db, ownerId: UserId): Promise<ImageFacets> {
  const rows = await readOwnedCaptionRows(db, ownerId);
  const t = {
    artStyle: new Map<string, number>(),
    rating: new Map<string, number>(),
    shotType: new Map<string, number>(),
    cameraAngle: new Map<string, number>(),
    gender: new Map<string, number>(),
    coverage: new Map<string, number>(),
    bodyType: new Map<string, number>(),
    chestSize: new Map<string, number>(),
    skinTone: new Map<string, number>(),
    outfitType: new Map<string, number>(),
    clothingState: new Map<string, number>(),
    nudityLevel: new Map<string, number>(),
    exposedParts: new Map<string, number>(),
    tags: new Map<string, number>(),
  };
  let total = 0;
  for (const row of rows) {
    const meta = row.captionMeta;
    if (meta === null) {
      continue;
    }
    total += 1;
    for (const key of Object.keys(SCALAR_FACET_PATHS) as (keyof typeof t)[]) {
      bump(t[key], meta[key]);
    }
    bumpArr(t.exposedParts, meta["exposedParts"]);
    bumpArr(t.tags, meta["tags"]);
  }
  return {
    total,
    artStyles: toFacetCounts(t.artStyle),
    ratings: toFacetCounts(t.rating),
    shotTypes: toFacetCounts(t.shotType),
    cameraAngles: toFacetCounts(t.cameraAngle),
    genders: toFacetCounts(t.gender),
    coverage: toFacetCounts(t.coverage),
    bodyTypes: toFacetCounts(t.bodyType),
    chestSizes: toFacetCounts(t.chestSize),
    skinTones: toFacetCounts(t.skinTone),
    outfitTypes: toFacetCounts(t.outfitType),
    clothingStates: toFacetCounts(t.clothingState),
    nudityLevels: toFacetCounts(t.nudityLevel),
    exposedParts: toFacetCounts(t.exposedParts),
    topTags: toFacetCounts(t.tags).slice(0, TOP_TAGS_LIMIT),
  };
}

async function charactersByImageFacet(
  db: Db,
  ownerId: UserId,
  facet: ImageFacetKey,
  value: string,
): Promise<ImageFacetMember[]> {
  const sel = isListFacet(facet)
    ? { path: LIST_FACET_PATHS[facet], isList: true, value }
    : { path: SCALAR_FACET_PATHS[facet], isList: false, value };
  const rows = await readCaptionRowsByFacet(db, ownerId, sel);
  return rows.map((r) => ({
    characterId: r.characterId,
    name: r.name,
    avatarHash: r.avatarHash,
    rating: metaStr(r.captionMeta, "rating"),
    artStyle: metaStr(r.captionMeta, "artStyle"),
    caption: r.caption,
  }));
}
