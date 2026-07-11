// domain/discovery/persistence/embed-store-reads — the READ-ONLY SELECTs over the embeddings vector store
// (the four primary tables owned by `embeddings`) that discovery's in-RAM analytics cluster over. This is a
// DOWNWARD, read-only dep into `@orb/db/schema/embeddings` — allowed (reads the store read-only — the same
// posture `search` has). discovery embeds NOTHING and writes no
// vector row here — the table NAMES appear ONLY in this file; the hub-score WRITE is the injected
// `embeddings.writeHubScores` seam, never a `db.update` here.
//
// OWNER DERIVATION (D20/D23): the vector rows carry NO ownerId. Character scope derives via
// `characters.ownerId` (D23); digest scope derives via `digest → chat → host` — the host is the ONE chat
// authority (D18: chats have no ownerId; the PRESENT `chat_participants` row with `kind='human' AND
// role='host' AND leftSeq IS NULL` — a departed ex-host row coexists with the successor after a
// handoff-via-leave and must NOT re-attribute the digest).
// Reading `chat_participants`/`characters` is a downward @orb/db read, NOT a sibling-domain runtime import.
//
// Hub passes are ALWAYS OWNER-SCOPED (owner ruling: csls analyzes YOUR OWN library only — never against
// another owner's vectors); every hub read derives + filters the owner (character→characters.ownerId,
// digest/segment→the present host, image→assets.ownerId), and the BULK pass FANS OUT over `distinct*HubOwners`
// — there is no cross-tenant whole-space read.

import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characters,
  chatDigests,
  chatParticipants,
  chatSegments,
  chats,
  digestThemeAssignments,
  imageEmbeddings,
} from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatDigestId,
  ChatId,
  ThemeClusterId,
  UserId,
} from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

// A tier-0 digest's keyword material for the cooccurrence pass — owner (host) + the witnessing character
// (scopedCharacterId, ALWAYS a real card FK — schema/embeddings.ts) + contentHash (fork collapse) + the raw
// keywords. File-local (consumers infer it — the persistence-row `no-inline-types` posture).
interface DigestKeywordRow {
  readonly ownerId: UserId;
  readonly scopedCharacterId: CharacterId;
  readonly contentHash: string;
  readonly keywords: string[];
}

// ── row shapes (file-local; consumers infer them — no exported persistence type, `no-inline-types`) ────

// A card embedding tagged with its owner (via characters.ownerId) — the within-owner near-dup pass.
interface OwnedCharacterVector {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

// A bare vector row for an owner-scoped hub pass (id is the row PK; model is the space tag).
interface HubVector {
  readonly id: string;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

// A digest vector for the hub pass — additionally carries tier (digests group per (tier, space), #5).
interface DigestHubVector extends HubVector {
  readonly tier: number;
}

// A solo digest vector tagged with its owner (host) + group flag + level inputs + the naming material
// (keywords + topic anchor) — the theme pass.
interface OwnedDigestVector {
  readonly digestId: ChatDigestId;
  readonly ownerId: UserId;
  readonly isGroup: boolean;
  readonly tier: number;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly keywords: string[];
  readonly topicAnchor: string | null;
}

// ── duplicate-character pass ──────────────────────────────────────────────────
/** Every card embedding with its owner — EXCLUDING synthetic (per-room group) characters (they have no real
 *  card text and would pollute character similarity). The recompute groups these
 *  by (ownerId, model) for the within-owner, within-space all-pairs scan. */
export async function readOwnedCharacterVectors(
  db: Db,
  ownerId?: UserId | null,
): Promise<OwnedCharacterVector[]> {
  // `ownerId` scopes the read to ONE owner (the SINGULAR find-duplicates); omitted/null = every owner (BULK).
  const scope =
    ownerId === undefined || ownerId === null
      ? eq(characters.synthetic, false)
      : and(eq(characters.synthetic, false), eq(characters.ownerId, ownerId));
  return await db
    .select({
      characterId: characterEmbeddings.characterId,
      ownerId: characters.ownerId,
      model: characterEmbeddings.model,
      embedding: characterEmbeddings.embedding,
      contentHash: characterEmbeddings.contentHash,
    })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
    .where(scope);
}

// ── hub passes (ALWAYS owner-scoped — csls analyzes YOUR OWN library only; there is NO cross-tenant read,
//    ever. bulk mode is a per-owner FAN-OUT over `distinct*HubOwners`, never a whole-space read; the owner
//    derives per producer: character→`characters.ownerId`, digest/segment→the PRESENT chat host, image→
//    `assets.ownerId` — the same derivation the theme/duplicate reads use). ────────────────────────────────

/** ONE owner's card embeddings as hub rows (owner via `characters.ownerId`) — the owner-local hub space. */
export async function readCharacterHubVectors(db: Db, ownerId: UserId): Promise<HubVector[]> {
  return await db
    .select({
      id: characterEmbeddings.id,
      model: characterEmbeddings.model,
      embedding: characterEmbeddings.embedding,
      contentHash: characterEmbeddings.contentHash,
    })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
    .where(eq(characters.ownerId, ownerId));
}

/** ONE owner's digest embeddings as hub rows, carrying `tier` (owner = the present chat host). */
export async function readDigestHubVectors(db: Db, ownerId: UserId): Promise<DigestHubVector[]> {
  return await db
    .select({
      id: chatDigests.id,
      model: chatDigests.model,
      tier: chatDigests.tier,
      embedding: chatDigests.embedding,
      contentHash: chatDigests.contentHash,
    })
    .from(chatDigests)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatDigests.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    );
}

/** ONE owner's verbatim segment embeddings as hub rows (owner = the present chat host, via `chatId`). */
export async function readSegmentHubVectors(db: Db, ownerId: UserId): Promise<HubVector[]> {
  return await db
    .select({
      id: chatSegments.id,
      model: chatSegments.model,
      embedding: chatSegments.embedding,
      contentHash: chatSegments.contentHash,
    })
    .from(chatSegments)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatSegments.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    );
}

