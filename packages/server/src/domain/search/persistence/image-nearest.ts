// domain/search/persistence/image-nearest — cross-modal text→image vector scan (row shape + fetch); the
// image_embeddings analogue of nearest.ts. Three belts in the WHERE: owner (via the joined assets row,
// never users), space (embed model), and lens. hub_score is selected but deliberately not CSLS-adjusted
// here (see verbs/images.ts).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { ReadOnlyDb } from "@orb/db";
import { assets, characters, imageEmbeddings } from "@orb/db";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { and, eq, ne, sql } from "drizzle-orm";
import { toVectorBlob } from "./nearest";

interface NearestImage {
  readonly assetId: AssetId;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly caption: string | null;
}

interface NearestImagesParams {
  readonly ownerId: UserId;
  readonly queryVector: Float32Array;
  readonly model: string;
  readonly lens: ImageLens;
  readonly limit: number;
}

export async function nearestImages(db: ReadOnlyDb, params: NearestImagesParams): Promise<NearestImage[]> {
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
    .where(and(eq(assets.ownerId, params.ownerId), eq(imageEmbeddings.model, params.model), eq(imageEmbeddings.lens, params.lens)))
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}

/** Belted on both characters.ownerId and assets.ownerId; a foreign/unknown seed resolves to null. */
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

interface NearestAvatarCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly distance: number;
  readonly hubScore: number | null;
}

interface NearestAvatarCharactersParams {
  readonly ownerId: UserId;
  readonly queryVector: Float32Array;
  readonly model: string;
  readonly lens: ImageLens;
  readonly excludeCharacterId: CharacterId;
  readonly limit: number;
}

/** Synthetic (group-memory) characters are excluded (no real avatar). */
export async function nearestAvatarCharacters(db: ReadOnlyDb, params: NearestAvatarCharactersParams): Promise<NearestAvatarCharacter[]> {
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
