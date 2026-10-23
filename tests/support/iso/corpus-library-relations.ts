// Named native library stages retain their owner and exact requests; rows and credentials remain Node-owned.
import { rulePresetViewSchema, ruleViewSchema } from "@orb/contracts/automation";
import { chatDetailSchema } from "@orb/contracts/chat";
import { connectedCharacterViewSchema, personaDetailSchema } from "@orb/contracts/persona";
import { effectivePresetSchema, presetDetailSchema, presetSummarySchema, presetUsageViewSchema } from "@orb/contracts/preset";
import { applyRosterPresetResultSchema, rosterPresetSummarySchema, rosterPresetViewSchema } from "@orb/contracts/roster-preset";
import { tagFilterVocabularyEntrySchema, tagReachViewSchema, tagSuggestionViewSchema, tagViewSchema, tagWithUsageSchema } from "@orb/contracts/tag";

import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { z } from "zod";
import type { CorpusRead } from "./corpus-read.ts";

export const libraryRelationsSchema = z
  .strictObject({
    viewerUserId: brandedId("UserId"),
    ids: z.strictObject({
      tagId: typeIdSchema(ID_PREFIX.tag),
      characterId: typeIdSchema(ID_PREFIX.character),
      personaId: typeIdSchema(ID_PREFIX.persona),
      rosterPresetId: typeIdSchema(ID_PREFIX.rosterPreset),
      rosterChatId: typeIdSchema(ID_PREFIX.chat),
      presetId: typeIdSchema(ID_PREFIX.preset),
      connectionId: typeIdSchema(ID_PREFIX.userConnection),
    }),
    reads: z.strictObject({
      tagPending: tagSuggestionViewSchema.array(),
      tagPendingAfter: tagSuggestionViewSchema.array(),
      tagBefore: tagWithUsageSchema.array(),
      tagUsage: tagWithUsageSchema.array(),
      tagList: tagViewSchema.array(),
      tagVocabulary: tagFilterVocabularyEntrySchema.array(),
      characterReach: tagReachViewSchema,
      chatReach: tagReachViewSchema,
      worldBookReach: tagReachViewSchema,
      personaReach: tagReachViewSchema,
      presetReach: tagReachViewSchema,
      personaConnected: personaDetailSchema.array(),
      personaCharacters: connectedCharacterViewSchema.array(),
      rosterDetail: rosterPresetViewSchema,
      rosterList: rosterPresetSummarySchema.array(),
      rosterApplied: applyRosterPresetResultSchema,
      rosterAppliedAgain: applyRosterPresetResultSchema,
      rosterChat: chatDetailSchema,
      ruleCatalog: rulePresetViewSchema.array(),
      presetDetail: presetDetailSchema,
      presetList: presetSummarySchema.array(),
      presetInactive: presetUsageViewSchema,
      presetActive: presetUsageViewSchema,
      presetRestored: presetUsageViewSchema,
      presetEffective: effectivePresetSchema,
      rulesFirst: ruleViewSchema.array(),
      rulesRepeated: ruleViewSchema.array(),
    }),
  })
  .refine(
    ({ viewerUserId, ids, reads }) =>
      reads.rosterChat.viewerUserId === viewerUserId &&
      reads.rosterChat.viewerIsHost &&
      reads.rosterDetail.id === ids.rosterPresetId &&
      reads.rosterChat.id === ids.rosterChatId &&
      reads.presetDetail.id === ids.presetId &&
      reads.presetEffective.presetId === ids.presetId &&
      reads.presetList.some((preset) => preset.id === ids.presetId) &&
      reads.rulesFirst.every((rule) => rule.chatId === ids.rosterChatId) &&
      reads.rulesRepeated.every((rule) => rule.chatId === ids.rosterChatId) &&
      reads.tagPending.every((tag) => tag.characterId === ids.characterId) &&
      reads.tagPendingAfter.every((tag) => tag.characterId === ids.characterId) &&
      reads.characterReach.entities.every((entity) => entity.targetType === "character") &&
      reads.chatReach.entities.every((entity) => entity.targetType === "chat") &&
      reads.worldBookReach.entities.every((entity) => entity.targetType === "worldBook") &&
      reads.personaReach.entities.every((entity) => entity.targetType === "persona") &&
      reads.presetReach.entities.every((entity) => entity.targetType === "preset"),
    "Corpus library relation identity mismatch",
  );