/** ONE owner's image embeddings as hub rows (owner via `assets.ownerId`); image↔image hub ONLY (#2). */
export async function readImageHubVectors(db: Db, ownerId: UserId): Promise<HubVector[]> {
  return await db
    .select({
      id: imageEmbeddings.id,
      model: imageEmbeddings.model,
      embedding: imageEmbeddings.embedding,
      contentHash: imageEmbeddings.contentHash,
    })
    .from(imageEmbeddings)
    .innerJoin(assets, eq(imageEmbeddings.assetId, assets.id))
    .where(eq(assets.ownerId, ownerId));
}

// ── distinct-owner enumerations (the BULK csls fan-out universe — the owners who HAVE rows in each table) ──
/** Distinct owners with card embeddings (via `characters.ownerId`). */
export async function distinctCharacterHubOwners(db: Db): Promise<UserId[]> {
  const rows = await db
    .selectDistinct({ ownerId: characters.ownerId })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characterEmbeddings.characterId, characters.id));
  return rows.map((r) => r.ownerId);
}

/** Distinct present-host owners with digest embeddings. */
export async function distinctDigestHubOwners(db: Db): Promise<UserId[]> {
  const rows = await db
    .selectDistinct({ ownerId: chatParticipants.userId })
    .from(chatDigests)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatDigests.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return rows.flatMap((r) => (r.ownerId === null ? [] : [r.ownerId]));
}

/** Distinct present-host owners with segment embeddings. */
export async function distinctSegmentHubOwners(db: Db): Promise<UserId[]> {
  const rows = await db
    .selectDistinct({ ownerId: chatParticipants.userId })
    .from(chatSegments)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatSegments.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return rows.flatMap((r) => (r.ownerId === null ? [] : [r.ownerId]));
}

/** Distinct owners with image embeddings (via `assets.ownerId`). */
export async function distinctImageHubOwners(db: Db): Promise<UserId[]> {
  const rows = await db
    .selectDistinct({ ownerId: assets.ownerId })
    .from(imageEmbeddings)
    .innerJoin(assets, eq(imageEmbeddings.assetId, assets.id));
  return rows.map((r) => r.ownerId);
}

// ── theme pass ────────────────────────────────────────────────────────────────
/** Every digest embedding tagged with its OWNER (the chat's `kind='human' AND role='host'` participant) +
 *  `isGroup` + `tier` + space — the theme clustering inputs. The recompute filters `isGroup=0` for solo
 *  clustering (a room's digests belong to the synthetic group character, not the host's theme space, #13)
 *  and buckets by level (`scene` = tier 0, `arc` = tier ≥ 1). The join demands the PRESENT host
 *  (`leftSeq IS NULL`) — mirroring the exportChat belt + canonical `requireHost`: a host who left after a
 *  handoff-via-leave leaves a DEPARTED `role='host'` row behind (sole-host leave archives, never demotes;
 *  a handoff demotes only the PRESENT host, D18), and that stale row must NOT re-attribute the digest to the
 *  ex-host (it would duplicate the digest into their discovery/theme space). A real chat always has exactly
 *  one present host, so the join drops nothing for a live chat. */
