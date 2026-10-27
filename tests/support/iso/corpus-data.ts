// Corpus declarations and schemas stay below publication and playback admission to keep their dependency graph acyclic.
import { authConfigSchema } from "@orb/contracts/auth-config";
import { messagesPageSchema, pendingJoinConfirmResultSchema, signedOutInvitePreviewSchema } from "@orb/contracts/chat";
import type { healthResponseSchema } from "@orb/contracts/diagnostics";
import { authMeSchema, viewerViewSchema } from "@orb/contracts/identity";
import { listInboxResultSchema } from "@orb/contracts/notifications";
import type { ChatId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { CorpusFirstBoot } from "./corpus-first-boot.ts";
import type { CorpusRegexLibrary, CorpusWorldInfoLibrary } from "./corpus-library.ts";
import type { CorpusLibraryRelations } from "./corpus-library-relations.ts";
import type { CorpusPlaybackView } from "./corpus-playback.ts";
import type { CorpusPluginLibrary } from "./corpus-plugin.ts";
import type { CorpusRead, CorpusViewerRead } from "./corpus-read.ts";
import type { CorpusSearchLibrary } from "./corpus-search.ts";
import type { CorpusShellAmbient } from "./corpus-shell.ts";

export interface CorpusMemberMessagesRead extends CorpusViewerRead<"chat.listMessages"> {
  readonly chatId: ChatId;
}

export const inboxSnapshotSchema = z
  .strictObject({ viewerUserId: brandedId("UserId"), output: listInboxResultSchema })
  .refine(
    ({ viewerUserId, output }) => output.items.every((item) => item.payload.recipientUserId === viewerUserId),
    "Corpus inbox snapshot recipient mismatch",
  );
export const notificationInboxSchema = z.strictObject({
  readerRaised: inboxSnapshotSchema,
  readerRead: inboxSnapshotSchema,
  readerSettled: inboxSnapshotSchema,
  readerFinal: inboxSnapshotSchema,
  foreignBefore: inboxSnapshotSchema,
  foreignAfter: inboxSnapshotSchema,
  hostAccepted: inboxSnapshotSchema,
});
export const memberMessagesSnapshotSchema = z
  .strictObject({ viewerUserId: brandedId("UserId"), chatId: typeIdSchema(ID_PREFIX.chat), output: messagesPageSchema })
  .refine(({ chatId, output }) => output.messages.every((message) => message.chatId === chatId), "Corpus member snapshot chat mismatch");
export const chatLifecycleMemberSchema = z.strictObject({
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

export const corpusAuthSchema = z.strictObject({
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
export const memberIdentitiesSchema = z
  .strictObject({ notificationReader: corpusCookieIdentitySchema, sharedMember: corpusCookieIdentitySchema })
  .refine(({ notificationReader, sharedMember }) => notificationReader.viewer.userId !== sharedMember.viewer.userId, "Corpus member identity cohort mismatch");
type CorpusMemberIdentities = z.output<typeof memberIdentitiesSchema>;

export const corpusOidcSchema = z.strictObject({
  anonymousConfig: authConfigSchema,
  ownerMe: authMeSchema,
  pendingPreview: signedOutInvitePreviewSchema,
  confirmation: pendingJoinConfirmResultSchema,
  joinerMe: authMeSchema,
});

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
  readonly shellAmbient?: CorpusShellAmbient;
  readonly firstBoot?: CorpusFirstBoot;
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
  readonly shellAmbient?: CorpusShellAmbient;
  readonly firstBoot?: CorpusFirstBoot;
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

/** A validated fixture's playback custody; the serializable publication type stays raw. */
export type CorpusPlayback = CorpusPlaybackView<CorpusWire>;