export interface CorpusLibraryRelations extends Omit<z.output<typeof libraryRelationsSchema>, "reads"> {
  readonly reads: {
    readonly tagPending: CorpusRead<"tag.listPendingSuggestions">;
    readonly tagPendingAfter: CorpusRead<"tag.listPendingSuggestions">;
    readonly tagBefore: CorpusRead<"tag.listTagsWithUsage">;
    readonly tagUsage: CorpusRead<"tag.listTagsWithUsage">;
    readonly tagList: CorpusRead<"tag.listTags">;
    readonly tagVocabulary: CorpusRead<"tag.listTagFilterVocabulary">;
    readonly characterReach: CorpusRead<"tag.listAttachedEntities">;
    readonly chatReach: CorpusRead<"tag.listAttachedEntities">;
    readonly worldBookReach: CorpusRead<"tag.listAttachedEntities">;
    readonly personaReach: CorpusRead<"tag.listAttachedEntities">;
    readonly presetReach: CorpusRead<"tag.listAttachedEntities">;
    readonly personaConnected: CorpusRead<"persona.listConnectedToCharacter">;
    readonly personaCharacters: CorpusRead<"persona.listConnectedCharacters">;
    readonly rosterDetail: CorpusRead<"rosterPreset.get">;
    readonly rosterList: CorpusRead<"rosterPreset.list">;
    readonly rosterApplied: CorpusRead<"rosterPreset.applyToChat">;
    readonly rosterAppliedAgain: CorpusRead<"rosterPreset.applyToChat">;
    readonly rosterChat: CorpusRead<"chat.getChat">;
    readonly ruleCatalog: CorpusRead<"automation.listRulePresets">;
    readonly presetDetail: CorpusRead<"preset.get">;
    readonly presetList: CorpusRead<"preset.list">;
    readonly presetInactive: CorpusRead<"preset.listUsage">;
    readonly presetActive: CorpusRead<"preset.listUsage">;
    readonly presetRestored: CorpusRead<"preset.listUsage">;
    readonly presetEffective: CorpusRead<"preset.resolveEffective">;
    readonly rulesFirst: CorpusRead<"automation.listRules">;
    readonly rulesRepeated: CorpusRead<"automation.listRules">;
  };
}

/** Publish canonical outputs without replacing the original captured requests. */
export function publishLibraryRelations(section: CorpusLibraryRelations): z.output<typeof libraryRelationsSchema> {
  return libraryRelationsSchema.parse({
    viewerUserId: section.viewerUserId,
    ids: section.ids,
    reads: Object.fromEntries(Object.entries(section.reads).map(([name, read]) => [name, read.output])),
  });
}

/** Reconstruct only the finite native recipes; changed requests refuse in the corpus serializer. */
export function hydrateLibraryRelations(section: z.output<typeof libraryRelationsSchema>): CorpusLibraryRelations {
  const { ids, reads } = section;
  const pending = { characterId: ids.characterId };
  const reach = { tagId: ids.tagId };
  const apply = { presetId: ids.rosterPresetId, chatId: ids.rosterChatId, timeZone: UTC_TIME_ZONE };
  return {
    viewerUserId: section.viewerUserId,
    ids,
    reads: {
      tagPending: { input: pending, output: reads.tagPending },
      tagPendingAfter: { input: pending, output: reads.tagPendingAfter },
      tagBefore: { input: undefined, output: reads.tagBefore },
      tagUsage: { input: undefined, output: reads.tagUsage },
      tagList: { input: undefined, output: reads.tagList },
      tagVocabulary: { input: undefined, output: reads.tagVocabulary },
      characterReach: { input: { ...reach, targetType: "character" }, output: reads.characterReach },
      chatReach: { input: { ...reach, targetType: "chat" }, output: reads.chatReach },
      worldBookReach: { input: { ...reach, targetType: "worldBook" }, output: reads.worldBookReach },
      personaReach: { input: { ...reach, targetType: "persona" }, output: reads.personaReach },
      presetReach: { input: { ...reach, targetType: "preset" }, output: reads.presetReach },
      personaConnected: { input: { characterId: ids.characterId }, output: reads.personaConnected },
      personaCharacters: { input: { personaId: ids.personaId }, output: reads.personaCharacters },
      rosterDetail: { input: { presetId: ids.rosterPresetId }, output: reads.rosterDetail },
      rosterList: { input: undefined, output: reads.rosterList },
      rosterApplied: { input: apply, output: reads.rosterApplied },
      rosterAppliedAgain: { input: apply, output: reads.rosterAppliedAgain },
      rosterChat: { input: { chatId: ids.rosterChatId }, output: reads.rosterChat },
      ruleCatalog: { input: undefined, output: reads.ruleCatalog },
      presetDetail: { input: { id: ids.presetId }, output: reads.presetDetail },
      presetList: { input: undefined, output: reads.presetList },
      presetInactive: { input: { id: ids.presetId }, output: reads.presetInactive },
      presetActive: { input: { id: ids.presetId }, output: reads.presetActive },
      presetRestored: { input: { id: ids.presetId }, output: reads.presetRestored },
      presetEffective: {
        input: { id: ids.presetId, target: { kind: "connection", connectionId: ids.connectionId } },
        output: reads.presetEffective,
      },
      rulesFirst: { input: { chatId: ids.rosterChatId }, output: reads.rulesFirst },
      rulesRepeated: { input: { chatId: ids.rosterChatId }, output: reads.rulesRepeated },
    },
  };
}