export async function readOwnedDigestVectors(
  db: Db,
  ownerId?: UserId | null,
): Promise<OwnedDigestVector[]> {
  // `ownerId` scopes the read to ONE owner's HOSTED chats (the SINGULAR compute-themes); omitted/null = every
  // owner (BULK). Added to the SAME present-host join predicate, so a departed ex-host still can't leak in.
  const hostJoin =
    ownerId === undefined || ownerId === null
      ? and(
          eq(chatParticipants.chatId, chatDigests.chatId),
          eq(chatParticipants.kind, "human"),
          eq(chatParticipants.role, "host"),
          isNull(chatParticipants.leftSeq),
        )
      : and(
          eq(chatParticipants.chatId, chatDigests.chatId),
          eq(chatParticipants.kind, "human"),
          eq(chatParticipants.role, "host"),
          eq(chatParticipants.userId, ownerId),
          isNull(chatParticipants.leftSeq),
        );
  return await db
    .select({
      digestId: chatDigests.id,
      ownerId: chatParticipants.userId,
      isGroup: chatDigests.isGroup,
      tier: chatDigests.tier,
      model: chatDigests.model,
      embedding: chatDigests.embedding,
      contentHash: chatDigests.contentHash,
      keywords: chatDigests.keywords,
      topicAnchor: chatDigests.topicAnchor,
    })
    .from(chatDigests)
    .innerJoin(chatParticipants, hostJoin)
    .then((rows) =>
      rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])),
    );
}

// ── cooccurrence pass ───────────────────────────────────────────────────────
/** Every TIER-0 digest's keyword material tagged with its OWNER (the present chat host) + the witnessing
 *  `scopedCharacterId` + `contentHash` — the keyword×keyword cooccurrence + per-character keyword-profile
 *  inputs. TIER-0 LEAVES only (mixing consolidation tiers double-counts a scene); the same present-host join
 *  (`leftSeq IS NULL`) the theme/hub reads use (a departed ex-host must not re-attribute the digest, D18).
 *  `ownerId` scopes to ONE owner's hosted chats (SINGULAR); omitted/null = every owner (BULK). */
export async function readOwnedDigestKeywords(
  db: Db,
  ownerId?: UserId | null,
): Promise<DigestKeywordRow[]> {
  const hostJoin =
    ownerId === undefined || ownerId === null
      ? and(
          eq(chatParticipants.chatId, chatDigests.chatId),
          eq(chatParticipants.kind, "human"),
          eq(chatParticipants.role, "host"),
          isNull(chatParticipants.leftSeq),
        )
      : and(
          eq(chatParticipants.chatId, chatDigests.chatId),
          eq(chatParticipants.kind, "human"),
          eq(chatParticipants.role, "host"),
          eq(chatParticipants.userId, ownerId),
          isNull(chatParticipants.leftSeq),
        );
  return await db
    .select({
      ownerId: chatParticipants.userId,
      scopedCharacterId: chatDigests.scopedCharacterId,
      contentHash: chatDigests.contentHash,
      keywords: chatDigests.keywords,
    })
    .from(chatDigests)
    .innerJoin(chatParticipants, hostJoin)
    .where(eq(chatDigests.tier, 0))
    .then((rows) =>
      rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])),
    );
}

// ── chat near-dup arm (Jaccard of segment content-hashes + fork lineage) ─────
// A present-host predicate factory for the owner-scope join (a departed ex-host must not re-attribute — D18).
function segmentHostJoin(
  chatIdCol: typeof chatSegments.chatId,
  ownerId?: UserId | null,
): ReturnType<typeof and> {
  const common = [
    eq(chatParticipants.kind, "human"),
    eq(chatParticipants.role, "host"),
    isNull(chatParticipants.leftSeq),
  ];
  return ownerId === undefined || ownerId === null
    ? and(eq(chatParticipants.chatId, chatIdCol), ...common)
    : and(eq(chatParticipants.chatId, chatIdCol), eq(chatParticipants.userId, ownerId), ...common);
}

