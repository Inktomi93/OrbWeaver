// domain/search/verbs/similar-art — "more like this avatar" (PD-35): seed-vector top-k over the IMAGE space.
// Reads the seed character's current avatar STORED embedding (at one lens) → scans other owned avatars in the
// same space excluding the seed → CSLS hub-adjust → returns the visually-nearest characters.
//
// ── CSLS APPLIES HERE (the counterpart to the `images` CSLS-SKIP) ─────────────────────────────────────────
// The cross-modal `images` verb (text→image) SKIPS CSLS because the image↔image `hub_score` sits on a
// different cosine scale than a cross-modal distance. `similarArt` is IMAGE↔IMAGE — same space, same scale —
// so `hub_score` is exactly the signal it was reserved for (`schema/embeddings.ts` + `verbs/images.ts`: "a
// FUTURE image↔image similarity verb (same space, hub applies there)"). This is that verb; CSLS is applied.
//
// THE SEED READ IS OWNER-BELTED on BOTH `characters.ownerId` AND `assets.ownerId` (the neo V2-2
// cross-tenant-seed lesson) — a foreign/unknown seed, or a character with no avatar embedding at the lens,
// yields an EMPTY result. Default lens = `image-raw` (the pure-visual portrait lens — `@orb/contracts/embeddings`).

import type { ImageLens } from "@orb/contracts/embeddings";
import type { SimilarArtParams } from "../contract/params";
import type { SimilarArtHit } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { nearestAvatarCharacters, readSeedAvatarVector } from "../persistence/image-nearest";
import { OWNER_OVERFETCH } from "../substrate/constants";
import { compareCslsBy, cslsAdjust } from "../substrate/csls";

/** The pure-visual portrait lens — the image↔image similarity default (a card's raw avatar bytes). */
const DEFAULT_ART_LENS: ImageLens = "image-raw";

export function createSimilarArt(ctx: SearchContext): SearchService["similarArt"] {
  return async (params: SimilarArtParams): Promise<SimilarArtHit[]> => {
    const { ownerId, characterId, topN } = params;
    const lens = params.lens ?? DEFAULT_ART_LENS;
    const model = ctx.roleClients.imageEmbedModel;

    const seed = await readSeedAvatarVector(ctx.db, { ownerId, characterId, model, lens });
    if (seed === null) {
      return [];
    }

    const pool = await nearestAvatarCharacters(ctx.db, {
      ownerId,
      queryVector: seed,
      model,
      lens,
      excludeCharacterId: characterId,
      limit: OWNER_OVERFETCH * topN,
    });

    return pool
      .map((r) => ({
        characterId: r.characterId,
        name: r.name,
        avatarHash: r.avatarHash,
        distance: r.distance,
        hubScore: r.hubScore,
        score: cslsAdjust(r.distance, r.hubScore),
      }))
      .sort(
        compareCslsBy(
          (r) => r.distance,
          (r) => r.hubScore,
        ),
      )
      .slice(0, topN)
      .map((r) => ({
        characterId: r.characterId,
        score: r.score,
        name: r.name,
        avatarHash: r.avatarHash,
        lens,
      }));
  };
}
