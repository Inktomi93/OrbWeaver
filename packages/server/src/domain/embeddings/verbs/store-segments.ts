// The VERBATIM-SEGMENT write path — the batch sibling of `store.ts` (still the one vector write path,
// Knowledge-Cluster inv 1; the physical insert stays in `persistence/queries.ts`).
//
// WHY A BATCH (owner batching ruling: "batch by phase … toss it all at vLLM, its scheduler can handle
// it, I promise"). Segments are the one lens whose producer has the whole corpus's work in hand at once: the
// memory sweep plans every chat before it commits anything. Written one-at-a-time, each block's embed was an
// awaited round trip interleaved with db reads — a client-side round-robin that keeps the engine's continuous
// batcher starved and ramping. So this verb takes the whole list, hash-gates it, hands EVERY survivor to the
// embed role in ONE call — no chunking, no throttle, no concurrency ceiling of our own; the provider surface
// owns how that lands on the wire — and then writes the rows.
//
// PHASE ORDER, and why it is exactly this: GATE (db reads, cheap) → EMBED (one flood, the only remote hop) →
// WRITE (db upserts). The embed is split from the row-write for the same reason the digest path splits
// summarize from embed-store: a phase that talks to the engine must see every item at once, and a phase that
// talks to the db must stay sequential.
//
// A one-element call is the live post-turn path — same code, batch of one.

import type { StoreGenerationReceipt, StoreResult } from "@orb/contracts/embeddings";
import type { UserId } from "@orb/kit/ids";
import { SpaceMismatchError } from "../contract/errors.ts";
import type { SegmentStoreParams } from "../contract/params.ts";
import type { EmbeddingsContext, EmbeddingsService, PinnedGeneration } from "../contract/service.ts";
import { resolveTargetGeneration } from "../persistence/generation.ts";
import { existingSegmentHash, upsertChatSegment } from "../persistence/queries.ts";
import { embedFailure } from "../substrate/embed-failure.ts";

/** An input with its position in the caller's list (results are index-aligned to the input, so a noop and a write
 *  are told apart per item) and its owner's target generation. */
interface PlacedSegment {
  readonly index: number;
  readonly params: SegmentStoreParams;
  readonly generation: PinnedGeneration;
}

/** Every input placed in its owner's target generation for this batch — resolved once per owner, in the order the
 *  owners first appear, read by the gate and the receipts. */
async function placeSegments(ctx: EmbeddingsContext, params: readonly SegmentStoreParams[], signal?: AbortSignal): Promise<readonly PlacedSegment[]> {
  const resolved = new Map<UserId, PinnedGeneration>();
  const placed: PlacedSegment[] = [];
  for (const [index, p] of params.entries()) {
    signal?.throwIfAborted();
    let generation = resolved.get(p.ownerId);
    if (generation === undefined) {
      generation = await resolveTargetGeneration(ctx, p.ownerId, "embed");
      resolved.set(p.ownerId, generation);
    }
    placed.push({ index, params: p, generation });
  }
  return placed;
}

/** The receipt fields `store` stamps too: the memory sweep records its completion from them, so a noop names
 *  the generation it was gated against, not only a write. */
function receiptOf(generation: PinnedGeneration): StoreGenerationReceipt {
  return { generationId: generation.id, generationEpoch: generation.epoch, generationVia: generation.via };
}

/** The hash gate: read each chunk's stored `content_hash` for `(chatId, blockIdx, chunkIdx, model)` and keep
 *  only the ones that differ. The reads run CONCURRENTLY — they are independent point lookups, and the
 *  serialized version was one of the round trips this verb exists to remove. */
async function gate(ctx: EmbeddingsContext, placed: readonly PlacedSegment[]): Promise<PlacedSegment[]> {
  const existing = await Promise.all(
    placed.map(({ params: p, generation }) =>
      existingSegmentHash(ctx.db, { chatId: p.chatId, blockIdx: p.blockIdx, chunkIdx: p.chunkIdx, generationId: generation.id }),
    ),
  );
  return placed.filter((item, position) => existing[position] !== item.params.contentHash);
}