// One owner's chat segment content-hash (the Jaccard set element). File-local (consumers infer it).
interface ChatSegmentHash {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly contentHash: string;
}

/** Every VERBATIM segment content-hash of the owner's HOSTED chats — the Jaccard set elements for the chat
 *  near-dup arm (a per-chat set of block content-hashes; two chats sharing block hashes are near-dups). The
 *  same present-host derivation the theme/hub reads use. `ownerId` = ONE owner (SINGULAR); null = every owner. */
export async function readOwnedChatSegmentHashes(
  db: Db,
  ownerId?: UserId | null,
): Promise<ChatSegmentHash[]> {
  return await db
    .select({
      ownerId: chatParticipants.userId,
      chatId: chatSegments.chatId,
      contentHash: chatSegments.contentHash,
    })
    .from(chatSegments)
    .innerJoin(chatParticipants, segmentHostJoin(chatSegments.chatId, ownerId))
    .then((rows) =>
      rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])),
    );
}

// One owner's chat lineage edge (chatId → its parentChatId, null = a root). File-local.
interface ChatLineageEdge {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly parentChatId: ChatId | null;
}

/** Every HOSTED chat of the owner with its fork parent (`chats.parentChatId`, D27) — the fork-family lineage
 *  the near-dup arm walks (`substrate/fork-roots`) to label a pair `forked` vs `duplicate`. Present-host
 *  derived. `ownerId` = ONE owner (SINGULAR); null = every owner. */
export async function readOwnedChatLineage(
  db: Db,
  ownerId?: UserId | null,
): Promise<ChatLineageEdge[]> {
  const common = [
    eq(chatParticipants.kind, "human"),
    eq(chatParticipants.role, "host"),
    isNull(chatParticipants.leftSeq),
  ];
  const hostJoin =
    ownerId === undefined || ownerId === null
      ? and(eq(chatParticipants.chatId, chats.id), ...common)
      : and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, ownerId), ...common);
  return await db
    .select({
      ownerId: chatParticipants.userId,
      chatId: chats.id,
      parentChatId: chats.parentChatId,
    })
    .from(chats)
    .innerJoin(chatParticipants, hostJoin)
    .then((rows) =>
      rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])),
    );
}

// One tier-0 ASSIGNED digest mapped back to its verbatim seq-span (the segment at the same (chatId, blockIdx)).
// The PD-39 msgMidAt backfill's median-message input. File-local (consumers infer it).
interface Tier0DigestSpan {
  readonly digestId: ChatDigestId;
  readonly chatId: ChatId;
  readonly seqStart: number;
  readonly seqEnd: number;
}

/** Every tier-0 digest that HAS a theme assignment, mapped to its verbatim seq-span via the `chat_segments`
 *  row at the same `(chatId, blockIdx)` — the PD-39 msgMidAt backfill input (themes/backfill.ts). `ownerId`
 *  scopes to ONE owner's HOSTED chats (present-host, D18); omitted/null = every owner's tier-0 assignments.
 *  This is the sanctioned discovery/persistence analytics read of the vector-store tables (chat_digests +
 *  chat_segments); the compute (themes/backfill.ts) never imports a vector-table symbol directly. */
export async function readTier0DigestSpans(
  db: Db,
  ownerId?: UserId | null,
): Promise<Tier0DigestSpan[]> {
  const base = db
    .selectDistinct({
      digestId: chatDigests.id,
      chatId: chatDigests.chatId,
      seqStart: chatSegments.seqStart,
      seqEnd: chatSegments.seqEnd,
    })
    .from(digestThemeAssignments)
    .innerJoin(chatDigests, eq(chatDigests.id, digestThemeAssignments.digestId))
    .innerJoin(
      chatSegments,
      and(
        eq(chatSegments.chatId, chatDigests.chatId),
        eq(chatSegments.blockIdx, chatDigests.blockIdx),
      ),
    );
  if (ownerId === undefined || ownerId === null) {
    return await base.where(eq(chatDigests.tier, 0));
  }
  // SINGULAR: only this owner's HOSTED chats (a departed ex-host must not re-attribute — D18).
  return await base
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatDigests.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .where(eq(chatDigests.tier, 0));
}

// ── composed views (home coverage + theme-detail members/timeline) ───────────
/** Corpus COVERAGE — how much of the owner's library is indexed (catalog size + memory-substrate depth). NOT
 *  usage (that's stats). `characters` = the owner's non-synthetic cards; `digests`/`segments` = the owner's
 *  present-hosted chat vector rows. */
