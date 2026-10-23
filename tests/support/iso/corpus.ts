// Portable corpus data contains owner-validated wire captures only, never Node row or credential material.
import { authConfigSchema } from "@orb/contracts/auth-config";
import { ownerBudgetViewSchema } from "@orb/contracts/automation";
import { listCharactersResultSchema } from "@orb/contracts/character";
import { chatDetailSchema, chatListPageSchema, messagesPageSchema, pendingJoinConfirmResultSchema, signedOutInvitePreviewSchema } from "@orb/contracts/chat";
import { bankHealthViewSchema, documentDetailViewSchema, listDocumentsResultSchema } from "@orb/contracts/databank";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { authMeSchema, viewerViewSchema } from "@orb/contracts/identity";
import { listInboxResultSchema } from "@orb/contracts/notifications";
import { personaDetailSchema } from "@orb/contracts/persona";
import { themeViewSchema, userSettingsViewSchema } from "@orb/contracts/settings";
import {
  activityBucketSchema,
  latencyStatsSchema,
  leaderboardPageSchema,
  modelStatRowSchema,
  momentumBucketSchema,
  ownerStatsViewSchema,
  personaUsageRowSchema,
  statsFreshnessSchema,
  wrappedSummarySchema,
} from "@orb/contracts/stats";
import { tagSuggestionViewSchema } from "@orb/contracts/tag";
import type { ChatId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { secretRedactionLiterals } from "@orb/kit/secret-redaction";
import { stableStringify } from "@orb/kit/stable-stringify";
import { z } from "zod";
import type { CorpusRegexLibrary, CorpusWorldInfoLibrary } from "./corpus-library.ts";
import {
  hydrateRegexLibrary,
  hydrateWorldInfoLibrary,
  publishRegexLibrary,
  publishWorldInfoLibrary,
  regexLibrarySchema,
  worldInfoLibrarySchema,
} from "./corpus-library.ts";
import type { CorpusLibraryRelations } from "./corpus-library-relations.ts";
import { hydrateLibraryRelations, libraryRelationsSchema, publishLibraryRelations } from "./corpus-library-relations.ts";
import type { CorpusPluginLibrary } from "./corpus-plugin.ts";
import { hydrateCorpusPlugins, pluginLibrarySchema, publishCorpusPlugins } from "./corpus-plugin.ts";
import type { CorpusCapture, CorpusRead, CorpusViewerRead } from "./corpus-read.ts";
import type { CorpusSearchLibrary } from "./corpus-search.ts";
import { corpusSearchSchema, hydrateCorpusSearch, publishCorpusSearch } from "./corpus-search.ts";

export type { CorpusRegexLibrary, CorpusWorldInfoLibrary } from "./corpus-library.ts";
export type { CorpusLibraryRelations } from "./corpus-library-relations.ts";
export type { CorpusPluginLibrary, CorpusPluginStage } from "./corpus-plugin.ts";
export { corpusPluginInput } from "./corpus-plugin.ts";
export type { CorpusSearchLibrary } from "./corpus-search.ts";

const PRIVATE_MATERIAL_MESSAGE = "Corpus publication contains private material";

export type { CorpusRead, CorpusViewerRead } from "./corpus-read.ts";

export interface CorpusMemberMessagesRead extends CorpusViewerRead<"chat.listMessages"> {
  readonly chatId: ChatId;
}

const inboxSnapshotSchema = z
  .strictObject({ viewerUserId: brandedId("UserId"), output: listInboxResultSchema })
  .refine(
    ({ viewerUserId, output }) => output.items.every((item) => item.payload.recipientUserId === viewerUserId),
    "Corpus inbox snapshot recipient mismatch",
  );
const notificationInboxSchema = z.strictObject({
  readerRaised: inboxSnapshotSchema,
  readerRead: inboxSnapshotSchema,
  readerSettled: inboxSnapshotSchema,
  readerFinal: inboxSnapshotSchema,
  foreignBefore: inboxSnapshotSchema,
  foreignAfter: inboxSnapshotSchema,
  hostAccepted: inboxSnapshotSchema,
});
const memberMessagesSnapshotSchema = z
  .strictObject({ viewerUserId: brandedId("UserId"), chatId: typeIdSchema(ID_PREFIX.chat), output: messagesPageSchema })
  .refine(({ chatId, output }) => output.messages.every((message) => message.chatId === chatId), "Corpus member snapshot chat mismatch");
const chatLifecycleMemberSchema = z.strictObject({
  heldDuring: memberMessagesSnapshotSchema,
  heldCompleted: memberMessagesSnapshotSchema,
  abortedDuring: memberMessagesSnapshotSchema,
  abortedCompleted: memberMessagesSnapshotSchema,
});

export type CorpusNotificationInbox = {
  readonly [Snapshot in keyof z.output<typeof notificationInboxSchema>]: CorpusViewerRead<"notifications.list">;
};
export type CorpusChatLifecycleMember = {
  readonly [Snapshot in keyof z.output<typeof chatLifecycleMemberSchema>]: CorpusMemberMessagesRead;
};

const corpusAuthSchema = z.strictObject({
  anonymousConfig: authConfigSchema,
  anonymousMe: authMeSchema,
  signedInConfig: authConfigSchema,
  signedInMe: authMeSchema,
});

/** Public responses captured with one native cookie; these bytes do not authenticate another request. */
export const corpusCookieIdentitySchema = z
  .strictObject({ viewer: viewerViewSchema, authMe: authMeSchema, authConfig: authConfigSchema })
  .refine(
    ({ viewer, authMe, authConfig }) =>
      authConfig.mode === "local" && authMe.authenticated && authMe.handle === viewer.handle && authMe.role === viewer.globalRole,
    "Corpus cookie identity response mismatch",
  );
export type CorpusCookieIdentity = z.output<typeof corpusCookieIdentitySchema>;
const memberIdentitiesSchema = z
  .strictObject({ notificationReader: corpusCookieIdentitySchema, sharedMember: corpusCookieIdentitySchema })
  .refine(({ notificationReader, sharedMember }) => notificationReader.viewer.userId !== sharedMember.viewer.userId, "Corpus member identity cohort mismatch");
export type CorpusMemberIdentities = z.output<typeof memberIdentitiesSchema>;

const corpusOidcSchema = z.strictObject({
  anonymousConfig: authConfigSchema,
  ownerMe: authMeSchema,
  pendingPreview: signedOutInvitePreviewSchema,
  confirmation: pendingJoinConfirmResultSchema,
  joinerMe: authMeSchema,
});

/** The finite corpus requests, not a replacement for the production routers' input parsers. */
export const corpusReadInput = {
  absent: (): undefined => undefined,
  notificationInbox: (): CorpusRead<"notifications.list">["input"] => ({}),
  documentList: (): CorpusRead<"databank.list">["input"] => ({}),
  ownerLatency: (): CorpusRead<"stats.latency">["input"] => ({ kind: "owner" }),
  persona: ({ id }: Pick<z.output<typeof personaDetailSchema>, "id">): CorpusRead<"persona.get">["input"] => ({ personaId: id }),
  chat: ({ id }: Pick<z.output<typeof chatDetailSchema>, "id">): CorpusRead<"chat.getChat">["input"] => ({ chatId: id }),
  document: ({ id }: Pick<z.output<typeof documentDetailViewSchema>, "id">): CorpusRead<"databank.get">["input"] => ({ id, includeText: true }),
};

const publishedCorpusSchema = z
  .strictObject({
    auth: corpusAuthSchema,
    oidc: corpusOidcSchema.optional(),
    health: healthResponseSchema,
    pluginLibrary: pluginLibrarySchema.optional(),
    notificationInbox: notificationInboxSchema.optional(),
    chatLifecycleMember: chatLifecycleMemberSchema.optional(),
    worldInfoLibrary: worldInfoLibrarySchema.optional(),
    regexLibrary: regexLibrarySchema.optional(),
    libraryRelations: libraryRelationsSchema.optional(),
    searchLibrary: corpusSearchSchema.optional(),
    memberIdentities: memberIdentitiesSchema.optional(),
    reads: z.strictObject({
      "sessions.me": viewerViewSchema.array(),
      "settings.getUserSettings": userSettingsViewSchema.array(),
      "settings.listThemes": themeViewSchema.array().array(),
      "character.list": listCharactersResultSchema.array(),
      "character.count": z.int().nonnegative().array(),
      "persona.list": personaDetailSchema.array().array(),
      "persona.get": personaDetailSchema.array(),
      "chat.listChats": chatListPageSchema.array(),
      "chat.countChats": z.int().nonnegative().array(),
      "chat.getChat": chatDetailSchema.array(),
      "databank.get": documentDetailViewSchema.array(),
      "databank.list": listDocumentsResultSchema.array(),
      "databank.bankHealth": bankHealthViewSchema.array(),
      "notifications.list": listInboxResultSchema.array(),
      "tag.listPendingSuggestions": tagSuggestionViewSchema.array().array(),
      "worldInfo.countBooks": z.int().nonnegative().array(),
      "regex.countScripts": z.int().nonnegative().array(),
      "rosterPreset.count": z.int().nonnegative().array(),
      "automation.getOwnerBudgets": ownerBudgetViewSchema.array(),
      "stats.overview": ownerStatsViewSchema.nullable().array(),
      "stats.wrapped": wrappedSummarySchema.nullable().array(),
      "stats.byModel": modelStatRowSchema.array().array(),
      "stats.latency": latencyStatsSchema.array(),
      "stats.personaUsage": personaUsageRowSchema.array().array(),
      "stats.timeseries": activityBucketSchema.array().array(),
      "stats.leaderboard": leaderboardPageSchema.array(),
      "stats.freshness": statsFreshnessSchema.array(),
      "stats.momentum": momentumBucketSchema.array().array(),
    }),
  })
  .refine(({ memberIdentities, notificationInbox, chatLifecycleMember }) => {
    if (memberIdentities === undefined) {
      return true;
    }
    const readerId = memberIdentities.notificationReader.viewer.userId;
    const sharedId = memberIdentities.sharedMember.viewer.userId;
    return (
      (notificationInbox === undefined ||
        [notificationInbox.readerRaised, notificationInbox.readerRead, notificationInbox.readerSettled, notificationInbox.readerFinal].every(
          (snapshot) => snapshot.viewerUserId === readerId,
        )) &&
      (chatLifecycleMember === undefined || Object.values(chatLifecycleMember).every((snapshot) => snapshot.viewerUserId === sharedId))
    );
  }, "Corpus member identity viewer mismatch")
  .refine(
    ({ pluginLibrary, reads }) => pluginLibrary === undefined || pluginLibrary.ownerActive.viewerUserId === reads["sessions.me"][0]?.userId,
    "Corpus plugin owner viewer mismatch",
  );

export interface CorpusReads {
  readonly "sessions.me": readonly CorpusRead<"sessions.me">[];
  readonly "settings.getUserSettings": readonly CorpusRead<"settings.getUserSettings">[];
  readonly "settings.listThemes": readonly CorpusRead<"settings.listThemes">[];
  readonly "character.list": readonly CorpusRead<"character.list">[];
  readonly "character.count": readonly CorpusRead<"character.count">[];
  readonly "persona.list": readonly CorpusRead<"persona.list">[];
  readonly "persona.get": readonly CorpusRead<"persona.get">[];
  readonly "chat.listChats": readonly CorpusRead<"chat.listChats">[];
  readonly "chat.countChats": readonly CorpusRead<"chat.countChats">[];
  readonly "chat.getChat": readonly CorpusRead<"chat.getChat">[];
  readonly "databank.get": readonly CorpusRead<"databank.get">[];
  readonly "databank.list": readonly CorpusRead<"databank.list">[];
  readonly "databank.bankHealth": readonly CorpusRead<"databank.bankHealth">[];
  readonly "notifications.list": readonly CorpusRead<"notifications.list">[];
  readonly "tag.listPendingSuggestions": readonly CorpusRead<"tag.listPendingSuggestions">[];
  readonly "worldInfo.countBooks": readonly CorpusRead<"worldInfo.countBooks">[];
  readonly "regex.countScripts": readonly CorpusRead<"regex.countScripts">[];
  readonly "rosterPreset.count": readonly CorpusRead<"rosterPreset.count">[];
  readonly "automation.getOwnerBudgets": readonly CorpusRead<"automation.getOwnerBudgets">[];
  readonly "stats.overview": readonly CorpusRead<"stats.overview">[];
  readonly "stats.wrapped": readonly CorpusRead<"stats.wrapped">[];
  readonly "stats.byModel": readonly CorpusRead<"stats.byModel">[];
  readonly "stats.latency": readonly CorpusRead<"stats.latency">[];
  readonly "stats.personaUsage": readonly CorpusRead<"stats.personaUsage">[];
  readonly "stats.timeseries": readonly CorpusRead<"stats.timeseries">[];
  readonly "stats.leaderboard": readonly CorpusRead<"stats.leaderboard">[];
  readonly "stats.freshness": readonly CorpusRead<"stats.freshness">[];
  readonly "stats.momentum": readonly CorpusRead<"stats.momentum">[];
}

/** Serializable input produced by the Node publisher, not an intake for arbitrary procedure requests. */
export interface CorpusWireInput {
  readonly pluginLibrary?: CorpusPluginLibrary;
  readonly searchLibrary?: CorpusSearchLibrary;
  readonly libraryRelations?: CorpusLibraryRelations;
  readonly memberIdentities?: CorpusMemberIdentities;
  readonly worldInfoLibrary?: CorpusWorldInfoLibrary;
  readonly regexLibrary?: CorpusRegexLibrary;
  readonly auth: z.input<typeof corpusAuthSchema>;
  readonly oidc?: z.input<typeof corpusOidcSchema>;
  readonly health: z.input<typeof healthResponseSchema>;
  readonly reads: CorpusReads;
  readonly notificationInbox?: CorpusNotificationInbox;
  readonly chatLifecycleMember?: CorpusChatLifecycleMember;
}

export interface CorpusWire {
  readonly pluginLibrary?: CorpusPluginLibrary;
  readonly searchLibrary?: CorpusSearchLibrary;
  readonly libraryRelations?: CorpusLibraryRelations;
  readonly memberIdentities?: CorpusMemberIdentities;
  readonly worldInfoLibrary?: CorpusWorldInfoLibrary;
  readonly regexLibrary?: CorpusRegexLibrary;
  readonly auth: z.output<typeof corpusAuthSchema>;
  readonly oidc?: z.output<typeof corpusOidcSchema>;
  readonly health: z.output<typeof healthResponseSchema>;
  readonly reads: CorpusReads;
  readonly notificationInbox?: CorpusNotificationInbox;
  readonly chatLifecycleMember?: CorpusChatLifecycleMember;
}

function hydrateReads<Input, Output>(
  records: readonly CorpusCapture<Input, Output>[],
  outputSchema: z.ZodType<NoInfer<Output>>,
): readonly CorpusCapture<Input, Output>[] {
  return records.map((record) => ({ input: record.input, output: outputSchema.parse(record.output) }));
}

function validateCorpusSections(input: CorpusWireInput): void {
  if (input.pluginLibrary !== undefined) {
    publishCorpusPlugins(input.pluginLibrary);
  }
  if (input.searchLibrary !== undefined) {
    publishCorpusSearch(input.searchLibrary);
  }
  if (input.libraryRelations !== undefined) {
    publishLibraryRelations(input.libraryRelations);
  }
  if (input.memberIdentities !== undefined) {
    memberIdentitiesSchema.parse(input.memberIdentities);
  }
  if (input.worldInfoLibrary !== undefined) {
    publishWorldInfoLibrary(input.worldInfoLibrary);
  }
  if (input.regexLibrary !== undefined) {
    publishRegexLibrary(input.regexLibrary);
  }
  // Validate outputs without rebuilding inputs; publication must still see changed or malformed requests.
  if (input.notificationInbox !== undefined) {
    publishInbox(input.notificationInbox);
  }
  if (input.chatLifecycleMember !== undefined) {
    publishMemberMessages(input.chatLifecycleMember);
  }
}

/** Validate published captures through their real owners while preserving each exact captured input. */
export function hydrateCorpusWire(input: CorpusWireInput): CorpusWire {
  validateCorpusSections(input);
  return {
    auth: corpusAuthSchema.parse(input.auth),
    ...(input.oidc === undefined ? {} : { oidc: corpusOidcSchema.parse(input.oidc) }),
    health: healthResponseSchema.parse(input.health),
    ...(input.pluginLibrary === undefined ? {} : { pluginLibrary: input.pluginLibrary }),
    ...(input.searchLibrary === undefined ? {} : { searchLibrary: input.searchLibrary }),
    ...(input.libraryRelations === undefined ? {} : { libraryRelations: input.libraryRelations }),
    ...(input.memberIdentities === undefined ? {} : { memberIdentities: input.memberIdentities }),
    ...(input.worldInfoLibrary === undefined ? {} : { worldInfoLibrary: input.worldInfoLibrary }),
    ...(input.regexLibrary === undefined ? {} : { regexLibrary: input.regexLibrary }),
    ...(input.notificationInbox === undefined ? {} : { notificationInbox: input.notificationInbox }),
    ...(input.chatLifecycleMember === undefined ? {} : { chatLifecycleMember: input.chatLifecycleMember }),
    reads: {
      "sessions.me": hydrateReads(input.reads["sessions.me"], viewerViewSchema),
      "settings.getUserSettings": hydrateReads(input.reads["settings.getUserSettings"], userSettingsViewSchema),
      "settings.listThemes": hydrateReads(input.reads["settings.listThemes"], themeViewSchema.array()),
      "character.list": hydrateReads(input.reads["character.list"], listCharactersResultSchema),
      "character.count": hydrateReads(input.reads["character.count"], z.int().nonnegative()),
      "persona.list": hydrateReads(input.reads["persona.list"], personaDetailSchema.array()),
      "persona.get": hydrateReads(input.reads["persona.get"], personaDetailSchema),
      "chat.listChats": hydrateReads(input.reads["chat.listChats"], chatListPageSchema),
      "chat.countChats": hydrateReads(input.reads["chat.countChats"], z.int().nonnegative()),
      "chat.getChat": hydrateReads(input.reads["chat.getChat"], chatDetailSchema),
      "databank.get": hydrateReads(input.reads["databank.get"], documentDetailViewSchema),
      "databank.list": hydrateReads(input.reads["databank.list"], listDocumentsResultSchema),
      "databank.bankHealth": hydrateReads(input.reads["databank.bankHealth"], bankHealthViewSchema),
      "notifications.list": hydrateReads(input.reads["notifications.list"], listInboxResultSchema),
      "tag.listPendingSuggestions": hydrateReads(input.reads["tag.listPendingSuggestions"], tagSuggestionViewSchema.array()),
      "worldInfo.countBooks": hydrateReads(input.reads["worldInfo.countBooks"], z.int().nonnegative()),
      "regex.countScripts": hydrateReads(input.reads["regex.countScripts"], z.int().nonnegative()),
      "rosterPreset.count": hydrateReads(input.reads["rosterPreset.count"], z.int().nonnegative()),
      "automation.getOwnerBudgets": hydrateReads(input.reads["automation.getOwnerBudgets"], ownerBudgetViewSchema),
      "stats.overview": hydrateReads(input.reads["stats.overview"], ownerStatsViewSchema.nullable()),
      "stats.wrapped": hydrateReads(input.reads["stats.wrapped"], wrappedSummarySchema.nullable()),
      "stats.byModel": hydrateReads(input.reads["stats.byModel"], modelStatRowSchema.array()),
      "stats.latency": hydrateReads(input.reads["stats.latency"], latencyStatsSchema),
      "stats.personaUsage": hydrateReads(input.reads["stats.personaUsage"], personaUsageRowSchema.array()),
      "stats.timeseries": hydrateReads(input.reads["stats.timeseries"], activityBucketSchema.array()),
      "stats.leaderboard": hydrateReads(input.reads["stats.leaderboard"], leaderboardPageSchema),
      "stats.freshness": hydrateReads(input.reads["stats.freshness"], statsFreshnessSchema),
      "stats.momentum": hydrateReads(input.reads["stats.momentum"], momentumBucketSchema.array()),
    },
  };
}

function inputless<T>(output: T): { readonly input: undefined; readonly output: T } {
  return { input: corpusReadInput.absent(), output };
}

function publishInbox(section: CorpusNotificationInbox): z.output<typeof notificationInboxSchema> {
  return notificationInboxSchema.parse(
    Object.fromEntries(Object.entries(section).map(([name, snapshot]) => [name, { viewerUserId: snapshot.viewerUserId, output: snapshot.read.output }])),
  );
}

function publishMemberMessages(section: CorpusChatLifecycleMember): z.output<typeof chatLifecycleMemberSchema> {
  return chatLifecycleMemberSchema.parse(
    Object.fromEntries(
      Object.entries(section).map(([name, snapshot]) => [name, { viewerUserId: snapshot.viewerUserId, chatId: snapshot.chatId, output: snapshot.read.output }]),
    ),
  );
}

function hydrateInboxSnapshot(snapshot: z.output<typeof inboxSnapshotSchema>): CorpusViewerRead<"notifications.list"> {
  return { viewerUserId: snapshot.viewerUserId, read: { input: corpusReadInput.notificationInbox(), output: snapshot.output } };
}

function hydrateInbox(section: z.output<typeof notificationInboxSchema>): CorpusNotificationInbox {
  return {
    readerRaised: hydrateInboxSnapshot(section.readerRaised),
    readerRead: hydrateInboxSnapshot(section.readerRead),
    readerSettled: hydrateInboxSnapshot(section.readerSettled),
    readerFinal: hydrateInboxSnapshot(section.readerFinal),
    foreignBefore: hydrateInboxSnapshot(section.foreignBefore),
    foreignAfter: hydrateInboxSnapshot(section.foreignAfter),
    hostAccepted: hydrateInboxSnapshot(section.hostAccepted),
  };
}

function hydrateMemberSnapshot(snapshot: z.output<typeof memberMessagesSnapshotSchema>): CorpusMemberMessagesRead {
  return {
    viewerUserId: snapshot.viewerUserId,
    chatId: snapshot.chatId,
    read: { input: corpusReadInput.chat({ id: snapshot.chatId }), output: snapshot.output },
  };
}

function hydrateMemberMessages(section: z.output<typeof chatLifecycleMemberSchema>): CorpusChatLifecycleMember {
  return {
    heldDuring: hydrateMemberSnapshot(section.heldDuring),
    heldCompleted: hydrateMemberSnapshot(section.heldCompleted),
    abortedDuring: hydrateMemberSnapshot(section.abortedDuring),
    abortedCompleted: hydrateMemberSnapshot(section.abortedCompleted),
  };
}

function hydratePublication(published: z.output<typeof publishedCorpusSchema>): CorpusWire {
  const { reads } = published;
  return {
    auth: published.auth,
    ...(published.oidc === undefined ? {} : { oidc: published.oidc }),
    health: published.health,
    ...(published.pluginLibrary === undefined ? {} : { pluginLibrary: hydrateCorpusPlugins(published.pluginLibrary) }),
    ...(published.searchLibrary === undefined ? {} : { searchLibrary: hydrateCorpusSearch(published.searchLibrary) }),
    ...(published.libraryRelations === undefined ? {} : { libraryRelations: hydrateLibraryRelations(published.libraryRelations) }),
    ...(published.memberIdentities === undefined ? {} : { memberIdentities: published.memberIdentities }),
    ...(published.worldInfoLibrary === undefined ? {} : { worldInfoLibrary: hydrateWorldInfoLibrary(published.worldInfoLibrary) }),
    ...(published.regexLibrary === undefined ? {} : { regexLibrary: hydrateRegexLibrary(published.regexLibrary) }),
    ...(published.notificationInbox === undefined ? {} : { notificationInbox: hydrateInbox(published.notificationInbox) }),
    ...(published.chatLifecycleMember === undefined ? {} : { chatLifecycleMember: hydrateMemberMessages(published.chatLifecycleMember) }),
    reads: {
      "sessions.me": reads["sessions.me"].map(inputless),
      "settings.getUserSettings": reads["settings.getUserSettings"].map(inputless),
      "settings.listThemes": reads["settings.listThemes"].map(inputless),
      "character.list": reads["character.list"].map(inputless),
      "character.count": reads["character.count"].map(inputless),
      "persona.list": reads["persona.list"].map(inputless),
      "persona.get": reads["persona.get"].map((output) => ({ input: corpusReadInput.persona(output), output })),
      "chat.listChats": reads["chat.listChats"].map(inputless),
      "chat.countChats": reads["chat.countChats"].map(inputless),
      "chat.getChat": reads["chat.getChat"].map((output) => ({ input: corpusReadInput.chat(output), output })),
      "databank.get": reads["databank.get"].map((output) => ({ input: corpusReadInput.document(output), output })),
      "databank.list": reads["databank.list"].map((output) => ({ input: corpusReadInput.documentList(), output })),
      "databank.bankHealth": reads["databank.bankHealth"].map(inputless),
      "notifications.list": reads["notifications.list"].map(inputless),
      "tag.listPendingSuggestions": reads["tag.listPendingSuggestions"].map(inputless),
      "worldInfo.countBooks": reads["worldInfo.countBooks"].map(inputless),
      "regex.countScripts": reads["regex.countScripts"].map(inputless),
      "rosterPreset.count": reads["rosterPreset.count"].map(inputless),
      "automation.getOwnerBudgets": reads["automation.getOwnerBudgets"].map(inputless),
      "stats.overview": reads["stats.overview"].map(inputless),
      "stats.wrapped": reads["stats.wrapped"].map(inputless),
      "stats.byModel": reads["stats.byModel"].map(inputless),
      "stats.latency": reads["stats.latency"].map((output) => ({ input: corpusReadInput.ownerLatency(), output })),
      "stats.personaUsage": reads["stats.personaUsage"].map(inputless),
      "stats.timeseries": reads["stats.timeseries"].map(inputless),
      "stats.leaderboard": reads["stats.leaderboard"].map(inputless),
      "stats.freshness": reads["stats.freshness"].map(inputless),
      "stats.momentum": reads["stats.momentum"].map(inputless),
    },
  };
}

function capturedInputs(reads: CorpusReads): string {
  return stableStringify(
    Object.fromEntries(
      Object.entries<readonly CorpusRead<keyof CorpusReads>[]>({ ...reads }).map(([path, records]) => [
        path,
        records.map(({ input }) => (input === undefined ? { present: false } : { present: true, value: input })),
      ]),
    ),
  );
}

function capturedSnapshotInputs(wire: CorpusWire): string {
  const request = <T>(input: T): { readonly present: boolean; readonly value?: T } =>
    input === undefined ? { present: false } : { present: true, value: input };
  const plugins = wire.pluginLibrary;
  return stableStringify({
    pluginLibrary:
      plugins === undefined
        ? {}
        : {
            ...Object.fromEntries(
              Object.entries({
                ownerPending: plugins.ownerPending,
                ownerActive: plugins.ownerActive,
                recipientActive: plugins.recipientActive,
                ownerDisabled: plugins.ownerDisabled,
              }).map(([name, stage]) => [name, Object.fromEntries(Object.entries(stage.reads).map(([key, read]) => [key, request(read.input)]))]),
            ),
            ownerFinal: request(plugins.ownerFinal.read.input),
            distribution: request(plugins.distribution.read.input),
          },
    searchLibrary: Object.fromEntries(Object.entries(wire.searchLibrary?.reads ?? {}).map(([name, read]) => [name, request(read.input)])),
    searchRooms: wire.searchLibrary?.rooms.map((room) => request(room.input)) ?? [],
    libraryRelations: Object.fromEntries(Object.entries(wire.libraryRelations?.reads ?? {}).map(([name, read]) => [name, request(read.input)])),
    worldInfoLibrary: Object.fromEntries(Object.entries(wire.worldInfoLibrary?.reads ?? {}).map(([name, read]) => [name, request(read.input)])),
    regexLibrary: Object.fromEntries(Object.entries(wire.regexLibrary?.reads ?? {}).map(([name, read]) => [name, request(read.input)])),
    notificationInbox: Object.fromEntries(Object.entries(wire.notificationInbox ?? {}).map(([name, snapshot]) => [name, request(snapshot.read.input)])),
    chatLifecycleMember: Object.fromEntries(Object.entries(wire.chatLifecycleMember ?? {}).map(([name, snapshot]) => [name, request(snapshot.read.input)])),
  });
}

/** Encode strict captures without making a publication or secret-scrubbing claim. */
export function encodeCorpusWire(wire: CorpusWire): string {
  const published = publishedCorpusSchema.parse({
    auth: wire.auth,
    ...(wire.oidc === undefined ? {} : { oidc: wire.oidc }),
    health: wire.health,
    ...(wire.pluginLibrary === undefined ? {} : { pluginLibrary: publishCorpusPlugins(wire.pluginLibrary) }),
    ...(wire.searchLibrary === undefined ? {} : { searchLibrary: publishCorpusSearch(wire.searchLibrary) }),
    ...(wire.libraryRelations === undefined ? {} : { libraryRelations: publishLibraryRelations(wire.libraryRelations) }),
    ...(wire.memberIdentities === undefined ? {} : { memberIdentities: wire.memberIdentities }),
    ...(wire.worldInfoLibrary === undefined ? {} : { worldInfoLibrary: publishWorldInfoLibrary(wire.worldInfoLibrary) }),
    ...(wire.regexLibrary === undefined ? {} : { regexLibrary: publishRegexLibrary(wire.regexLibrary) }),
    ...(wire.notificationInbox === undefined ? {} : { notificationInbox: publishInbox(wire.notificationInbox) }),
    ...(wire.chatLifecycleMember === undefined ? {} : { chatLifecycleMember: publishMemberMessages(wire.chatLifecycleMember) }),
    reads: Object.fromEntries(
      Object.entries<readonly CorpusRead<keyof CorpusReads>[]>({ ...wire.reads }).map(([path, records]) => [path, records.map(({ output }) => output)]),
    ),
  });
  const restored = hydratePublication(published);
  if (capturedInputs(wire.reads) !== capturedInputs(restored.reads) || capturedSnapshotInputs(wire) !== capturedSnapshotInputs(restored)) {
    throw new Error("Corpus request does not match its publication recipe");
  }
  const serialized = JSON.stringify(published);
  return serialized;
}

/** Refuse changed requests and producer-known private values; publication never repairs captured data. */
export function serializeCorpusWire(wire: CorpusWire, secrets: readonly string[]): string {
  const literals = secretRedactionLiterals(secrets);
  const containsPrivate = (text: string): boolean => literals.some((literal) => text.includes(literal));
  // Inspect native captures before schema diagnostics can echo private keys or invalid values.
  const captured = JSON.stringify(wire, (key, value: JsonValue | undefined) => {
    if (containsPrivate(key) || (typeof value === "string" && containsPrivate(value))) {
      throw new Error(PRIVATE_MATERIAL_MESSAGE);
    }
    return value;
  });
  if (containsPrivate(captured)) {
    throw new Error(PRIVATE_MATERIAL_MESSAGE);
  }
  const serialized = encodeCorpusWire(wire);
  if (containsPrivate(serialized)) {
    throw new Error(PRIVATE_MATERIAL_MESSAGE);
  }
  return serialized;
}

/** Disk/browser intake validates the strict corpus envelope and each output through its canonical owner. */
export function parseCorpusWire(serialized: string): CorpusWire {
  return hydratePublication(publishedCorpusSchema.parse(JSON.parse(serialized)));
}
