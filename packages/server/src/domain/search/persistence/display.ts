// Segment character credit derives from tier-zero digest speakers and scoped producers.
// Uncredited passages remain transcript search results.
import type { ReadOnlyDb } from "@orb/db";
import { assets, characterSummaries, characters, chatDigestSpeakers, chatDigests, chats } from "@orb/db";
import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";
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

interface AvatarOwnerRow {
  readonly assetId: AssetId;
  readonly characterId: CharacterId;
  readonly name: string;
}

/**
 * Which owned character WEARS each of these assets as its avatar — the image hit's destination.
 *
 * An image search returns assets, and an asset on its own is not a place you can go; this is what turns a
 * matched avatar into the door onto that character's dossier (side-eye corpus re-pass U4: the Images target
 * shipped 20 rows styled exactly like the live ones with nowhere to click). An asset NOBODY wears is simply
 * absent from the result, and the caller renders that hit as the preview it honestly is.
 *
 * ONE character per asset: two of an owner's characters may share one avatar blob (D21 dedups within the
 * owner), so the read is deduped on the first row per asset in a stable id order — a hit is one row and can
 * only carry one destination, and silently fanning it out would print the same picture twice.
 */
export async function resolveAvatarOwners(db: ReadOnlyDb, ownerId: UserId, assetIds: readonly AssetId[]): Promise<AvatarOwnerRow[]> {
  if (assetIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ assetId: characters.avatarAssetId, characterId: characters.id, name: characters.name })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false), inArray(characters.avatarAssetId, [...assetIds])))
    .orderBy(characters.id);
  // @orb-waive persistence-no-in-memory-state(Set): query-local dedup Set — one destination per asset. Ends if it outlives the call.
  const seen = new Set<AssetId>();
  const owners: AvatarOwnerRow[] = [];
  for (const row of rows) {
    if (row.assetId === null || seen.has(row.assetId)) {
      continue;
    }
    seen.add(row.assetId);
    owners.push({ assetId: row.assetId, characterId: row.characterId, name: row.name });
  }
  return owners;
}

/** A room's own name, for a hit that came out of it. Title only — the CAST rung of the display chain is
 *  supplied by the hit itself (its scoped/credited character), so this join never reads `chat_participants`. */
interface ChatDisplayRow {
  readonly chatId: ChatId;
  readonly title: string | null;
}

/** Resolve titles only for ids from current-host-authorized source reads or scans (D18).
 * Empty authored titles normalize to null for the client's title chain. */
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

  // @orb-waive persistence-no-in-memory-state(Set): query-local dedup Set for segment credit deduplication. Ends if it outlives the call.
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
