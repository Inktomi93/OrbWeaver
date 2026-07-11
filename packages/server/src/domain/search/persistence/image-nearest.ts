// domain/search/persistence/image-nearest — the cross-modal text→image vector scan (row shape + fetch).
// The `image_embeddings` analogue of `nearest.ts`: the SAME `vector_distance_cos` + `vector32(?)`
// F32-blob pattern, the SAME scope-belt-in-the-WHERE discipline (never a post-filter). Queries ONLY; no
// business logic. The `vector_distance_cos` SQL appears in `nearest.ts` / `digest-rows.ts` / here ONLY
// (invariant #1 — no domain OUTSIDE search issues it).
//
// THREE belts, all in the WHERE (a non-owner never receives another user's image, a query never compares
// across embedding spaces, and only the requested lens is scanned):
//   • OWNER — `assets.ownerId = ?` (D20/D21: the vector row carries no ownerId; scope DERIVES from the
//     owned producer asset — the scan INNER-JOINs `assets` on `image_embeddings.assetId`). NEVER `users`.
//   • SPACE — `image_embeddings.model = ?` (the active IMAGE-embed model = the `(model, dim)` space tag).
//   • LENS  — `image_embeddings.lens = ?` (the `(assetId, model, lens)` unique; a text→image query scans
//     ONE lens — `image-captioned` (joint vision+text) or `image-raw` (pure visual) — never both mixed).
//
// hub_score is SELECTED for provenance but the cross-modal verb DELIBERATELY does not CSLS-adjust with it
// (see `verbs/images.ts` — the cosine-scale-mismatch invariant); it exists on this table for a future
// image↔image similarity verb.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { ReadOnlyDb } from "@orb/db";
import { assets, characters, imageEmbeddings } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, ne, sql } from "drizzle-orm";
import { toVectorBlob } from "./nearest";

/** One image-space neighbour: the owned asset + its raw cosine distance to the text query + the advisory
 *  hub (SELECTED, not applied — see the file header) + the caption (the `image-captioned` lens' rerank
 *  document; `null` for `image-raw`). File-local — the verb consumes it by inference (`no-inline-types`). */
interface NearestImage {
  readonly assetId: AssetId;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly caption: string | null;
}

interface NearestImagesParams {
  readonly ownerId: UserId;
  /** The text query embedded INTO the image space (`imageEmbed({ kind: "text" })`); its dim must match
   *  the column's `F32_BLOB(dim)`. */
  readonly queryVector: Float32Array;
  /** The active IMAGE-embed model — the space tag the scan is restricted to. */
  readonly model: string;
  /** The single lens the scan targets (the `(assetId, model, lens)` unique axis). */
  readonly lens: ImageLens;
  /** The over-fetched pool size. */
  readonly limit: number;
}

/**
 * The top-`limit` owned images in `model`'s space whose embedding (for `lens`) is closest (cosine) to the
 * text query — ascending by raw distance. The cross-modal rerank happens in the verb over these rows;
 * CSLS is NOT applied (the verb's cosine-scale-mismatch invariant).
 */
export async function nearestImages(
  db: ReadOnlyDb,
  params: NearestImagesParams,
): Promise<NearestImage[]> {
  const distance = sql<number>`vector_distance_cos(${imageEmbeddings.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      assetId: imageEmbeddings.assetId,
      distance,
      hubScore: imageEmbeddings.hubScore,
      caption: imageEmbeddings.caption,
    })
    .from(imageEmbeddings)
    .innerJoin(assets, eq(imageEmbeddings.assetId, assets.id))
    .where(
      and(
        eq(assets.ownerId, params.ownerId),
        eq(imageEmbeddings.model, params.model),
        eq(imageEmbeddings.lens, params.lens),
      ),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}

/** The stored avatar image vector for ONE owned seed character — the `similarArt` seed read. Belted on BOTH
 *  `characters.ownerId` AND `assets.ownerId` (defense in depth — the neo V2-2 cross-tenant-seed lesson): a
 *  foreign/unknown seed, or a character with no avatar / no embedding at `(model, lens)`, resolves to
 *  `null`, so a stranger can never seed the scan with another tenant's avatar vector. The
 *  `(assetId, model, lens)` unique makes the `limit(1)` deterministic. */
export async function readSeedAvatarVector(
  db: ReadOnlyDb,
  params: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly model: string;
    readonly lens: ImageLens;
  },
): Promise<Float32Array | null> {
  const rows = await db
    .select({ embedding: imageEmbeddings.embedding })
    .from(imageEmbeddings)
    .innerJoin(characters, eq(characters.avatarAssetId, imageEmbeddings.assetId))
    .innerJoin(assets, eq(assets.id, imageEmbeddings.assetId))
    .where(
      and(
        eq(characters.id, params.characterId),
        eq(characters.ownerId, params.ownerId),
        eq(assets.ownerId, params.ownerId),
        eq(imageEmbeddings.model, params.model),
        eq(imageEmbeddings.lens, params.lens),
      ),
    )
    .limit(1);
  return rows[0]?.embedding ?? null;
}

/** One image↔image avatar neighbour: the owned character whose avatar is visually closest (raw cosine) to
 *  the seed avatar, with its name + avatar CAS hash + advisory hub (CSLS APPLIES on this same-space path).
 *  File-local — the verb consumes it by inference (`no-inline-types`). */
interface NearestAvatarCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly distance: number;
  readonly hubScore: number | null;
}

interface NearestAvatarCharactersParams {
  readonly ownerId: UserId;
  /** The seed avatar vector (read via {@link readSeedAvatarVector}); its dim must match `F32_BLOB(dim)`. */
  readonly queryVector: Float32Array;
  /** The active IMAGE-embed model — the space tag the scan is restricted to. */
  readonly model: string;
  /** The single avatar lens compared (matches the seed's lens). */
  readonly lens: ImageLens;
  /** The seed character to exclude (never its own neighbour). */
  readonly excludeCharacterId: CharacterId;
  /** The over-fetched pool size. */
  readonly limit: number;
}

/**
 * The top-`limit` owned characters whose AVATAR (at `lens`, in `model`'s space) is closest (cosine) to the
 * seed avatar vector — ascending by raw distance, the seed excluded. Synthetic (group-memory) characters are
 * excluded (no real avatar). Owner-belted on both `assets.ownerId` and `characters.ownerId`. CSLS is applied
 * in the verb over these rows (image↔image is one space — unlike the cross-modal `images` path).
 */
export async function nearestAvatarCharacters(
  db: ReadOnlyDb,
  params: NearestAvatarCharactersParams,
): Promise<NearestAvatarCharacter[]> {
  const distance = sql<number>`vector_distance_cos(${imageEmbeddings.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      distance,
      hubScore: imageEmbeddings.hubScore,
    })
    .from(imageEmbeddings)
    .innerJoin(characters, eq(characters.avatarAssetId, imageEmbeddings.assetId))
    .innerJoin(assets, eq(assets.id, imageEmbeddings.assetId))
    .where(
      and(
        eq(assets.ownerId, params.ownerId),
        eq(characters.ownerId, params.ownerId),
        eq(characters.synthetic, false),
        eq(imageEmbeddings.model, params.model),
        eq(imageEmbeddings.lens, params.lens),
        ne(characters.id, params.excludeCharacterId),
      ),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}