export async function readCorpusCoverage(
  db: Db,
  ownerId: UserId,
): Promise<{ characters: number; digests: number; segments: number }> {
  const hosted = and(
    eq(chatParticipants.kind, "human"),
    eq(chatParticipants.role, "host"),
    eq(chatParticipants.userId, ownerId),
    isNull(chatParticipants.leftSeq),
  );
  const [chars, digests, segments] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(characters)
      .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false))),
    db
      .select({ n: sql<number>`count(${chatDigests.id})` })
      .from(chatDigests)
      .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chatDigests.chatId), hosted)),
    db
      .select({ n: sql<number>`count(${chatSegments.id})` })
      .from(chatSegments)
      .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chatSegments.chatId), hosted)),
  ]);
  return {
    characters: chars[0]?.n ?? 0,
    digests: digests[0]?.n ?? 0,
    segments: segments[0]?.n ?? 0,
  };
}

/** The characters most present in a theme cluster — each witnessing character's digest count in the cluster,
 *  descending. Owner scope is implicit: the caller resolved `themeClusterId` from the owner's theme list. */
export async function readThemeClusterMembers(
  db: Db,
  themeClusterId: ThemeClusterId,
  limit: number,
): Promise<{ characterId: CharacterId; name: string; count: number }[]> {
  return await db
    .select({
      characterId: chatDigests.scopedCharacterId,
      name: characters.name,
      count: sql<number>`count(*)`,
    })
    .from(digestThemeAssignments)
    .innerJoin(chatDigests, eq(chatDigests.id, digestThemeAssignments.digestId))
    .innerJoin(characters, eq(characters.id, chatDigests.scopedCharacterId))
    .where(
      and(
        eq(digestThemeAssignments.themeClusterId, themeClusterId),
        eq(characters.synthetic, false),
      ),
    )
    .groupBy(chatDigests.scopedCharacterId, characters.name)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}

/** A theme cluster's story-time timeline — assigned-digest count per `YYYY-MM` `msgMidAt` bucket, ascending
 *  (null-stamped assignments are skipped; see PD-39). */
export async function readThemeClusterTimeline(
  db: Db,
  themeClusterId: ThemeClusterId,
): Promise<{ bucket: string; count: number }[]> {
  const bucket = sql<string>`strftime('%Y-%m', ${digestThemeAssignments.msgMidAt} / 1000, 'unixepoch')`;
  return await db
    .select({ bucket, count: sql<number>`count(*)` })
    .from(digestThemeAssignments)
    .where(
      and(
        eq(digestThemeAssignments.themeClusterId, themeClusterId),
        isNotNull(digestThemeAssignments.msgMidAt),
      ),
    )
    .groupBy(bucket)
    .orderBy(asc(bucket));
}

// ── image analytics (the AVATAR-lens reads; SHARED_AVATAR_MIN_REFS exclusion) ─
// A "shared/default avatar" = one asset that is the CURRENT avatar of ≥ this many of the owner's characters.
// CAS dedups by content hash, so a byte-identical placeholder collapses to ONE asset referenced by N cards — a
// generic silhouette is exactly a high-reference-count avatar. It represents no one character, so it pollutes
// cross-modal alignment + facet distributions and is EXCLUDED (image-analytics design that must survive).
export const SHARED_AVATAR_MIN_REFS = 3;

// The image lens whose embedding is the PURE visual vector (image↔image + cross-modal cosine). The
// `image-captioned` lens carries the caption/caption_meta; the `image-raw` lens carries the visual embedding.
const IMAGE_VECTOR_LENS = "image-raw";
const IMAGE_CAPTION_LENS = "image-captioned";

// The owner's shared/default avatar asset ids (≥ SHARED_AVATAR_MIN_REFS references) — excluded from every
// image-analytics read (they represent no one character). Pre-queried to an array (a NOT IN subquery over the
// same `characters` table would need aliasing; `notInArray([])` is a no-op the callers guard).
async function sharedAvatarAssetIds(db: Db, ownerId: UserId): Promise<AssetId[]> {
  const rows = await db
    .select({ id: characters.avatarAssetId })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), isNotNull(characters.avatarAssetId)))
    .groupBy(characters.avatarAssetId)
    .having(gte(sql<number>`count(*)`, SHARED_AVATAR_MIN_REFS));
  return rows.flatMap((r) => (r.id === null ? [] : [r.id]));
}

