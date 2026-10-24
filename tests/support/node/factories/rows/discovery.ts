// Discovery rows a production pass left, read behind the rows door for persistence-tier and corpus captures.

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
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type {
  CharacterSummaryRow,
  DiscoveryService,
  DuplicateCharacterPairRow,
  DuplicateChatPairRow,
  OwnerNarrow,
  SeededCharacterDistillations,
  SeededDuplicateCharacterPairs,
  SeededKeywordCooccurrence,
  SeededThemes,
} from "../discovery.ts";

/** Captures the actual scoped replacement, not a test-computed similarity or canonical pair. */
export async function seedDuplicateCharacterPairsRows(
  root: ServerProducerRoot,
  params: NonNullable<Parameters<DiscoveryService["computeDuplicatePairs"]>[0]>,
): Promise<SeededDuplicateCharacterPairs> {
  const db = root.db;
  const compute = root.services.discovery.computeDuplicatePairs;
  const result = await compute(params);
  return { result, pairs: await captureDuplicateCharacterPairs(db, params.ownerId) };
}

/** Chat ownership is the actual present human host FK path; fork relation remains producer data. */
/** The pass owns normalization, hub filtering and solo/group census; missing input is not fabricated activity. */
/** Capture true cluster/assignment PKs and the actual story-time backfill; no digest-less replacement is invented. */
/** Read the actual retained summary rows after a completed producer; this capture computes nothing. */
export async function captureCharacterDistillations(
  db: Db,
  scope: Pick<Parameters<DiscoveryService["distillCharacters"]>[0], "ownerId" | "characterId">,
): Promise<readonly CharacterSummaryRow[]> {
  const rows = await db
    .select({ row: characterSummaries })
    .from(characterSummaries)
    .innerJoin(characters, eq(characters.id, characterSummaries.characterId))
    .where(
      and(
        scope.ownerId === null ? undefined : eq(characters.ownerId, scope.ownerId),
        scope.characterId === undefined ? undefined : eq(characterSummaries.characterId, scope.characterId),
      ),
    )
    .orderBy(characterSummaries.characterId);
  return rows.map(({ row }) => row);
}

/** Capture the actual character pair replacement without another compute pass. */
export async function captureDuplicateCharacterPairs(db: Db, ownerId: OwnerNarrow): Promise<readonly DuplicateCharacterPairRow[]> {
  const pairs = await db
    .select()
    .from(duplicateCharacterPairs)
    .where(
      ownerId === null
        ? undefined
        : inArray(duplicateCharacterPairs.characterIdA, db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId))),
    )
    .orderBy(duplicateCharacterPairs.characterIdA, duplicateCharacterPairs.characterIdB);
  return pairs;
}

/** Capture the actual chat pair replacement without another compute pass. */
export async function captureDuplicateChatPairs(db: Db, ownerId: OwnerNarrow): Promise<readonly DuplicateChatPairRow[]> {
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
  return pairs;
}

/** Keyword and profile rows retain their real owner/FK scopes; no fixture tally is performed. */
export async function captureKeywordCooccurrence(db: Db, ownerId: OwnerNarrow): Promise<Pick<SeededKeywordCooccurrence, "pairs" | "profiles">> {
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
  return { pairs, profiles: profiles.map(({ row }) => row) };
}

/** Capture production cluster/assignment identities and actual story-time stamps after the public job. */
export async function captureThemeRows(db: Db, ownerId: OwnerNarrow): Promise<Pick<SeededThemes, "clusters" | "assignments">> {
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
  return { clusters, assignments: rows.map(({ row }) => row) };
}

/** An empty/partially failed batch preserves its real census and any retained canonical summaries. */
export async function seedCharacterDistillationsRows(
  root: ServerProducerRoot,
  params: Parameters<DiscoveryService["distillCharacters"]>[0],
): Promise<SeededCharacterDistillations> {
  const db = root.db;
  const distillCharacters = root.services.discovery.distillCharacters;
  const result = await distillCharacters(params);
  return { result, summaries: await captureCharacterDistillations(db, params) };
}
