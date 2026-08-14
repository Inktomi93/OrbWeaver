// domain/discovery/persistence/embed-store-reads — read-only SELECTs over the embeddings vector store that
// discovery's in-RAM analytics cluster over; discovery writes no vector row here (hub-score write goes
// through the injected `embeddings.writeHubScores` seam). Vector rows carry no ownerId — owner derives via
// characters.ownerId, the present chat host (kind='human' AND role='host' AND leftSeq IS NULL), or assets.ownerId.

import type { Db } from "@orb/db";
import { assets, characterEmbeddings, characters, chatDigests, chatParticipants, chatSegments, chats, digestThemeAssignments, imageEmbeddings } from "@orb/db";
import type { AssetId, CharacterId, ChatDigestId, ChatId, ThemeClusterId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";

interface DigestKeywordRow {
  readonly ownerId: UserId;
  readonly scopedCharacterId: CharacterId;
  readonly contentHash: string;
  readonly keywords: string[];
}

interface OwnedCharacterVector {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

interface HubVector {
  readonly id: string;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
}

interface DigestHubVector extends HubVector {
  readonly tier: number;
}

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
/** Every card embedding with its owner, excluding synthetic (per-room group) characters. */
export async function readOwnedCharacterVectors(db: Db, ownerId?: UserId | null): Promise<OwnedCharacterVector[]> {
  const scope =
    ownerId === undefined || ownerId === null ? eq(characters.synthetic, false) : and(eq(characters.synthetic, false), eq(characters.ownerId, ownerId));
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

// ── hub passes (always owner-scoped — csls analyzes YOUR OWN library only, no cross-tenant read) ──

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
  const rows = await db.selectDistinct({ ownerId: assets.ownerId }).from(imageEmbeddings).innerJoin(assets, eq(imageEmbeddings.assetId, assets.id));
  return rows.map((r) => r.ownerId);
}

/**
 * THE BULK-PASS ANNOUNCE AUDIENCE (event-bus coverage survey §2.5/§3.4-4) — every owner who has ANYTHING in
 * the corpus, as the union of the four per-kind enumerations above. A background recompute run with
 * `ownerId: null` rewrites derived rows across owners, and a user-bus event reaches exactly one user's
 * channel, so the terminal fan needs a list; this is that list, homed beside the four sets it unions.
 *
 * DELIBERATELY OVER-INCLUSIVE, and the trade is the right way round. An owner whose rows this particular
 * pass did not actually change gets one `corpusRecomputed` and pays one refetch of already-correct data;
 * getting the set EXACT would mean threading a touched-owner accumulator through six independent pass
 * internals (themes · distillation · co-occurrence · duplicates · hub scores · the embeddings index sweep).
 * The user-bus contract licenses exactly this: the payload is a targeting HINT, delivery is live-only and
 * droppable, and subscribers are level-triggered (re-read by id, never apply the event as a delta). The
 * failure that matters is the other direction — an owner NOT told is frozen at `staleTime: Infinity` until
 * gcTime evicts, which is the defect this member exists to close.
 */
export async function distinctCorpusOwners(db: Db): Promise<UserId[]> {
  const perKind = await Promise.all([distinctCharacterHubOwners(db), distinctDigestHubOwners(db), distinctSegmentHubOwners(db), distinctImageHubOwners(db)]);
  // `indexOf` rather than a Set: `persistence-no-in-memory-state` bans a constructed Set in this layer, and
  // the rule is right even though this one would be query-local — the union is over the box's USER count,
  // so the quadratic is a handful of comparisons and there is no reason to spend an exemption on it.
  return perKind.flat().filter((ownerId, index, all) => all.indexOf(ownerId) === index);
}

// ── theme pass ────────────────────────────────────────────────────────────────
/** Every digest embedding tagged with its owner (present chat host) + isGroup + tier + space — the theme
 *  clustering inputs. Present-host join only — a departed ex-host must not re-attribute the digest. */
export async function readOwnedDigestVectors(db: Db, ownerId?: UserId | null): Promise<OwnedDigestVector[]> {
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
    .then((rows) => rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])));
}

// ── cooccurrence pass ───────────────────────────────────────────────────────
/** Every tier-0 digest's keyword material tagged with its owner (present chat host) + witnessing character
 *  + contentHash — the cooccurrence + per-character keyword-profile inputs. Tier-0 leaves only. */
export async function readOwnedDigestKeywords(db: Db, ownerId?: UserId | null): Promise<DigestKeywordRow[]> {
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
    .then((rows) => rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])));
}

