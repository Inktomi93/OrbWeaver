// Portable capture vocabulary derives from contract owners; concrete router conformance belongs to Node.
import type * as automation from "@orb/contracts/automation";
import type * as character from "@orb/contracts/character";
import type * as chat from "@orb/contracts/chat";
import type * as databank from "@orb/contracts/databank";
import type * as identity from "@orb/contracts/identity";
import type * as notifications from "@orb/contracts/notifications";
import type * as persona from "@orb/contracts/persona";
import type * as plugin from "@orb/contracts/plugin";
import type * as preset from "@orb/contracts/preset";
import type * as regex from "@orb/contracts/regex";
import type * as roster from "@orb/contracts/roster-preset";
import type * as search from "@orb/contracts/search";
import type * as settings from "@orb/contracts/settings";
import type * as stats from "@orb/contracts/stats";
import type * as tag from "@orb/contracts/tag";
import type * as world from "@orb/contracts/world-info";
import type { UserId } from "@orb/kit/ids";
import type { z } from "zod";
import type { TrpcWire } from "./trpc-wire.ts";

/** Portable request presence and its captured response travel together. */
export interface CorpusCapture<Input, Output> {
  readonly input: Input;
  readonly output: Output;
}

type Capture<Input, Output> = CorpusCapture<Input, TrpcWire<Output>>;
// biome-ignore lint/suspicious/noConfusingVoidType: The fixture preserves native void-returning contracts; undefined is not a substitute for void.
type InputlessCapture<Output> = Capture<void | undefined, Output>;

