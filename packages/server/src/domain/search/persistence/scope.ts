// domain/search/persistence/scope — chat-memory scope SQL-fragment builders (digests/segments/corpus).
// Fragment builders ONLY, no query execution. Belts always in the WHERE, never a post-filter: SPACE
// (model=?), WITHIN-CHAT or OWNER (derived via characters.ownerId, never chats.ownerId/chat_participants,
// never a users read), and optional CANDIDATES restricting to given block-keys.

import type { BlockKey } from "@orb/contracts/search";
import { characters, chatDigestSpeakers, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, or, sql } from "drizzle-orm";

interface DigestScopeParams {
  readonly model: string;
  readonly chatIds?: readonly ChatId[] | undefined;
  readonly ownerId?: UserId | undefined;
  readonly scopedCharacterId?: CharacterId | undefined;
  /** The membership-widened by-character cross-chat scope (D16, PD-38): match digests this character
   *  egocentrically produced OR co-star blocks where it was merely PRESENT (a `chat_digest_speakers`
   *  row). Filtering on `scopedCharacterId` alone silently drops the co-star blocks. Mutually exclusive
   *  with `scopedCharacterId` (this widens; that narrows). */
  readonly speakerCharacterId?: CharacterId | undefined;
  readonly candidates?: readonly BlockKey[] | undefined;
}

/** The scan MUST inner-join `characters` on `scopedCharacterId` so the owner belt resolves. */
export function digestScopeCond(params: DigestScopeParams): SQL | undefined {
  const belts: (SQL | undefined)[] = [eq(chatDigests.model, params.model)];
  if (params.chatIds !== undefined) {
    belts.push(inArray(chatDigests.chatId, [...params.chatIds]));
  }
  if (params.ownerId !== undefined) {
    belts.push(eq(characters.ownerId, params.ownerId));
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
  readonly model: string;
  readonly chatIds: readonly ChatId[];
  readonly candidates?: readonly BlockKey[] | undefined;
}

export function segmentScopeCond(params: SegmentScopeParams): SQL | undefined {
  const belts: (SQL | undefined)[] = [eq(chatSegments.model, params.model), inArray(chatSegments.chatId, [...params.chatIds])];
  if (params.candidates !== undefined) {
    belts.push(or(...params.candidates.map((k) => and(eq(chatSegments.chatId, k.chatId), eq(chatSegments.blockIdx, k.blockIdx)))));
  }
  return and(...belts);
}
