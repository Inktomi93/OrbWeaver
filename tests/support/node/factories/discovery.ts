// Discovery seeds run the production verbs and return their outcomes; rows-tier twins in `rows/discovery.ts` read the rows.

import type {
  characterKeywordProfiles,
  characterSummaries,
  digestThemeAssignments,
  duplicateCharacterPairs,
  duplicateChatPairs,
  keywordCooccurrence,
  themeClusters,
} from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type DiscoveryService = ServicesResult["services"]["discovery"];
export type OwnerNarrow = NonNullable<Parameters<DiscoveryService["computeDuplicatePairs"]>[0]>["ownerId"];
export type DuplicateCharacterPairRow = typeof duplicateCharacterPairs.$inferSelect;
export type DuplicateChatPairRow = typeof duplicateChatPairs.$inferSelect;
type KeywordCooccurrenceRow = typeof keywordCooccurrence.$inferSelect;
type CharacterKeywordProfileRow = typeof characterKeywordProfiles.$inferSelect;
export type CharacterSummaryRow = typeof characterSummaries.$inferSelect;
type ThemeClusterRow = typeof themeClusters.$inferSelect;
type DigestThemeAssignmentRow = typeof digestThemeAssignments.$inferSelect;

export interface SeededCharacterDistillations {
  readonly result: Awaited<ReturnType<DiscoveryService["distillCharacters"]>>;
  readonly summaries: readonly CharacterSummaryRow[];
}
export interface SeededDuplicateCharacterPairs {
  readonly result: Awaited<ReturnType<DiscoveryService["computeDuplicatePairs"]>>;
  readonly pairs: readonly DuplicateCharacterPairRow[];
}
export interface SeededKeywordCooccurrence {
  readonly result: Awaited<ReturnType<DiscoveryService["computeCooccurrence"]>>;
  readonly pairs: readonly KeywordCooccurrenceRow[];
  readonly profiles: readonly CharacterKeywordProfileRow[];
}
export interface SeededThemes {
  readonly result: Awaited<ReturnType<DiscoveryService["computeThemes"]>>;
  readonly clusters: readonly ThemeClusterRow[];
  readonly assignments: readonly DigestThemeAssignmentRow[];
}

/** An empty or partially failed batch reports its real census; the pass's own result is the seed's result. */
export async function seedCharacterDistillations(
  root: ServerProducerRoot,
  params: Parameters<DiscoveryService["distillCharacters"]>[0],
): Promise<Awaited<ReturnType<DiscoveryService["distillCharacters"]>>> {
  return await root.services.discovery.distillCharacters(params);
}
