// domain/search/persistence/scope — chat-memory scope SQL-fragment builders (digests/segments/corpus).
// Fragment builders ONLY, no query execution. Belts always in the WHERE, never a post-filter: SPACE
// (model=?), WITHIN-CHAT or OWNER (derived via characters.ownerId, never chats.ownerId/chat_participants,
// never a users read), and optional CANDIDATES restricting to given block-keys.

import type { BlockKey } from "@orb/contracts/search";
import { characters, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, or } from "drizzle-orm";

interface DigestScopeParams {
  readonly model: string;
  readonly chatIds?: readonly ChatId[] | undefined;
  readonly ownerId?: UserId | undefined;
  readonly scopedCharacterId?: CharacterId | undefined;
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
  const belts: (SQL | undefined)[] = [
    eq(chatSegments.model, params.model),
    inArray(chatSegments.chatId, [...params.chatIds]),
  ];
  if (params.candidates !== undefined) {
    belts.push(
      or(
        ...params.candidates.map((k) =>
          and(eq(chatSegments.chatId, k.chatId), eq(chatSegments.blockIdx, k.blockIdx)),
        ),
      ),
    );
  }
  return and(...belts);
}
