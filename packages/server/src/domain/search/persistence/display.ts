// domain/search/persistence/display — display-enrichment JOINs, queries only.
//
// resolveSegmentDisplay's segment→character credit rule: a chat_segments block carries no character column,
// so a lived-scene segment (chatId, blockIdx) is credited via its tier-0 chat_digests sibling, two ways
// (unioned + deduped): co-star (every real speaker of the block's digests) and scoped-producer fallback
// (the digest's own scopedCharacterId). A block with no tier-0 digest yet cannot be credited (shared
// limitation with corpus).

import type { ReadOnlyDb } from "@orb/db";
import { assets, characterSummaries, characters, chatDigestSpeakers, chatDigests } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, or } from "drizzle-orm";

interface CharacterDisplayRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}

/** Characters not returned (deleted between scan and enrich, or not the caller's) are simply absent. */
export async function resolveCharacterDisplay(db: ReadOnlyDb, ownerId: UserId, characterIds: readonly CharacterId[]): Promise<CharacterDisplayRow[]> {
  if (characterIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      genre: characterSummaries.genre,
      tone: characterSummaries.tone,
      elevatorPitch: characterSummaries.elevatorPitch,
    })
    .from(characters)
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .where(and(eq(characters.ownerId, ownerId), inArray(characters.id, [...characterIds])));
  return rows;
}

interface SegmentCredit {
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}

/** One slot can yield several credits (a group scene's co-stars). */
export async function resolveSegmentDisplay(
  db: ReadOnlyDb,
  ownerId: UserId,
  segments: readonly { readonly chatId: ChatId; readonly blockIdx: number }[],
): Promise<SegmentCredit[]> {
  if (segments.length === 0) {
    return [];
  }
  const blockMatch = or(...segments.map((s) => and(eq(chatDigests.chatId, s.chatId), eq(chatDigests.blockIdx, s.blockIdx))));
  const owned = and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false));
  const displayCols = {
    chatId: chatDigests.chatId,
    blockIdx: chatDigests.blockIdx,
    characterId: characters.id,
    name: characters.name,
    avatarHash: assets.hash,
    genre: characterSummaries.genre,
    tone: characterSummaries.tone,
    elevatorPitch: characterSummaries.elevatorPitch,
  };

  const speakerRows = await db
    .select(displayCols)
    .from(chatDigests)
    .innerJoin(chatDigestSpeakers, eq(chatDigestSpeakers.digestId, chatDigests.id))
    .innerJoin(characters, eq(characters.id, chatDigestSpeakers.characterId))
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .where(and(eq(chatDigests.tier, 0), blockMatch, owned));

  const scopedRows = await db
    .select(displayCols)
    .from(chatDigests)
    .innerJoin(characters, eq(characters.id, chatDigests.scopedCharacterId))
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .where(and(eq(chatDigests.tier, 0), blockMatch, owned));

  // @orb-gate-ignore persistence-no-in-memory-state: query-local dedup Set for segment credit deduplication
  const seen = new Set<string>();
  const credits: SegmentCredit[] = [];
  for (const r of [...speakerRows, ...scopedRows]) {
    const key = `${r.chatId}|${r.blockIdx}|${r.characterId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    credits.push(r);
  }
  return credits;
}
