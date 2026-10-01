// Room-derived pools require a current human host before ranking (D16/D20).
import type { BlockKey } from "@orb/contracts/search";
import { chatDigestSpeakers, chatDigests, chatParticipants, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { and, eq, inArray, or, sql } from "drizzle-orm";

interface DigestScopeParams {
  readonly model: string;
  readonly generationId?: EmbedGenerationId | undefined;
  readonly chatIds?: readonly ChatId[] | undefined;
  readonly ownerId: UserId;
  readonly scopedCharacterId?: CharacterId | undefined;
  /** The membership-widened by-character cross-chat scope (D16): match digests this character
   *  egocentrically produced OR co-star blocks where it was merely PRESENT (a `chat_digest_speakers`
   *  row). Filtering on `scopedCharacterId` alone silently drops the co-star blocks. Mutually exclusive
   *  with `scopedCharacterId` (this widens; that narrows). */
  readonly speakerCharacterId?: CharacterId | undefined;
  readonly candidates?: readonly BlockKey[] | undefined;
}

// Current room authority derives from membership, independent of character ownership.
function hostScopeCond(chatId: SQLWrapper, ownerId: UserId): SQL {
  return sql`EXISTS (SELECT 1 FROM ${chatParticipants} WHERE ${chatParticipants.chatId} = ${chatId} AND ${chatParticipants.userId} = ${ownerId} AND ${chatParticipants.kind} = ${"human"} AND ${chatParticipants.role} = ${"host"} AND ${chatParticipants.leftSeq} IS NULL)`;
}

export function digestScopeCond(params: DigestScopeParams): SQL | undefined {
  const belts: (SQL | undefined)[] = [
    eq(chatDigests.model, params.model),
    hostScopeCond(chatDigests.chatId, params.ownerId),
    params.generationId === undefined ? undefined : eq(chatDigests.generationId, params.generationId),
  ];
  if (params.chatIds !== undefined) {
    belts.push(inArray(chatDigests.chatId, [...params.chatIds]));
  }
  if (params.candidates !== undefined) {
    belts.push(
      or(
        ...params.candidates.map((k) =>
          and(
            eq(chatDigests.chatId, k.chatId),
            eq(chatDigests.scopedCharacterId, k.scopedCharacterId),
            eq(chatDigests.tier, k.tier),
            eq(chatDigests.blockIdx, k.blockIdx),
          ),
        ),
      ),
    );
  } else if (params.speakerCharacterId !== undefined) {
    // scoped-producer OR present-as-a-speaker. The EXISTS correlates on the digest's own id, so a group
    // scene where the character spoke but another co-star was the egocentric producer still matches.
    belts.push(
      or(
        eq(chatDigests.scopedCharacterId, params.speakerCharacterId),
        sql`EXISTS (SELECT 1 FROM ${chatDigestSpeakers} WHERE ${chatDigestSpeakers.digestId} = ${chatDigests.id} AND ${chatDigestSpeakers.characterId} = ${params.speakerCharacterId})`,
      ),
    );
  } else if (params.scopedCharacterId !== undefined) {
    belts.push(eq(chatDigests.scopedCharacterId, params.scopedCharacterId));
  }
  return and(...belts);
}

interface SegmentScopeParams {
  readonly ownerId: UserId;
  readonly model: string;
  readonly generationId?: EmbedGenerationId | undefined;
  readonly chatIds: readonly ChatId[];
  readonly candidates?: readonly BlockKey[] | undefined;
}

export function segmentScopeCond(params: SegmentScopeParams): SQL | undefined {
  const belts: (SQL | undefined)[] = [
    eq(chatSegments.model, params.model),
    hostScopeCond(chatSegments.chatId, params.ownerId),
    params.generationId === undefined ? undefined : eq(chatSegments.generationId, params.generationId),
    inArray(chatSegments.chatId, [...params.chatIds]),
  ];
  if (params.candidates !== undefined) {
    belts.push(or(...params.candidates.map((k) => and(eq(chatSegments.chatId, k.chatId), eq(chatSegments.blockIdx, k.blockIdx)))));
  }
  return and(...belts);
}