// AND the shared-avatar exclusion into a WHERE only when there IS a shared avatar (notInArray([]) is invalid).
function excludeShared(shared: readonly AssetId[]): SQL | undefined {
  return shared.length === 0 ? undefined : notInArray(characters.avatarAssetId, [...shared]);
}

// One owner avatar's visual vector tagged with its character (the image↔image analytics input). File-local.
interface AvatarVector {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string;
  readonly model: string;
  readonly embedding: Float32Array;
}

/** Every non-synthetic owner character's CURRENT-avatar visual vector (`image-raw` lens), EXCLUDING shared/
 *  default avatars. The image-duplicates + visual-archetypes input (grouped per model by the caller — an
 *  image↔image cosine is only meaningful within one embedding space). */
export async function readOwnedAvatarVectors(db: Db, ownerId: UserId): Promise<AvatarVector[]> {
  const shared = await sharedAvatarAssetIds(db, ownerId);
  return await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      model: imageEmbeddings.model,
      embedding: imageEmbeddings.embedding,
    })
    .from(imageEmbeddings)
    .innerJoin(characters, eq(characters.avatarAssetId, imageEmbeddings.assetId))
    .innerJoin(assets, eq(assets.id, imageEmbeddings.assetId))
    .where(
      and(
        eq(characters.ownerId, ownerId),
        eq(characters.synthetic, false),
        eq(imageEmbeddings.lens, IMAGE_VECTOR_LENS),
        excludeShared(shared),
      ),
    );
}

// One character's cross-modal portrait row — the card-text vector + the avatar visual vector (SAME model
// space). The paired-cosine alignment input; the verb merges caption facets by characterId. File-local.
interface PortraitPair {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string;
  readonly cardVec: Float32Array;
  readonly imageVec: Float32Array;
}

/** Every non-synthetic owner character with BOTH a card-text vector AND an `image-raw` avatar vector in the
 *  SAME model space (the unified Qwen3-VL space), EXCLUDING shared avatars — the cross-modal portrait-alignment
 *  input. Alignment is a PAIRED cosine computed IN-RAM by the verb (`@orb/kit/vector-math`), NEVER a
 *  `vector_distance_cos` SQL (that is search-only). Caption facets (rating/artStyle) are merged by the verb
 *  from `readOwnedCaptionRows` (a plain characterId join). */
export async function readOwnedPortraitPairs(db: Db, ownerId: UserId): Promise<PortraitPair[]> {
  const shared = await sharedAvatarAssetIds(db, ownerId);
  return await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      cardVec: characterEmbeddings.embedding,
      imageVec: imageEmbeddings.embedding,
    })
    .from(imageEmbeddings)
    .innerJoin(characters, eq(characters.avatarAssetId, imageEmbeddings.assetId))
    .innerJoin(assets, eq(assets.id, imageEmbeddings.assetId))
    .innerJoin(
      characterEmbeddings,
      and(
        eq(characterEmbeddings.characterId, characters.id),
        eq(characterEmbeddings.model, imageEmbeddings.model),
      ),
    )
    .where(
      and(
        eq(characters.ownerId, ownerId),
        eq(characters.synthetic, false),
        eq(imageEmbeddings.lens, IMAGE_VECTOR_LENS),
        excludeShared(shared),
      ),
    );
}

// One character's captioned-avatar row (caption text + facet json) for the facet tally / drill. File-local.
interface CaptionRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string;
  readonly caption: string | null;
  readonly captionMeta: Record<string, unknown> | null;
}

/** Every non-synthetic owner character's captioned-avatar row (`image-captioned` lens, non-null caption_meta),
 *  EXCLUDING shared avatars — the `imageFacets` tally input + `visualArchetypes`' caption labels. */
