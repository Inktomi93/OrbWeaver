// domain/search/persistence/digest-rows — the raw chat-memory vector scans (row shapes + fetch
// helpers). The digest/segment analogues of `nearest.ts`: the SAME `vector_distance_cos` + `vector32(?)` F32-blob pattern,
// the SAME scope-belt-in-the-WHERE discipline (never a post-filter). Queries ONLY; no business logic. The
// `vector_distance_cos` SQL appears here and in `nearest.ts` ONLY (invariant #1).
//
// Row shapes are file-local + inferred (no exported persistence type — `no-inline-types`); the verbs consume
// them by inference and build the `BlockKey`s. Owner-scope DERIVES (D20): the digest scan INNER-JOINs
// `characters` on `scopedCharacterId` so the owner belt resolves via the producer card — never `chats`
// (D18), never `users`.

import type { BlockKey } from "@orb/contracts/search";
import type { ReadOnlyDb } from "@orb/db";
import { characters, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import { toVectorBlob } from "./nearest";
import { digestScopeCond, segmentScopeCond } from "./scope";

/** One digest-lens neighbour: the full block key columns + raw cosine distance + advisory hub + the
 *  rerankable digest `text` + the collapse `contentHash` + the lexical `keywords`. */
interface NearestDigest {
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly tier: number;
  readonly blockIdx: number;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly text: string;
  readonly contentHash: string;
  readonly keywords: readonly string[];
}

interface NearestDigestsParams {
  readonly queryVector: Float32Array;
  readonly model: string;
  readonly chatIds?: readonly ChatId[] | undefined;
  readonly ownerId?: UserId | undefined;
  readonly scopedCharacterId?: CharacterId | undefined;
  readonly candidates?: readonly BlockKey[] | undefined;
  readonly limit: number;
}

/** The closest digest blocks (ascending raw distance) in `model`'s space, scoped per the belts. CSLS
 *  hub-adjust + minScore + optional rerank happen in the verb over these rows. */
export async function nearestDigests(
  db: ReadOnlyDb,
  params: NearestDigestsParams,
): Promise<NearestDigest[]> {
  const distance = sql<number>`vector_distance_cos(${chatDigests.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      chatId: chatDigests.chatId,
      scopedCharacterId: chatDigests.scopedCharacterId,
      tier: chatDigests.tier,
      blockIdx: chatDigests.blockIdx,
      distance,
      hubScore: chatDigests.hubScore,
      text: chatDigests.text,
      contentHash: chatDigests.contentHash,
      keywords: chatDigests.keywords,
    })
    .from(chatDigests)
    .innerJoin(characters, eq(chatDigests.scopedCharacterId, characters.id))
    .where(
      digestScopeCond({
        model: params.model,
        chatIds: params.chatIds,
        ownerId: params.ownerId,
        scopedCharacterId: params.scopedCharacterId,
        candidates: params.candidates,
      }),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows.map((r) => ({ ...r, keywords: r.keywords ?? [] }));
}

/** The owner's MATERIALIZED chat set — the distinct chats that hold a digest owned by `ownerId` in `model`'s
 *  space (owner DERIVES via the producer card: `chat_digests.scopedCharacterId` FKs `characters.id`, whose
 *  `ownerId` is the owner — D20; NO `chats.ownerId` (D18), NO `chat_participants`). `discover`'s verbatim
 *  segment scan (the segment lens carries no owner column) is bounded to this set. `groupBy` yields the
 *  distinct set (`ReadOnlyDb` has no `selectDistinct`). */
export async function ownedChatIds(
  db: ReadOnlyDb,
  ownerId: UserId,
  model: string,
): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatDigests.chatId })
    .from(chatDigests)
    .innerJoin(characters, eq(chatDigests.scopedCharacterId, characters.id))
    .where(and(eq(chatDigests.model, model), eq(characters.ownerId, ownerId)))
    .groupBy(chatDigests.chatId);
  return rows.map((r) => r.chatId);
}

/** One segment-lens neighbour: the chat + block + raw cosine distance + advisory hub + the verbatim `text`
 *  + the collapse `contentHash`. The verbatim lens carries no tier/scopedCharacterId column. */
interface NearestSegment {
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly text: string;
  readonly contentHash: string;
}

interface NearestSegmentsParams {
  readonly queryVector: Float32Array;
  readonly model: string;
  readonly chatIds: readonly ChatId[];
  readonly candidates?: readonly BlockKey[] | undefined;
  readonly limit: number;
}

/** The closest verbatim segment blocks (ascending raw distance) in `model`'s space, scoped to `chatIds`. */
export async function nearestSegments(
  db: ReadOnlyDb,
  params: NearestSegmentsParams,
): Promise<NearestSegment[]> {
  const distance = sql<number>`vector_distance_cos(${chatSegments.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      chatId: chatSegments.chatId,
      blockIdx: chatSegments.blockIdx,
      distance,
      hubScore: chatSegments.hubScore,
      text: chatSegments.text,
      contentHash: chatSegments.contentHash,
    })
    .from(chatSegments)
    .where(
      segmentScopeCond({
        model: params.model,
        chatIds: params.chatIds,
        candidates: params.candidates,
      }),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}
