// These seeds capture canonical persisted collections, including retained rows when a real pass skips work.
// Vectors, grouping, naming, content collapse and every compute outcome remain production operations.
import type { Db } from "@orb/db";
import {
  characterKeywordProfiles,
  characterSummaries,
  characters,
  chatParticipants,
  digestThemeAssignments,
  duplicateCharacterPairs,
  duplicateChatPairs,
  keywordCooccurrence,
  themeClusters,
} from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq, inArray, isNull } from "drizzle-orm";

type DiscoveryService = ServicesResult["services"]["discovery"];
export type DuplicateCharacterPairRow = typeof duplicateCharacterPairs.$inferSelect;
export type DuplicateChatPairRow = typeof duplicateChatPairs.$inferSelect;
export type KeywordCooccurrenceRow = typeof keywordCooccurrence.$inferSelect;
export type CharacterKeywordProfileRow = typeof characterKeywordProfiles.$inferSelect;
export type CharacterSummaryRow = typeof characterSummaries.$inferSelect;
export type ThemeClusterRow = typeof themeClusters.$inferSelect;
export type DigestThemeAssignmentRow = typeof digestThemeAssignments.$inferSelect;

interface SeededCharacterDistillations {
  readonly result: Awaited<ReturnType<DiscoveryService["distillCharacters"]>>;
  readonly summaries: readonly CharacterSummaryRow[];
}
interface SeededDuplicateCharacterPairs {
  readonly result: Awaited<ReturnType<DiscoveryService["computeDuplicatePairs"]>>;
  readonly pairs: readonly DuplicateCharacterPairRow[];
}
interface SeededDuplicateChatPairs {
  readonly result: Awaited<ReturnType<DiscoveryService["computeChatDuplicatePairs"]>>;
  readonly pairs: readonly DuplicateChatPairRow[];
}
interface SeededKeywordCooccurrence {
  readonly result: Awaited<ReturnType<DiscoveryService["computeCooccurrence"]>>;
  readonly pairs: readonly KeywordCooccurrenceRow[];
  readonly profiles: readonly CharacterKeywordProfileRow[];
}
interface SeededThemes {
  readonly result: Awaited<ReturnType<DiscoveryService["computeThemes"]>>;
  readonly clusters: readonly ThemeClusterRow[];
  readonly assignments: readonly DigestThemeAssignmentRow[];
}

/** An empty/partially failed batch preserves its real census and any retained canonical summaries. */
export async function seedCharacterDistillations(
  db: Db,
  distillCharacters: DiscoveryService["distillCharacters"],
  params: Parameters<DiscoveryService["distillCharacters"]>[0],
): Promise<SeededCharacterDistillations> {
  const result = await distillCharacters(params);
  const rows = await db
    .select({ row: characterSummaries })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .where(
      and(
        params.ownerId === null ? undefined : eq(characters.ownerId, params.ownerId),
        params.characterId === undefined ? undefined : eq(characterSummaries.characterId, params.characterId),
      ),
    )
    .orderBy(characterSummaries.characterId);
  return { result, summaries: rows.map(({ row }) => row) };
}

/** Captures the actual scoped replacement, not a test-computed similarity or canonical pair. */
export async function seedDuplicateCharacterPairs(
  db: Db,
  compute: DiscoveryService["computeDuplicatePairs"],
  params: NonNullable<Parameters<DiscoveryService["computeDuplicatePairs"]>[0]>,
): Promise<SeededDuplicateCharacterPairs> {
  const result = await compute(params);
  const ownerId = params.ownerId;
  const pairs = await db
    .select()
    .from(duplicateCharacterPairs)
    .where(
      ownerId === null
        ? undefined
        : inArray(duplicateCharacterPairs.characterIdA, db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId))),
    )
    .orderBy(duplicateCharacterPairs.characterIdA, duplicateCharacterPairs.characterIdB);
  return { result, pairs };
}

/** Chat ownership is the actual present human host FK path; fork relation remains producer data. */
export async function seedDuplicateChatPairs(
  db: Db,
  compute: DiscoveryService["computeChatDuplicatePairs"],
  params: NonNullable<Parameters<DiscoveryService["computeChatDuplicatePairs"]>[0]>,
): Promise<SeededDuplicateChatPairs> {
  const result = await compute(params);
  const ownerId = params.ownerId;
  const pairs = await db
    .select()
    .from(duplicateChatPairs)
    .where(
      ownerId === null
        ? undefined
        : inArray(
            duplicateChatPairs.chatIdA,
            db
              .select({ id: chatParticipants.chatId })
              .from(chatParticipants)
              .where(
                and(
                  eq(chatParticipants.userId, ownerId),
                  eq(chatParticipants.kind, "human"),
                  eq(chatParticipants.role, "host"),
                  isNull(chatParticipants.leftSeq),
                ),
              ),
          ),
    )
    .orderBy(duplicateChatPairs.chatIdA, duplicateChatPairs.chatIdB);
  return { result, pairs };
}

/** The pass owns normalization, hub filtering and solo/group census; missing input is not fabricated activity. */
export async function seedKeywordCooccurrence(
  db: Db,
  compute: DiscoveryService["computeCooccurrence"],
  params: NonNullable<Parameters<DiscoveryService["computeCooccurrence"]>[0]>,
): Promise<SeededKeywordCooccurrence> {
  const result = await compute(params);
  const ownerId = params.ownerId;
  const pairs = await db
    .select()
    .from(keywordCooccurrence)
    .where(ownerId === null ? undefined : eq(keywordCooccurrence.ownerId, ownerId))
    .orderBy(keywordCooccurrence.ownerId, keywordCooccurrence.keywordA, keywordCooccurrence.keywordB);
  const profiles = await db
    .select({ row: characterKeywordProfiles })
    .from(characterKeywordProfiles)
    .innerJoin(characters, eq(characters.id, characterKeywordProfiles.characterId))
    .where(ownerId === null ? undefined : eq(characters.ownerId, ownerId))
    .orderBy(characterKeywordProfiles.characterId, characterKeywordProfiles.keyword);
  return { result, pairs, profiles: profiles.map(({ row }) => row) };
}

/** Capture true cluster/assignment PKs and the actual story-time backfill; no digest-less replacement is invented. */
export async function seedThemes(
  db: Db,
  compute: DiscoveryService["computeThemes"],
  params: Parameters<DiscoveryService["computeThemes"]>[0],
): Promise<SeededThemes> {
  const result = await compute(params);
  const ownerId = params.ownerId;
  const clusters = await db
    .select()
    .from(themeClusters)
    .where(ownerId === null ? undefined : eq(themeClusters.ownerId, ownerId))
    .orderBy(themeClusters.ownerId, themeClusters.level, themeClusters.clusterIdx);
  const rows = await db
    .select({ row: digestThemeAssignments })
    .from(digestThemeAssignments)
    .innerJoin(themeClusters, eq(themeClusters.id, digestThemeAssignments.themeClusterId))
    .where(ownerId === null ? undefined : eq(themeClusters.ownerId, ownerId))
    .orderBy(digestThemeAssignments.digestId, digestThemeAssignments.themeClusterId);
  return { result, clusters, assignments: rows.map(({ row }) => row) };
}