// ── chat near-dup arm (Jaccard of segment content-hashes + fork lineage) ─────
// A present-host predicate factory for the owner-scope join (a departed ex-host must not re-attribute).
function segmentHostJoin(chatIdCol: typeof chatSegments.chatId, ownerId?: UserId | null): ReturnType<typeof and> {
  const common = [eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)];
  return ownerId === undefined || ownerId === null
    ? and(eq(chatParticipants.chatId, chatIdCol), ...common)
    : and(eq(chatParticipants.chatId, chatIdCol), eq(chatParticipants.userId, ownerId), ...common);
}

interface ChatSegmentHash {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly contentHash: string;
}

/** Every verbatim segment content-hash of the owner's hosted chats — the Jaccard set elements for the chat
 *  near-dup arm. */
export async function readOwnedChatSegmentHashes(db: Db, ownerId?: UserId | null): Promise<ChatSegmentHash[]> {
  return await db
    .select({
      ownerId: chatParticipants.userId,
      chatId: chatSegments.chatId,
      contentHash: chatSegments.contentHash,
    })
    .from(chatSegments)
    .innerJoin(chatParticipants, segmentHostJoin(chatSegments.chatId, ownerId))
    .then((rows) => rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])));
}

interface ChatLineageEdge {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly parentChatId: ChatId | null;
}

/** Every hosted chat of the owner with its fork parent — the lineage the near-dup arm walks to label a
 *  pair `forked` vs `duplicate`. */
export async function readOwnedChatLineage(db: Db, ownerId?: UserId | null): Promise<ChatLineageEdge[]> {
  const common = [eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)];
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
    .then((rows) => rows.flatMap((r) => (r.ownerId === null ? [] : [{ ...r, ownerId: r.ownerId as UserId }])));
}

interface Tier0DigestSpan {
  readonly digestId: ChatDigestId;
  readonly chatId: ChatId;
  readonly seqStart: number;
  readonly seqEnd: number;
}

/** Every tier-0 digest with a theme assignment, mapped to its verbatim seq-span — the msgMidAt backfill input. */
export async function readTier0DigestSpans(db: Db, ownerId?: UserId | null): Promise<Tier0DigestSpan[]> {
  const base = db
    .selectDistinct({
      digestId: chatDigests.id,
      chatId: chatDigests.chatId,
      seqStart: chatSegments.seqStart,
      seqEnd: chatSegments.seqEnd,
    })
    .from(digestThemeAssignments)
    .innerJoin(chatDigests, eq(chatDigests.id, digestThemeAssignments.digestId))
    .innerJoin(chatSegments, and(eq(chatSegments.chatId, chatDigests.chatId), eq(chatSegments.blockIdx, chatDigests.blockIdx)));
  if (ownerId === undefined || ownerId === null) {
    return await base.where(eq(chatDigests.tier, 0));
  }
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

interface TierKDigestRow {
  readonly digestId: ChatDigestId;
  readonly chatId: ChatId;
  readonly tier: number;
  readonly blockIdx: number;
}

/** Every tier-k (tier \> 0) digest with a theme assignment — no 1:1 segment sibling, so the seq-span is
 *  derived from the injected memory tier-grid (`Tier0RangeOp`) over {@link readSegmentBlockSpans}. */
export async function readTierKDigestSpans(db: Db, ownerId?: UserId | null): Promise<TierKDigestRow[]> {
  const base = db
    .selectDistinct({
      digestId: chatDigests.id,
      chatId: chatDigests.chatId,
      tier: chatDigests.tier,
      blockIdx: chatDigests.blockIdx,
    })
    .from(digestThemeAssignments)
    .innerJoin(chatDigests, eq(chatDigests.id, digestThemeAssignments.digestId));
  if (ownerId === undefined || ownerId === null) {
    return await base.where(gt(chatDigests.tier, 0));
  }
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
    .where(gt(chatDigests.tier, 0));
}

interface SegmentBlockSpan {
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
}

/** The verbatim block grid of the given chats — each tier-0 block's seq-span. The tier-k backfill folds a
 *  digest's covered blockIdx range over these to derive its whole-span `[min(seqStart), max(seqEnd)]`. */
export async function readSegmentBlockSpans(db: Db, chatIds: readonly ChatId[]): Promise<SegmentBlockSpan[]> {
  if (chatIds.length === 0) {
    return [];
  }
  return await db
    .selectDistinct({
      chatId: chatSegments.chatId,
      blockIdx: chatSegments.blockIdx,
      seqStart: chatSegments.seqStart,
      seqEnd: chatSegments.seqEnd,
    })
    .from(chatSegments)
    .where(inArray(chatSegments.chatId, [...chatIds]));
}

// ── composed views (home coverage + theme-detail members/timeline) ───────────
/** Corpus coverage — how much of the owner's library is indexed (catalog size + memory-substrate depth). */
export async function readCorpusCoverage(db: Db, ownerId: UserId): Promise<{ characters: number; digests: number; segments: number }> {
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

/** The characters most present in a theme cluster — each witnessing character's digest count, descending. */
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
    .where(and(eq(digestThemeAssignments.themeClusterId, themeClusterId), eq(characters.synthetic, false)))
    .groupBy(chatDigests.scopedCharacterId, characters.name)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}

/** A theme cluster's story-time timeline — assigned-digest count per `YYYY-MM` bucket, ascending. */
export async function readThemeClusterTimeline(db: Db, themeClusterId: ThemeClusterId): Promise<{ bucket: string; count: number }[]> {
  const bucket = sql<string>`strftime('%Y-%m', ${digestThemeAssignments.msgMidAt} / 1000, 'unixepoch')`;
  return await db
    .select({ bucket, count: sql<number>`count(*)` })
    .from(digestThemeAssignments)
    .where(and(eq(digestThemeAssignments.themeClusterId, themeClusterId), isNotNull(digestThemeAssignments.msgMidAt)))
    .groupBy(bucket)
    .orderBy(asc(bucket));
}

// ── image analytics (the AVATAR-lens reads; SHARED_AVATAR_MIN_REFS exclusion) ─
// A shared/default avatar (one asset that is the current avatar of ≥ this many characters, via CAS dedup)
// represents no one character and is excluded from cross-modal alignment + facet distributions.
const SHARED_AVATAR_MIN_REFS = 3;

const IMAGE_VECTOR_LENS = "image-raw";
const IMAGE_CAPTION_LENS = "image-captioned";

async function sharedAvatarAssetIds(db: Db, ownerId: UserId): Promise<AssetId[]> {
  const rows = await db
    .select({ id: characters.avatarAssetId })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), isNotNull(characters.avatarAssetId)))
    .groupBy(characters.avatarAssetId)
    .having(gte(sql<number>`count(*)`, SHARED_AVATAR_MIN_REFS));
  return rows.flatMap((r) => (r.id === null ? [] : [r.id]));
}

