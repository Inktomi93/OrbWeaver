// domain/discovery/verbs/similar-chats — "more like THIS chat" (owner-scoped read; live compute, IN-RAM).
// The k nearest chats by segment-centroid cosine. Per-chat centroid is derived from raw segment embeddings
// at request time, never persisted (pure-JS cosine, not a `vector_distance_cos` SQL — that's `search`).
// Restricted to the target chat's dominant embedding `model` (a cross-space centroid cosine is meaningless).

import type { Db } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { cosineToMany, mean } from "@orb/kit/vector-math";
import type { DiscoveryContext } from "../context";
import type { SimilarChat } from "../contract/results";
import type { DiscoveryService } from "../contract/service";
import { readOwnedSegmentVectorsByChat } from "../persistence/embed-store-reads";

const DEFAULT_LIMIT = 10;

/** Bind the similar-chats read over the DI bundle (the verb-naming factory the service composes). */
export function createSimilarChats(ctx: DiscoveryContext): Pick<DiscoveryService, "similarChats"> {
  return { similarChats: (userId, chatId, limit) => similarChats(ctx.db, userId, chatId, limit) };
}

function dominantModel(rows: readonly { readonly model: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.model, (counts.get(r.model) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * The `limit` (default {@link DEFAULT_LIMIT}) chats most like `chatId` by segment-centroid cosine, owner-scoped
 * (present-host belt), self excluded, similarity-descending. Standalone `(db, ownerId, chatId, limit?)` so the
 * service factory + tests call it directly. A target chat the owner doesn't host, or with no segments in its
 * space, ⇒ `[]`.
 *
 * BEST-EFFORT ON A HEAVY LIBRARY, deliberately: the candidate read is capped (`SIMILAR_CHATS_SEG_CAP`, an OOM
 * belt — there is no precomputed per-chat centroid store, so this loads raw segment vectors). Past the cap the
 * neighbour set is the most-RECENT chats, not all of them: an old chat can be missing from the list. Not an
 * error — "more like this" is a browsing affordance with no completeness contract, and the target chat's own
 * rows are ordered first so they are never the rows evicted.
 */
async function similarChats(db: Db, ownerId: UserId, chatId: ChatId, limit = DEFAULT_LIMIT): Promise<SimilarChat[]> {
  const segs = await readOwnedSegmentVectorsByChat(db, ownerId, chatId);

  const targetRows = segs.filter((s) => s.chatId === chatId);
  const targetModel = dominantModel(targetRows);
  if (targetModel === null) {
    return [];
  }

  const bucket = new Map<string, Float32Array[]>();
  const titleByChat = new Map<string, string | null>();
  for (const s of segs) {
    if (s.model !== targetModel) {
      continue;
    }
    let arr = bucket.get(s.chatId);
    if (arr === undefined) {
      arr = [];
      bucket.set(s.chatId, arr);
    }
    arr.push(s.embedding);
    titleByChat.set(s.chatId, s.title);
  }

  const targetVecs = bucket.get(chatId);
  if (targetVecs === undefined || targetVecs.length === 0) {
    return [];
  }
  const targetCentroid = mean(targetVecs);

  const otherIds: string[] = [];
  const otherCentroids: Float32Array[] = [];
  for (const [id, vecs] of bucket) {
    if (id === chatId || vecs.length === 0) {
      continue;
    }
    otherIds.push(id);
    otherCentroids.push(mean(vecs));
  }
  const sims = cosineToMany(targetCentroid, otherCentroids);
  const scored = otherIds.map((id, i) => ({
    chatId: castId<ChatId>(id),
    title: titleByChat.get(id) ?? null,
    similarity: sims[i] ?? 0,
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}