// The captioned-avatar rows for an owner, optionally narrowed by a caption_meta json predicate (the facet
// drill). `extra` is built HERE from an ALLOWLISTED json path the verb resolves (never caller-derived).
async function captionRows(db: Db, ownerId: UserId, extra?: SQL): Promise<CaptionRow[]> {
  const shared = await sharedAvatarAssetIds(db, ownerId);
  const rows = await db
    .select({
      characterId: characters.id,
      name: characters.name,
      avatarHash: assets.hash,
      caption: imageEmbeddings.caption,
      captionMeta: imageEmbeddings.captionMeta,
    })
    .from(imageEmbeddings)
    .innerJoin(characters, eq(characters.avatarAssetId, imageEmbeddings.assetId))
    .innerJoin(assets, eq(assets.id, imageEmbeddings.assetId))
    .where(
      and(
        eq(characters.ownerId, ownerId),
        eq(characters.synthetic, false),
        eq(imageEmbeddings.lens, IMAGE_CAPTION_LENS),
        isNotNull(imageEmbeddings.captionMeta),
        excludeShared(shared),
        extra,
      ),
    )
    .orderBy(asc(characters.name));
  return rows.map((r) => ({ ...r, captionMeta: r.captionMeta ?? null }));
}

/** Every non-synthetic owner character's captioned-avatar row (the `imageFacets` tally + visual labels). */
export async function readOwnedCaptionRows(db: Db, ownerId: UserId): Promise<CaptionRow[]> {
  return await captionRows(db, ownerId);
}

/** The owner's captioned avatars whose caption_meta matches ONE allowlisted facet path — the facet drill. A
 *  `list` path (`$.tags`/`$.exposedParts`) is a `json_each` membership test; a scalar path is an equality. The
 *  `path` is resolved from the caller's {@link ImageFacetKey} via the verb's allowlist — NEVER caller-derived. */
export async function readCaptionRowsByFacet(
  db: Db,
  ownerId: UserId,
  sel: { readonly path: string; readonly isList: boolean; readonly value: string },
): Promise<CaptionRow[]> {
  const predicate = sel.isList
    ? sql`EXISTS (SELECT 1 FROM json_each(${imageEmbeddings.captionMeta}, ${sel.path}) je WHERE je.value = ${sel.value})`
    : sql`json_extract(${imageEmbeddings.captionMeta}, ${sel.path}) = ${sel.value}`;
  return await captionRows(db, ownerId, predicate);
}

// ── similarity (similar-chats: per-chat segment centroids, in-RAM) ────────────
// `similarChats` has NO precomputed per-chat centroid store (the D-ledger pins it in-RAM — the centroid is
// derived from raw segment embeddings at request time, never persisted). Loading the owner's ENTIRE segment
// corpus into RAM per call (every 1024-d F32 vector) is the OOM risk: a heavy user has tens of thousands of
// segments. Bound the candidate set — always load the TARGET chat's segments (target-chat-first ordering, so
// its rows are never evicted by the cap), then the most-recent {@link SIMILAR_CHATS_SEG_CAP} segments across
// the owner's OTHER hosted chats (recency-ordered so the freshest corpus wins the comparison).
export const SIMILAR_CHATS_SEG_CAP = 20_000;

// One owner segment's chat + space + vector + owning chat title (the similar-chats centroid input). The
// title rides along the read so the verb needs no second lookup for the top hits. File-local (consumers
// infer it — the `no-inline-types` persistence-row posture).
interface OwnedSegmentVector {
  readonly chatId: ChatId;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly title: string | null;
}

/** The owner's verbatim segment vectors for the similar-chats centroid scan — the TARGET chat's segments
 *  ALWAYS (target-chat-first order), then the most-recent segments across the owner's other HOSTED chats, up
 *  to `cap` rows total (the OOM bound). Present-host owner belt (the PRESENT human host participant — a
 *  departed ex-host must not re-attribute, D18), the same derivation the
 *  hub/theme reads use (segments carry NO ownerId, D20). Joins `chats` for the display `title`. `targetChatId`
 *  is the resolved caller's chat; the belt drops it (returns nothing for it) when the caller is not its host. */
export async function readOwnedSegmentVectorsByChat(
  db: Db,
  ownerId: UserId,
  targetChatId: ChatId,
  cap: number = SIMILAR_CHATS_SEG_CAP,
): Promise<OwnedSegmentVector[]> {
  return await db
    .select({
      chatId: chatSegments.chatId,
      model: chatSegments.model,
      embedding: chatSegments.embedding,
      title: chats.title,
    })
    .from(chatSegments)
    .innerJoin(chats, eq(chats.id, chatSegments.chatId))
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chatSegments.chatId),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, ownerId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    // Target chat first (its rows are never evicted by the cap), then recency for the rest.
    .orderBy(desc(eq(chatSegments.chatId, targetChatId)), desc(chatSegments.createdAt))
    .limit(cap);
}
