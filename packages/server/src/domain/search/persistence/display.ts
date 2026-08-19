// domain/search/persistence/display — display-enrichment JOINs, queries only.
//
// resolveSegmentDisplay's segment→character credit rule: a chat_segments block carries no character column,
// so a lived-scene segment (chatId, blockIdx) is credited via its tier-0 chat_digests sibling, two ways
// (unioned + deduped): co-star (every real speaker of the block's digests) and scoped-producer fallback
// (the digest's own scopedCharacterId). A block with no tier-0 digest yet cannot be credited (shared
// limitation with corpus).

import type { ReadOnlyDb } from "@orb/db";
import { assets, characterSummaries, characters, chatDigestSpeakers, chatDigests, chats } from "@orb/db";
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

/** A room's own name, for a hit that came out of it. Title only — the CAST rung of the display chain is
 *  supplied by the hit itself (its scoped/credited character), so this join never reads `chat_participants`. */
interface ChatDisplayRow {
  readonly chatId: ChatId;
  readonly title: string | null;
}

/**
 * The authored titles of the chats a set of hits came from, for the row subtitle (corpus forensics R1a).
 *
 * SCOPE: the caller passes ids that ALREADY came out of an owner-belted scan (the digest scan's
 * characters-join belt, or discover's owned-chat set), so this is a display join over ids the principal has
 * been served, never a lookup that could name a stranger's room — `chats` carries no ownerId to belt against
 * (D18: membership is the scope) and a second membership read here would re-answer a question the scan
 * already answered. An unnamed room stores `""` as often as NULL, so the empty string normalizes to null and
 * the client's ONE title chain (`deriveChatTitle`) decides what an unnamed room reads as.
 */
export async function resolveChatDisplay(db: ReadOnlyDb, chatIds: readonly ChatId[]): Promise<ChatDisplayRow[]> {
  if (chatIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ chatId: chats.id, title: chats.title })
    .from(chats)
    .where(inArray(chats.id, [...chatIds]));
  return rows.map((r) => ({ chatId: r.chatId, title: (r.title ?? "").trim() === "" ? null : r.title }));
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
