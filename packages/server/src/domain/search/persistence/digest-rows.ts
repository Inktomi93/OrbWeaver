// Ranked digest and segment pools enforce current host scope in SQL before any limit.
import type { BlockKey } from "@orb/contracts/search";
import type { ReadOnlyDb } from "@orb/db";
import { chatDigests, chatParticipants, chatSegments, embedGenerations } from "@orb/db";
import type { CharacterId, ChatDigestId, ChatId, ChatSegmentId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { toVectorBlob } from "./nearest.ts";
import { digestScopeCond, segmentScopeCond } from "./scope.ts";

interface NearestDigest {
  readonly rowId: ChatDigestId;
  readonly generationId: EmbedGenerationId;
  readonly fingerprint: string | null;
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
  readonly generationId?: EmbedGenerationId | undefined;
  readonly chatIds?: readonly ChatId[] | undefined;
  readonly ownerId: UserId;
  readonly scopedCharacterId?: CharacterId | undefined;
  /** By-character cross-chat scope: scoped-producer OR present-as-speaker (the chat_digest_speakers
   *  OR-branch). Current host membership still bounds the pool. */
  readonly speakerCharacterId?: CharacterId | undefined;
  readonly candidates?: readonly BlockKey[] | undefined;
  readonly limit: number;
}

export async function nearestDigests(db: ReadOnlyDb, params: NearestDigestsParams): Promise<NearestDigest[]> {
  const distance = sql<number>`vector_distance_cos(${chatDigests.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      rowId: chatDigests.id,
      generationId: chatDigests.generationId,
      fingerprint: embedGenerations.fingerprint,
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
    .leftJoin(embedGenerations, eq(embedGenerations.id, chatDigests.generationId))
    .where(
      digestScopeCond({
        model: params.model,
        generationId: params.generationId,
        chatIds: params.chatIds,
        ownerId: params.ownerId,
        scopedCharacterId: params.scopedCharacterId,
        speakerCharacterId: params.speakerCharacterId,
        candidates: params.candidates,
      }),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}

/** Current hosted rooms, independent of whether a digest has been indexed. */
export async function hostedChatIds(db: ReadOnlyDb, ownerId: UserId): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, ownerId), eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)));
  return rows.map((row) => row.chatId);
}

/** Segment recall identities come from stored tier-zero digests, never from a fabricated POV. */
export async function segmentBlockKeys(
  db: ReadOnlyDb,
  params: {
    readonly ownerId: UserId;
    readonly model: string;
    readonly generationId?: EmbedGenerationId | undefined;
    readonly segments: readonly { readonly chatId: ChatId; readonly blockIdx: number }[];
  },
): Promise<BlockKey[]> {
  if (params.segments.length === 0) {
    return [];
  }
  return await db
    .select({ chatId: chatDigests.chatId, scopedCharacterId: chatDigests.scopedCharacterId, tier: chatDigests.tier, blockIdx: chatDigests.blockIdx })
    .from(chatDigests)
    .where(
      and(
        digestScopeCond(params),
        eq(chatDigests.tier, 0),
        or(...params.segments.map((segment) => and(eq(chatDigests.chatId, segment.chatId), eq(chatDigests.blockIdx, segment.blockIdx)))),
      ),
    );
}

interface NearestSegment {
  readonly rowId: ChatSegmentId;
  readonly generationId: EmbedGenerationId;
  readonly fingerprint: string | null;
  readonly chunkIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly distance: number;
  readonly hubScore: number | null;
  readonly text: string;
  readonly contentHash: string;
}

interface NearestSegmentsParams {
  readonly ownerId: UserId;
  readonly queryVector: Float32Array;
  readonly model: string;
  readonly generationId?: EmbedGenerationId | undefined;
  readonly chatIds: readonly ChatId[];
  readonly candidates?: readonly BlockKey[] | undefined;
  readonly limit: number;
}

export async function nearestSegments(db: ReadOnlyDb, params: NearestSegmentsParams): Promise<NearestSegment[]> {
  const distance = sql<number>`vector_distance_cos(${chatSegments.embedding}, vector32(${toVectorBlob(params.queryVector)}))`;
  const rows = await db
    .select({
      rowId: chatSegments.id,
      generationId: chatSegments.generationId,
      fingerprint: embedGenerations.fingerprint,
      chunkIdx: chatSegments.chunkIdx,
      seqStart: chatSegments.seqStart,
      seqEnd: chatSegments.seqEnd,
      chatId: chatSegments.chatId,
      blockIdx: chatSegments.blockIdx,
      distance,
      hubScore: chatSegments.hubScore,
      text: chatSegments.text,
      contentHash: chatSegments.contentHash,
    })
    .from(chatSegments)
    .leftJoin(embedGenerations, eq(embedGenerations.id, chatSegments.generationId))
    .where(
      segmentScopeCond({
        ownerId: params.ownerId,
        model: params.model,
        generationId: params.generationId,
        chatIds: params.chatIds,
        candidates: params.candidates,
      }),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}
