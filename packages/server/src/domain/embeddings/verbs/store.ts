// verb: store — THE single vector write path (embeddings.md §"the defining invariant": the ONLY inserter
// into any vector table). One parametrized body collapses the 6 hand-rolled embed+upsert sites neo-tavern
// scattered across 5 tables.
//
// The flow, per lens arm:
//   1. content_hash the content (the staleness gate + cross-chat collapse key).
//   2. read the stored hash for the upsert key — IDENTICAL ⇒ `noop` (no re-embed, no write; the expensive
//      embed is skipped BEFORE it runs).
//   3. embed via the INJECTED role op (`roleClients.embed` for text, `imageEmbed` for images — the model is
//      bound at the root from `connection.resolveRole`; the domain never names a backend/runner/family).
//   4. SPACE TRIPWIRE: the produced vector's dim MUST match the declared `(model, dim)` space, else
//      `SpaceMismatchError` — a mis-tagged row never lands (the store-time half of the space invariant;
//      the compare-time half is `@orb/kit/vector-math`'s dim-mismatch throw).
//   5. upsert the row — `hub_score` is NEVER in the write (the column is `discovery`'s alone; §invariant 2).
//
// The `switch (params.lens)` is the §7.5 exhaustive dispatch (the `assertNever` default arm): a new lens
// fails `tsc` until its embed+upsert arm is added. FLAG[PD-34]: the `segment` / `digest` arms (memory
// chat-block — verbatim + distilled, with the `chat_digest_speakers` re-query-after-upsert + the
// `scopedCharacterId=''` sentinel) land in Phase 5 when `memory` is built whole (ledger D16). There is NO
// `principal`/ownership check — the substrate FKs to its producer and never re-checks ownership (D20).

import { EmbedFailedError, SpaceMismatchError } from "../contract/errors";
import type { StoreParams } from "../contract/params";
import type { StoreResult } from "../contract/results";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service";
import {
  existingCharacterHash,
  existingImageHash,
  upsertCharacterEmbedding,
  upsertImageEmbedding,
} from "../persistence/queries";
import { contentHash } from "../substrate/hash";

function assertNever(value: never): never {
  throw new Error(`embeddings.store: unhandled lens ${String(value)}`);
}

/** The first vector of an embed result, or `EmbedFailedError` when the family filtered the input (`null`) or
 *  returned nothing. */
function firstVector(
  vectors: readonly (Float32Array | null)[],
  lens: string,
  model: string,
): Float32Array {
  const vector = vectors[0];
  if (vector === null || vector === undefined) {
    throw new EmbedFailedError(lens, model);
  }
  return vector;
}

/** The store-time space tripwire: the produced vector must match the declared space `dim`. */
function assertSpace(model: string, dim: number, vector: Float32Array): void {
  if (vector.length !== dim) {
    throw new SpaceMismatchError(model, dim, vector.length);
  }
}

export function createStore(ctx: EmbeddingsContext): EmbeddingsService["store"] {
  return async (params: StoreParams): Promise<StoreResult> => {
    const hash = contentHash(params.content);
    switch (params.lens) {
      case "card-text": {
        const existing = await existingCharacterHash(ctx.db, params.characterId, params.model);
        if (existing === hash) {
          return { outcome: "noop", contentHash: hash };
        }
        const result = await ctx.roleClients.embed(params.content);
        const vector = firstVector(result.vectors, params.lens, params.model);
        assertSpace(params.model, params.dim, vector);
        await upsertCharacterEmbedding(ctx.db, {
          id: ctx.newCharacterEmbeddingId(),
          characterId: params.characterId,
          embedding: vector,
          contentHash: hash,
          model: params.model,
          dim: params.dim,
          now: ctx.now(),
        });
        return { outcome: "written", contentHash: hash };
      }
      case "image-raw": {
        const existing = await existingImageHash(ctx.db, params.assetId, params.lens, params.model);
        if (existing === hash) {
          return { outcome: "noop", contentHash: hash };
        }
        const result = await ctx.roleClients.imageEmbed({ kind: "image", input: params.content });
        const vector = firstVector(result.vectors, params.lens, params.model);
        assertSpace(params.model, params.dim, vector);
        await upsertImageEmbedding(ctx.db, {
          id: ctx.newImageEmbeddingId(),
          assetId: params.assetId,
          lens: params.lens,
          caption: null,
          captionMeta: null,
          embedding: vector,
          contentHash: hash,
          model: params.model,
          dim: params.dim,
          now: ctx.now(),
        });
        return { outcome: "written", contentHash: hash };
      }
      case "image-captioned": {
        const existing = await existingImageHash(ctx.db, params.assetId, params.lens, params.model);
        if (existing === hash) {
          return { outcome: "noop", contentHash: hash };
        }
        const result = await ctx.roleClients.imageEmbed({
          kind: "multimodal",
          input: { image: params.content, text: params.caption },
        });
        const vector = firstVector(result.vectors, params.lens, params.model);
        assertSpace(params.model, params.dim, vector);
        await upsertImageEmbedding(ctx.db, {
          id: ctx.newImageEmbeddingId(),
          assetId: params.assetId,
          lens: params.lens,
          caption: params.caption,
          captionMeta: params.captionMeta ?? null,
          embedding: vector,
          contentHash: hash,
          model: params.model,
          dim: params.dim,
          now: ctx.now(),
        });
        return { outcome: "written", contentHash: hash };
      }
      default:
        return assertNever(params);
    }
  };
}
