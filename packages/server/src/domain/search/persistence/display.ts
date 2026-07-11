// domain/search/persistence/display — the display-enrichment JOINs. Queries ONLY (returns rows; the
// verb keys them).
//
// `resolveCharacterDisplay` enriches character-card hits with the distilled facets `discovery` writes to
// `character_summaries` (genre / tone / elevatorPitch — D28: read off the FLAT character row's summary,
// no version join) + the avatar CAS hash. Reading `discovery`'s output table via `@orb/db` is a DOWNWARD
// schema dep (allowed — reading discovery's output TABLE, not its module); it is NOT a sideways domain import.
// Owner-scoped in the WHERE (the hits are already owner-scoped, but the enrichment re-asserts it so a
// crafted id list can never read across owners). Never reads the `users` table.
//
// `resolveSegmentDisplay` (PD-35) — the SEGMENT→CHARACTER credit rule for `discover`. A `chat_segments` block
// carries NO character column (D28 dropped it), so a lived-scene segment `(chatId, blockIdx)` is credited via
// its tier-0 `chat_digests` sibling (same key). TWO credit sources, unioned + deduped:
//   • CO-STAR — every real speaker of the block's tier-0 digests (`chat_digest_speakers`, the join whose
//     schema header names this exact consumer): a GROUP-scene block credits EVERY character present, not just
//     the egocentric producer, so a co-star's moment surfaces them too.
//   • SCOPED-PRODUCER FALLBACK — the digest's `scopedCharacterId` (a solo block's real cast char; also the
//     backstop for early digests written before the speakers join was populated — the group-as-character
//     synthetic id is a real FK but `synthetic=true`, so it is filtered out here, never credited).
// Both sources filter `characters.synthetic=false` + re-assert `characters.ownerId` (D20). A block with no
// tier-0 digest yet cannot be credited — the known, documented limitation shared with `corpus`.

import type { ReadOnlyDb } from "@orb/db";
import { assets, characterSummaries, characters, chatDigestSpeakers, chatDigests } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, or } from "drizzle-orm";

/** One display row — the facets + avatar for a single owned character. File-local — the verb consumes it
 *  by inference and builds the id→row lookup (no exported persistence type; `no-inline-types`). */
interface CharacterDisplayRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly elevatorPitch: string | null;
}

/**
 * Resolve the display facets for a set of owned characters. Characters not returned (deleted between scan
 * and enrich, or not the caller's) are simply absent — the verb skips them. `character_summaries` is
 * LEFT-joined: a card with no computed summary yet yields `null` facets.
 */
export async function resolveCharacterDisplay(
  db: ReadOnlyDb,
  ownerId: UserId,
  characterIds: readonly CharacterId[],
): Promise<CharacterDisplayRow[]> {
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

/** One segment→character credit — the segment's `(chatId, blockIdx)` slot + the credited character's display
 *  facets. File-local — `discover` keys these by slot and groups by `characterId` (`no-inline-types`). */
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

/**
 * Resolve the credited character(s) + display for a set of lived-scene segment slots (the `discover` credit
 * rule — see the file header). Each `(chatId, blockIdx)` is joined to its tier-0 `chat_digests` sibling, then
 * credited two ways (co-star speakers ∪ scoped-producer fallback), owner-belted + `synthetic=false`, and
 * deduped by `(chatId, blockIdx, characterId)`. A slot whose block has no tier-0 digest yet is absent (the
 * documented shared-with-`corpus` limitation). One slot can yield SEVERAL credits (a group scene's co-stars).
 */
export async function resolveSegmentDisplay(
  db: ReadOnlyDb,
  ownerId: UserId,
  segments: readonly { readonly chatId: ChatId; readonly blockIdx: number }[],
): Promise<SegmentCredit[]> {
  if (segments.length === 0) {
    return [];
  }
  const blockMatch = or(
    ...segments.map((s) =>
      and(eq(chatDigests.chatId, s.chatId), eq(chatDigests.blockIdx, s.blockIdx)),
    ),
  );
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

  // CO-STAR credit: every real speaker of the block's tier-0 digests.
  const speakerRows = await db
    .select(displayCols)
    .from(chatDigests)
    .innerJoin(chatDigestSpeakers, eq(chatDigestSpeakers.digestId, chatDigests.id))
    .innerJoin(characters, eq(characters.id, chatDigestSpeakers.characterId))
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .where(and(eq(chatDigests.tier, 0), blockMatch, owned));

  // SCOPED-PRODUCER fallback: the digest's own scoped char (solo blocks + pre-speakers-join digests).
  const scopedRows = await db
    .select(displayCols)
    .from(chatDigests)
    .innerJoin(characters, eq(characters.id, chatDigests.scopedCharacterId))
    .leftJoin(assets, eq(characters.avatarAssetId, assets.id))
    .leftJoin(characterSummaries, eq(characterSummaries.characterId, characters.id))
    .where(and(eq(chatDigests.tier, 0), blockMatch, owned));

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