/** The produced vector for one pending item, or the typed failure: the family filtered the input (`null`), the
 *  flood came back short, or the vector is not as wide as the owner's generation. `model` is THIS item's
 *  owner's answer, never the batch's — see `flood`. */
function vectorFor(ctx: EmbeddingsContext, vector: Float32Array | null | undefined, item: PlacedSegment, model: string): Float32Array {
  if (vector === null || vector === undefined) {
    throw embedFailure(ctx, item.params.lens, model);
  }
  if (vector.length !== item.generation.dims) {
    throw new SpaceMismatchError(model, item.generation.dims, vector.length);
  }
  return vector;
}

/** THE FLOOD. One call per OWNER, every pending chunk of theirs. Deliberately NOT chunked or throttled here:
 *  sizing the wire batch is the provider surface's job (it knows the engine's chunk size + worker count), and
 *  a second client-side limiter would only re-create the starvation this verb removes. The split is by funder
 *  because each owner's embed connection defines their space (section 7.5-2) -- still one call per owner,
 *  never one per chunk.
 *
 *  THE SPACE TAG IS KEPT PER ITEM, not per batch. Each owner's flood answers in THAT owner's space, so a
 *  mixed-owner batch carries two tags; the previous shape folded them into one `modelTag` and stamped every
 *  row with whichever owner's flood happened to run last -- a silent cross-owner mis-tagging of the same
 *  class the space-tag derivation (`embedSpaceOf`) exists to make impossible. */
async function flood(
  pending: readonly PlacedSegment[],
  signal: AbortSignal | undefined,
): Promise<Map<number, { readonly model: string; readonly vector: Float32Array | null }>> {
  const byOwner = new Map<UserId, PlacedSegment[]>();
  for (const item of pending) {
    const bucket = byOwner.get(item.params.ownerId);
    if (bucket === undefined) {
      byOwner.set(item.params.ownerId, [item]);
    } else {
      bucket.push(item);
    }
  }
  const out = new Map<number, { readonly model: string; readonly vector: Float32Array | null }>();
  for (const items of byOwner.values()) {
    signal?.throwIfAborted();
    const result = await items[0]?.generation.connection.embed(
      items.map((p) => p.params.text),
      { signal },
    );
    if (result === undefined) {
      continue;
    }
    for (const [i, item] of items.entries()) {
      out.set(pending.indexOf(item), { model: result.model, vector: result.vectors[i] ?? null });
    }
  }
  return out;
}

export function createStoreSegments(ctx: EmbeddingsContext): EmbeddingsService["storeSegments"] {
  return async (params: readonly SegmentStoreParams[], signal?: AbortSignal): Promise<readonly StoreResult[]> => {
    signal?.throwIfAborted();
    const placed = await placeSegments(ctx, params, signal);
    signal?.throwIfAborted();
    const results: StoreResult[] = placed.map(({ params: p, generation }) => ({ outcome: "noop", model: p.model, ...receiptOf(generation) }));
    const pending = await gate(ctx, placed);
    signal?.throwIfAborted();
    if (pending.length === 0) {
      return results;
    }

    const embeddedByIndex = await flood(pending, signal);

    // The row writes stay SEQUENTIAL — they are db upserts, and the engine is already done by here.
    for (const [i, item] of pending.entries()) {
      signal?.throwIfAborted();
      const p = item.params;
      const embedded = embeddedByIndex.get(i) ?? { model: p.model, vector: null };
      const landed = await upsertChatSegment(ctx.db, {
        logger: ctx.logger,
        id: ctx.newChatSegmentId(),
        chatId: p.chatId,
        blockIdx: p.blockIdx,
        chunkIdx: p.chunkIdx,
        seqStart: p.seqStart,
        seqEnd: p.seqEnd,
        text: p.text,
        embedding: vectorFor(ctx, embedded.vector, item, embedded.model),
        contentHash: p.contentHash,
        model: embedded.model,
        generationId: item.generation.id,
        dim: item.generation.dims,
        now: ctx.now(),
      });
      results[item.index] = { outcome: landed ? "written" : "noop", model: embedded.model, ...receiptOf(item.generation) };
    }
    return results;
  };
}