// notInArray([]) is invalid, so only apply the exclusion when there IS a shared avatar.
// @nullable-cmp-ok(characters.avatarAssetId): the column is nullable, but all three consumers below reach
// `characters` through `innerJoin(characters, eq(characters.avatarAssetId, imageEmbeddings.assetId))` — a
// NULL avatar can never satisfy that join, so no row this predicate could drop is in the set to begin with.
// Ends the day a consumer LEFT-joins the avatar (then the NULLs are live and this needs `or(isNull(…), …)`).
function excludeShared(shared: readonly AssetId[]): SQL | undefined {
  return shared.length === 0 ? undefined : notInArray(characters.avatarAssetId, [...shared]);
}

interface AvatarVector {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string;
  readonly model: string;
  readonly embedding: Float32Array;
}

/** Every non-synthetic owner character's current-avatar visual vector, excluding shared/default avatars. */
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
    .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false), eq(imageEmbeddings.lens, IMAGE_VECTOR_LENS), excludeShared(shared)));
}

interface PortraitPair {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string;
  readonly cardVec: Float32Array;
  readonly imageVec: Float32Array;
}

/** Every non-synthetic owner character with both a card-text vector and an avatar vector in the same model
 *  space, excluding shared avatars — the cross-modal portrait-alignment input (paired cosine, in-RAM). */
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
    .innerJoin(characterEmbeddings, and(eq(characterEmbeddings.characterId, characters.id), eq(characterEmbeddings.model, imageEmbeddings.model)))
    .where(and(eq(characters.ownerId, ownerId), eq(characters.synthetic, false), eq(imageEmbeddings.lens, IMAGE_VECTOR_LENS), excludeShared(shared)));
}

interface CaptionRow {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string;
  readonly caption: string | null;
  readonly captionMeta: Record<string, unknown> | null;
}

// `extra` is an allowlisted json path the verb resolves (never caller-derived).
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

/** The owner's captioned avatars whose caption_meta matches one allowlisted facet path. */
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
// No precomputed per-chat centroid store — derived from raw segment embeddings at request time. Loading a
// heavy user's entire segment corpus per call is an OOM risk, so the candidate set is capped (see below).
const SIMILAR_CHATS_SEG_CAP = 20_000;

interface OwnedSegmentVector {
  readonly chatId: ChatId;
  readonly model: string;
  readonly embedding: Float32Array;
  readonly title: string | null;
}

/** The owner's verbatim segment vectors for the similar-chats centroid scan — the target chat's segments
 *  always, then the most-recent segments across the owner's other hosted chats, up to `cap` rows total. */
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
