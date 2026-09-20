// The VERBATIM-SEGMENT write path — the batch sibling of `store.ts` (still the one vector write path,
// Knowledge-Cluster inv 1; the physical insert stays in `persistence/queries.ts`).
//
// WHY A BATCH (#172, owner batching ruling: "batch by phase … toss it all at vLLM, its scheduler can handle
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

import type { UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import { EmbedFailedError, SpaceMismatchError } from "../contract/errors.ts";
import type { SegmentStoreParams } from "../contract/params.ts";
import type { StoreResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { existingSegmentHash, upsertChatSegment } from "../persistence/queries.ts";

/** An input that survived the hash gate, carrying its position in the caller's list (results are
 *  index-aligned to the input, so a noop and a write are told apart per item). */
interface PendingSegment {
  readonly index: number;
  readonly params: SegmentStoreParams;
}

/** The hash gate: read each chunk's stored `content_hash` for `(chatId, blockIdx, chunkIdx, model)` and keep
 *  only the ones that differ. The reads run CONCURRENTLY — they are independent point lookups, and the
 *  serialized version was one of the round trips this verb exists to remove. */
async function gate(ctx: EmbeddingsContext, params: readonly SegmentStoreParams[]): Promise<PendingSegment[]> {
  const existing = await Promise.all(
    params.map((p) => existingSegmentHash(ctx.db, { chatId: p.chatId, blockIdx: p.blockIdx, chunkIdx: p.chunkIdx, model: p.model })),
  );
  return params.flatMap((p, index) => (existing[index] === p.contentHash ? [] : [{ index, params: p }]));
}

/** The produced vector for one pending item, or the typed failure: the family filtered the input (`null`), the
 *  flood came back short, or the vector does not match the declared width. `model` is THIS item's owner's
 *  answer, never the batch's — see `flood`. */
function vectorFor(vector: Float32Array | null | undefined, p: SegmentStoreParams, model: string): Float32Array {
  if (vector === null || vector === undefined) {
    throw new EmbedFailedError(p.lens, model);
  }
  if (vector.length !== p.dim) {
    throw new SpaceMismatchError(model, p.dim, vector.length);
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
  ctx: EmbeddingsContext,
  pending: readonly PendingSegment[],
): Promise<Map<number, { readonly model: string; readonly vector: Float32Array | null }>> {
  const byOwner = new Map<UserId, PendingSegment[]>();
  for (const item of pending) {
    const bucket = byOwner.get(item.params.ownerId);
    if (bucket === undefined) {
      byOwner.set(item.params.ownerId, [item]);
    } else {
      bucket.push(item);
    }
  }
  const out = new Map<number, { readonly model: string; readonly vector: Float32Array | null }>();
  for (const [ownerId, items] of byOwner) {
    const rc = await ctx.roleClientsFor(ownerId);
    const result = await rc.embed(items.map((p) => p.params.text));
    for (const [i, item] of items.entries()) {
      out.set(pending.indexOf(item), { model: result.model, vector: result.vectors[i] ?? null });
    }
  }
  return out;
}

export function createStoreSegments(ctx: EmbeddingsContext): EmbeddingsService["storeSegments"] {
  return async (params: readonly SegmentStoreParams[]): Promise<readonly StoreResult[]> => {
    const results: StoreResult[] = params.map((p) => ({ outcome: "noop", contentHash: p.contentHash, model: p.model }));
    const pending = params.length === 0 ? [] : await gate(ctx, params);
    if (pending.length === 0) {
      return results;
    }

    const embeddedByIndex = await flood(ctx, pending);

    // The row writes stay SEQUENTIAL — they are db upserts, and the engine is already done by here.
    for (const [i, item] of pending.entries()) {
      const p = item.params;
      const embedded = embeddedByIndex.get(i) ?? { model: p.model, vector: null };
      await upsertChatSegment(ctx.db, {
        id: ctx.newChatSegmentId(),
        chatId: p.chatId,
        blockIdx: p.blockIdx,
        chunkIdx: p.chunkIdx,
        seqStart: p.seqStart,
        seqEnd: p.seqEnd,
        text: p.text,
        embedding: vectorFor(embedded.vector, p, embedded.model),
        contentHash: p.contentHash,
        model: embedded.model,
        dim: p.dim,
        now: ctx.now(),
      });
      results[item.index] = { outcome: "written", contentHash: p.contentHash, model: embedded.model };
    }
    return results;
  };
}
