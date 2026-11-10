// Room-derived pools require a current human host before ranking (D16/D20).

import { chatDigestSpeakers, chatDigests, chatParticipants, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, EmbedGenerationId, UserId } from "@orb/kit/ids";
import type { BlockKey } from "@orb/kit/recall";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { and, eq, inArray, or, sql } from "drizzle-orm";

/** A producer filter narrows a digest to one POV. The speaker filter includes co-star blocks as well (D16). */
export type DigestScopeParams = {
  readonly model: string;
  readonly generationId?: EmbedGenerationId | undefined;
  readonly chatIds?: readonly ChatId[] | undefined;
  readonly ownerId: UserId;
  readonly candidates?: readonly BlockKey[] | undefined;
} & (
  | { readonly scopedCharacterId?: CharacterId | undefined; readonly speakerCharacterId?: never }
  | { readonly speakerCharacterId: CharacterId; readonly scopedCharacterId?: never }
);

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
}

export function segmentScopeCond(params: SegmentScopeParams): SQL | undefined {
  return and(
    eq(chatSegments.model, params.model),
    hostScopeCond(chatSegments.chatId, params.ownerId),
    params.generationId === undefined ? undefined : eq(chatSegments.generationId, params.generationId),
    inArray(chatSegments.chatId, [...params.chatIds]),
  );
}
