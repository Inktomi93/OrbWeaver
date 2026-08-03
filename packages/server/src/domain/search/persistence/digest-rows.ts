// domain/search/persistence/digest-rows — raw chat-memory vector scans. Digest/segment analogues of
// nearest.ts: same vector_distance_cos + vector32(?) F32-blob pattern, same scope-belt-in-the-WHERE
// discipline. Queries only. Owner-scope derives via the digest scan inner-joining characters on
// scopedCharacterId — never chats, never users.

import type { BlockKey } from "@orb/contracts/search";
import type { ReadOnlyDb } from "@orb/db";
import { characters, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, sql } from "drizzle-orm";
import { toVectorBlob } from "./nearest.ts";
import { digestScopeCond, segmentScopeCond } from "./scope.ts";

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
  /** By-character cross-chat scope: scoped-producer OR present-as-speaker (the chat_digest_speakers
   *  OR-branch, PD-38). Owner-belt still applies via the characters join. */
  readonly speakerCharacterId?: CharacterId | undefined;
  readonly candidates?: readonly BlockKey[] | undefined;
  readonly limit: number;
}

export async function nearestDigests(db: ReadOnlyDb, params: NearestDigestsParams): Promise<NearestDigest[]> {
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
        speakerCharacterId: params.speakerCharacterId,
        candidates: params.candidates,
      }),
    )
    .orderBy(distance)
    .limit(params.limit);
  return rows;
}

/** The owner's materialized chat set, bounding discover's verbatim segment scan (which has no owner column).
 *  groupBy yields the distinct set (ReadOnlyDb has no selectDistinct). */
export async function ownedChatIds(db: ReadOnlyDb, ownerId: UserId, model: string): Promise<ChatId[]> {
  const rows = await db
    .select({ chatId: chatDigests.chatId })
    .from(chatDigests)
    .innerJoin(characters, eq(chatDigests.scopedCharacterId, characters.id))
    .where(and(eq(chatDigests.model, model), eq(characters.ownerId, ownerId)))
    .groupBy(chatDigests.chatId);
  return rows.map((r) => r.chatId);
}

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

export async function nearestSegments(db: ReadOnlyDb, params: NearestSegmentsParams): Promise<NearestSegment[]> {
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