/** The finite captured procedures, derived from their production input and output schemas. */
export interface CorpusProcedures {
  readonly "sessions.me": InputlessCapture<z.output<typeof identity.viewerViewSchema>>;
  readonly "settings.getUserSettings": InputlessCapture<z.output<typeof settings.userSettingsViewSchema>>;
  readonly "settings.listThemes": InputlessCapture<readonly z.output<typeof settings.themeViewSchema>[]>;
  readonly "character.list": Capture<z.input<typeof character.characterListInputSchema>, z.output<typeof character.listCharactersResultSchema>>;
  readonly "character.count": Capture<z.input<typeof character.characterCensusInputSchema> | undefined, number>;
  readonly "persona.list": InputlessCapture<readonly z.output<typeof persona.personaDetailSchema>[]>;
  readonly "persona.get": Capture<z.input<typeof persona.personaIdInputSchema>, z.output<typeof persona.personaDetailSchema>>;
  readonly "persona.listConnectedToCharacter": Capture<
    z.input<typeof persona.personaCharacterInputSchema>,
    readonly z.output<typeof persona.personaDetailSchema>[]
  >;
  readonly "persona.listConnectedCharacters": Capture<
    z.input<typeof persona.personaIdInputSchema>,
    readonly z.output<typeof persona.connectedCharacterViewSchema>[]
  >;
  readonly "chat.listChats": Capture<z.input<typeof chat.chatListInputSchema>, z.output<typeof chat.chatListPageSchema>>;
  readonly "chat.countChats": Capture<z.input<typeof chat.chatCensusInputSchema> | undefined, number>;
  readonly "chat.getChat": Capture<z.input<typeof chat.chatIdInputSchema>, z.output<typeof chat.chatDetailSchema>>;
  readonly "chat.listMessages": Capture<z.input<typeof chat.listMessagesInputSchema>, z.output<typeof chat.messagesPageSchema>>;
  readonly "databank.get": Capture<z.input<typeof databank.getDocumentInputSchema>, z.output<typeof databank.documentDetailViewSchema>>;
  readonly "databank.list": Capture<z.input<typeof databank.listDocumentsInputSchema>, z.output<typeof databank.listDocumentsResultSchema>>;
  readonly "databank.bankHealth": InputlessCapture<z.output<typeof databank.bankHealthViewSchema>>;
  readonly "notifications.list": Capture<z.input<typeof notifications.listInboxInputSchema>, z.output<typeof notifications.listInboxResultSchema>>;
  readonly "tag.listPendingSuggestions": Capture<z.input<typeof tag.pendingTagSuggestionsInputSchema>, readonly z.output<typeof tag.tagSuggestionViewSchema>[]>;
  readonly "tag.listTags": InputlessCapture<readonly z.output<typeof tag.tagViewSchema>[]>;
  readonly "tag.listTagsWithUsage": InputlessCapture<readonly z.output<typeof tag.tagWithUsageSchema>[]>;
  readonly "tag.listTagFilterVocabulary": InputlessCapture<readonly z.output<typeof tag.tagFilterVocabularyEntrySchema>[]>;
  readonly "tag.listAttachedEntities": Capture<z.input<typeof tag.tagReachInputSchema>, z.output<typeof tag.tagReachViewSchema>>;
  readonly "worldInfo.countBooks": InputlessCapture<number>;
  readonly "worldInfo.listBooks": InputlessCapture<readonly z.output<typeof world.bookViewSchema>[]>;
  readonly "worldInfo.listBooksWithUsage": InputlessCapture<readonly z.output<typeof world.bookWithUsageSchema>[]>;
  readonly "worldInfo.listEntries": Capture<z.input<typeof world.worldBookIdInputSchema>, readonly z.output<typeof world.entryViewSchema>[]>;
  readonly "worldInfo.getBook": Capture<z.input<typeof world.worldBookIdInputSchema>, z.output<typeof world.bookViewSchema>>;
  readonly "worldInfo.getEntry": Capture<z.input<typeof world.worldEntryIdInputSchema>, z.output<typeof world.entryViewSchema>>;
  readonly "worldInfo.listAttachmentsForBook": Capture<z.input<typeof world.worldBookIdInputSchema>, z.output<typeof world.bookAttachmentTargetsSchema>>;
  readonly "worldInfo.listForCharacter": Capture<
    z.input<typeof world.worldInfoCharacterInputSchema>,
    readonly z.output<typeof world.bookAttachmentViewSchema>[]
  >;
  readonly "worldInfo.listForPersona": Capture<z.input<typeof world.worldInfoPersonaInputSchema>, readonly z.output<typeof world.bookAttachmentViewSchema>[]>;
  readonly "worldInfo.listGlobal": InputlessCapture<readonly z.output<typeof world.bookAttachmentViewSchema>[]>;
  readonly "worldInfo.listForChat": Capture<z.input<typeof world.worldInfoChatInputSchema>, readonly z.output<typeof world.chatBookViewSchema>[]>;
  readonly "regex.countScripts": InputlessCapture<number>;
  readonly "regex.listScripts": InputlessCapture<readonly z.output<typeof regex.regexScriptViewSchema>[]>;
  readonly "regex.listGlobal": InputlessCapture<readonly z.output<typeof regex.regexScriptViewSchema>[]>;
  readonly "regex.listForCharacter": Capture<z.input<typeof regex.regexCharacterInputSchema>, readonly z.output<typeof regex.regexScriptViewSchema>[]>;
  readonly "regex.listForPreset": Capture<z.input<typeof regex.regexPresetInputSchema>, readonly z.output<typeof regex.regexScriptViewSchema>[]>;
  readonly "regex.listForChat": Capture<z.input<typeof regex.regexChatInputSchema>, readonly z.output<typeof regex.regexScriptViewSchema>[]>;
  readonly "regex.listRoomDisplayScripts": Capture<z.input<typeof regex.regexChatInputSchema>, readonly z.output<typeof regex.regexScriptViewSchema>[]>;
  readonly "regex.listScriptUsage": Capture<z.input<typeof regex.regexScriptIdInputSchema>, z.output<typeof regex.regexScriptUsageSchema>>;
  readonly "rosterPreset.count": InputlessCapture<number>;
  readonly "rosterPreset.get": Capture<z.input<typeof roster.rosterPresetIdInputSchema>, z.output<typeof roster.rosterPresetViewSchema>>;
  readonly "rosterPreset.list": Capture<z.input<typeof roster.rosterPresetListInputSchema>, readonly z.output<typeof roster.rosterPresetSummarySchema>[]>;
  readonly "rosterPreset.applyToChat": Capture<z.input<typeof roster.applyRosterPresetInputSchema>, z.output<typeof roster.applyRosterPresetResultSchema>>;
  readonly "preset.get": Capture<z.input<typeof preset.presetIdInputSchema>, z.output<typeof preset.presetDetailSchema>>;
  readonly "preset.list": InputlessCapture<readonly z.output<typeof preset.presetSummarySchema>[]>;
  readonly "preset.listUsage": Capture<z.input<typeof preset.presetIdInputSchema>, z.output<typeof preset.presetUsageViewSchema>>;
  readonly "preset.resolveEffective": Capture<z.input<typeof preset.resolveEffectivePresetInputSchema>, z.output<typeof preset.effectivePresetSchema>>;
  readonly "automation.getOwnerBudgets": InputlessCapture<z.output<typeof automation.ownerBudgetViewSchema>>;
  readonly "automation.listRulePresets": InputlessCapture<readonly z.output<typeof automation.rulePresetViewSchema>[]>;
  readonly "automation.listRules": Capture<z.input<typeof automation.automationChatInputSchema>, readonly z.output<typeof automation.ruleViewSchema>[]>;
  readonly "stats.overview": InputlessCapture<z.output<typeof stats.ownerStatsViewSchema> | null>;
  readonly "stats.wrapped": InputlessCapture<z.output<typeof stats.wrappedSummarySchema> | null>;
  readonly "stats.byModel": Capture<z.input<typeof stats.statsByModelInputSchema>, readonly z.output<typeof stats.modelStatRowSchema>[]>;
  readonly "stats.latency": Capture<z.input<typeof stats.latencyScopeSchema>, z.output<typeof stats.latencyStatsSchema>>;
  readonly "stats.personaUsage": Capture<z.input<typeof stats.statsPersonaUsageInputSchema>, readonly z.output<typeof stats.personaUsageRowSchema>[]>;
  readonly "stats.timeseries": Capture<z.input<typeof stats.statsTimeseriesInputSchema>, readonly z.output<typeof stats.activityBucketSchema>[]>;
  readonly "stats.leaderboard": Capture<z.input<typeof stats.statsLeaderboardInputSchema>, z.output<typeof stats.leaderboardPageSchema>>;
  readonly "stats.freshness": InputlessCapture<z.output<typeof stats.statsFreshnessSchema>>;
  readonly "stats.momentum": InputlessCapture<readonly z.output<typeof stats.momentumBucketSchema>[]>;
  readonly "plugin.list": InputlessCapture<readonly z.output<typeof plugin.pluginViewSchema>[]>;
  readonly "plugin.listSurfaces": InputlessCapture<readonly z.output<typeof plugin.pluginSurfaceViewSchema>[]>;
  readonly "plugin.listCommands": InputlessCapture<readonly z.output<typeof plugin.pluginCommandViewSchema>[]>;
  readonly "plugin.listDisplayTransforms": InputlessCapture<readonly z.output<typeof plugin.pluginDisplayTransformViewSchema>[]>;
  readonly "plugin.listBundleAssets": Capture<z.input<typeof plugin.pluginIdInputSchema>, readonly z.output<typeof plugin.pluginBundleAssetViewSchema>[]>;
  readonly "plugin.getLog": Capture<z.input<typeof plugin.pluginLogInputSchema>, readonly z.output<typeof plugin.pluginLogViewSchema>[]>;
  readonly "plugin.getSurfaceState": Capture<z.input<typeof plugin.pluginSurfaceStateInputSchema>, z.output<typeof plugin.pluginSurfaceStateSchema> | null>;
  readonly "plugin.listDistributed": InputlessCapture<readonly z.output<typeof plugin.distributedPluginViewSchema>[]>;
  readonly "search.search": Capture<z.input<typeof search.unifiedSearchInputSchema>, z.output<typeof search.unifiedSearchResultSchema>>;
  readonly "search.fields": Capture<z.input<typeof search.fieldSearchInputSchema>, z.output<typeof search.fieldSearchResultSchema>>;
  readonly "search.suggest": Capture<z.input<typeof search.searchSuggestInputSchema>, readonly z.output<typeof search.searchSuggestionSchema>[]>;
  readonly "search.similarArt": Capture<z.input<typeof search.similarArtInputSchema>, readonly z.output<typeof search.similarArtHitSchema>[]>;
  readonly "search.spaceStatus": InputlessCapture<z.output<typeof search.searchSpaceStatusSchema>>;
}

export type CorpusProcedurePath = keyof CorpusProcedures;
export type CorpusRead<P extends CorpusProcedurePath> = CorpusProcedures[P];

/** A captured viewer is fixture-selection evidence, never a browser authentication credential. */
export interface CorpusViewerRead<P extends CorpusProcedurePath> {
  readonly viewerUserId: UserId;
  readonly read: CorpusRead<P>;
}
