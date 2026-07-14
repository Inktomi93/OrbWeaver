// domain/discovery/image-analytics/retrieve — image-side embedding analytics (owner-scoped, in-RAM):
// imageDuplicates (cards sharing near-identical art) + visualArchetypes (art-style clusters, k-means over
// avatar vectors). All-pairs analytics, not vector_distance_cos SQL (that's search's). Grouped by model —
// meaningful only within one unified embedding space.

import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { DiscoveryContext } from "../context";
import type { ArchetypeMember, ImageDuplicatePair, VisualArchetype } from "../contract/results";
import type { DiscoveryService } from "../contract/service";
import { readOwnedAvatarVectors, readOwnedCaptionRows } from "../persistence/embed-store-reads";
import { readOwnedCardFacets } from "../persistence/summary-reads";
import { kmeans } from "../substrate/kmeans";
import { pairsAboveThreshold } from "../substrate/pair-cosine";

const DEFAULT_IMAGE_DUP_THRESHOLD = 0.92;
const DEFAULT_VISUAL_K = 8;
const VISUAL_SEED = 1;
const MAX_MEMBERS = 12;

type AvatarVector = Awaited<ReturnType<typeof readOwnedAvatarVectors>>[number];

function groupByModel<T extends { readonly model: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = groups.get(row.model);
    if (bucket === undefined) {
      groups.set(row.model, [row]);
    } else {
      bucket.push(row);
    }
  }
  return groups;
}

export function createImageAnalyticsRetrieve(
  ctx: DiscoveryContext,
): Pick<DiscoveryService, "imageDuplicates" | "visualArchetypes"> {
  return {
    imageDuplicates: (userId, threshold) => imageDuplicates(ctx.db, userId, threshold),
    visualArchetypes: (userId, k) => visualArchetypes(ctx.db, userId, k),
  };
}

async function imageDuplicates(
  db: Db,
  ownerId: UserId,
  threshold = DEFAULT_IMAGE_DUP_THRESHOLD,
): Promise<ImageDuplicatePair[]> {
  const avatars = await readOwnedAvatarVectors(db, ownerId);
  const out: ImageDuplicatePair[] = [];
  for (const [, group] of groupByModel(avatars)) {
    if (group.length < 2) {
      continue;
    }
    const hubs = new Array<number>(group.length).fill(0);
    for (const pair of pairsAboveThreshold(
      group.map((r) => r.embedding),
      hubs,
      threshold,
    )) {
      const a = group[pair.i];
      const b = group[pair.j];
      if (a === undefined || b === undefined) {
        continue;
      }
      out.push({
        characterIdA: a.characterId,
        nameA: a.name,
        characterIdB: b.characterId,
        nameB: b.name,
        similarity: pair.similarity,
      });
    }
  }
  return out.sort((x, y) => y.similarity - x.similarity);
}

interface VisualClusterAcc {
  readonly members: ArchetypeMember[];
  readonly genre: Map<string, number>;
  readonly tone: Map<string, number>;
  readonly artStyle: Map<string, number>;
  readonly palette: Map<string, number>;
  readonly mood: Map<string, number>;
}

function bump(m: Map<string, number>, key: string | null | undefined): void {
  if (key !== null && key !== undefined && key.length > 0) {
    m.set(key, (m.get(key) ?? 0) + 1);
  }
}

function mode(m: Map<string, number>): string | null {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
}

function visualArchetypesForGroup(
  group: readonly AvatarVector[],
  labels: Map<CharacterId, VisualLabels>,
  k: number,
): VisualArchetype[] {
  if (group.length < k + 1) {
    return [];
  }
  const { assignments } = kmeans(
    group.map((r) => r.embedding),
    k,
    VISUAL_SEED,
  );
  const clusters = new Map<number, VisualClusterAcc>();
  for (let i = 0; i < group.length; i += 1) {
    const row = group[i];
    if (row === undefined) {
      continue;
    }
    const c = assignments[i] ?? 0;
    let acc = clusters.get(c);
    if (acc === undefined) {
      acc = {
        members: [],
        genre: new Map(),
        tone: new Map(),
        artStyle: new Map(),
        palette: new Map(),
        mood: new Map(),
      };
      clusters.set(c, acc);
    }
    acc.members.push({ characterId: row.characterId, name: row.name });
    const l = labels.get(row.characterId);
    bump(acc.genre, l?.genre);
    bump(acc.tone, l?.tone);
    bump(acc.artStyle, l?.artStyle);
    bump(acc.palette, l?.palette);
    bump(acc.mood, l?.mood);
  }
  const model = group[0]?.model ?? "";
  return [...clusters.values()].map((acc) => buildVisualArchetype(acc, model));
}

function buildVisualArchetype(acc: VisualClusterAcc, model: string): VisualArchetype {
  const genre = mode(acc.genre);
  const tone = mode(acc.tone);
  const artStyle = mode(acc.artStyle);
  const palette = mode(acc.palette);
  const mood = mode(acc.mood);
  const label =
    [artStyle, mood].filter((x) => x !== null).join(" · ") ||
    [tone, genre].filter((x) => x !== null).join(" ") ||
    "mixed";
  return {
    label,
    genre,
    tone,
    artStyle,
    palette,
    mood,
    size: acc.members.length,
    members: acc.members.slice(0, MAX_MEMBERS),
    model,
  };
}

interface VisualLabels {
  genre: string | null;
  tone: string | null;
  artStyle: string | null;
  palette: string | null;
  mood: string | null;
}

const metaStr = (m: Record<string, unknown> | null, key: string): string | null =>
  m !== null && typeof m[key] === "string" ? (m[key] as string) : null;

async function visualArchetypes(
  db: Db,
  ownerId: UserId,
  k = DEFAULT_VISUAL_K,
): Promise<VisualArchetype[]> {
  const [avatars, cardFacets, captions] = await Promise.all([
    readOwnedAvatarVectors(db, ownerId),
    readOwnedCardFacets(db, ownerId),
    readOwnedCaptionRows(db, ownerId),
  ]);
  const labels = new Map<CharacterId, VisualLabels>();
  for (const f of cardFacets) {
    labels.set(f.characterId, {
      genre: f.genre,
      tone: f.tone,
      artStyle: null,
      palette: null,
      mood: null,
    });
  }
  for (const cap of captions) {
    const prev = labels.get(cap.characterId) ?? {
      genre: null,
      tone: null,
      artStyle: null,
      palette: null,
      mood: null,
    };
    labels.set(cap.characterId, {
      ...prev,
      artStyle: metaStr(cap.captionMeta, "artStyle"),
      palette: metaStr(cap.captionMeta, "palette"),
      mood: metaStr(cap.captionMeta, "mood"),
    });
  }
  const out: VisualArchetype[] = [];
  for (const [, group] of groupByModel(avatars)) {
    out.push(...visualArchetypesForGroup(group, labels, k));
  }
  return out.sort((a, b) => b.size - a.size);
}
