// @subject tests/support/node/corpus.ts
import "@orb/testkit/node/composed-real.ts";
// The native clone's module graph belongs to import time, not the case's execution budget.
import "@orb/tooling/snap";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createCharacterSchema } from "@orb/contracts/character";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { NOTIFICATION_TYPES } from "@orb/contracts/notifications";
import { rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import {
  assertReferentialIntegrity,
  assets,
  automationFires,
  chatHandoffResumptions,
  chatImportClaims,
  chatLocks,
  closeDb,
  compactionSpend,
  createDb,
  detachWal,
  documentChunks,
  imageIndexSkips,
  imageryGenerations,
  imageryImportCalls,
  messageReactions,
  ownerStats,
  pendingTurns,
  plugins,
  sessions,
  themes,
  userCredentials,
  userSettings,
  users,
  workloadSchedules,
} from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "@orb/server/domain/plugin";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createCas } from "@orb/server/infra/storage/cas";
import type { CorpusSearchLibrary } from "@orb/testkit/iso/corpus.ts";
import { parseCorpusWire } from "@orb/testkit/iso/corpus.ts";
import { createCorpusCapsule, loadCorpusFixture, prepareCorpusFixture } from "@orb/testkit/node/corpus.ts";
import { createCorpusRecipe, CORPUS_OWNER_PASSWORD as OWNER_PASSWORD, CORPUS_PROVIDER_KEY as PROVIDER_KEY } from "@orb/testkit/node/corpus-recipe.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/oidc-issuer.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { captureCorpusCookieIdentity } from "./corpus-auth.ts";
import { CORPUS_CONNECTION_FOREIGN_KEY, CORPUS_CONNECTION_HOSTED_KEY, CORPUS_CONNECTION_KEY, CORPUS_CONNECTION_MODEL } from "./corpus-connection-wire.ts";
import { CORPUS_KNOWLEDGE_SWIPE_TAKES } from "./corpus-knowledge-wire.ts";
import { CORPUS_NOTIFICATION_PLUGIN_ERROR, captureCorpusNotificationRows } from "./corpus-notifications.ts";
import { RPG_JOURNAL_TITLES } from "./corpus-rpg-flight-wire.ts";
import { CORPUS_SDK_TOKEN } from "./corpus-sdk-protocol.ts";
import { replayCorpusSearchWire } from "./corpus-search-wire.ts";
import { captureCookieAuth } from "./corpus-seed.ts";
import { captureSdkSessionRows } from "./factories/connection.ts";
import { seedUserCredential } from "./factories/credentials.ts";
import { captureDocumentChunks } from "./factories/embedding-generation.ts";
import { captureRegexRows } from "./factories/regex.ts";
import { captureRosterRows } from "./factories/roster-preset.ts";
import { captureRpgSnapshot } from "./factories/rpg.ts";
import { captureWorldBookRows } from "./factories/world-info.ts";

const CLONE_MARKER = 123;
const CLONE_READER_PASSWORD = "fresh-clone-notification-reader-password";
const CLONE_MEMBER_PASSWORD = "fresh-clone-shared-member-password";
const CLONE_ROTATED_READER_PASSWORD = "rotated-clone-notification-reader-password";

async function assertNativeSearchReads(caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>, section: CorpusSearchLibrary): Promise<void> {
  for (const read of [
    section.reads.entities,
    section.reads.characters,
    section.reads.discover,
    section.reads.digests,
    section.reads.corpus,
    section.reads.documents,
    section.reads.segments,
    section.reads.imagesRaw,
    section.reads.imagesCaptioned,
  ]) {
    expect(await caller.search.search(read.input)).toEqual(read.output);
  }
  expect(await caller.search.fields(section.reads.fields.input)).toEqual(section.reads.fields.output);
  expect(await caller.search.suggest(section.reads.suggest.input)).toEqual(section.reads.suggest.output);
  expect(await caller.search.similarArt(section.reads.similarRaw.input)).toEqual(section.reads.similarRaw.output);
  expect(await caller.search.similarArt(section.reads.similarCaptioned.input)).toEqual(section.reads.similarCaptioned.output);
  expect(await caller.search.spaceStatus(section.reads.status.input)).toEqual(section.reads.status.output);
}

test("a completed migrated capsule closes its real producers before cloning scrubbed independent DB and CAS bytes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-completed-corpus-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const { options, key, clock, ids, swipes, lifecycleWire, rpgFlightWire } = await createCorpusRecipe(parent);
  const capsule = ownership.use(
    await createCorpusCapsule({
      directory: join(parent, "capsule root"),
      ...options,
    }),
  );
  expect(capsule.replay).toEqual({ version: 1, nowMs: clock.now(), idCursor: ids.snapshot() });
  expect(await readdir(parent)).toEqual(["capsule root"]);
  expect(capsule.privateCaptures.oidc.ownerId).toBe(capsule.privateCaptures.baseline.ownerId);
  expect(capsule.privateCaptures.recall.traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)).toBe(true);
  expect(capsule.privateCaptures.recall.memory.speakers.length).toBeGreaterThan(0);
  expect(capsule.wire.pluginLibrary).toEqual(capsule.privateCaptures.plugins.library);
  expect(capsule.privateCaptures.plugins.recipient.plugin).toMatchObject({ ownerId: capsule.privateCaptures.oidc.joiner.id, status: "enabled" });
  expect(capsule.privateCaptures.plugins.tombstones.map((row) => row.pluginId)).toEqual([null]);
  expect(capsule.privateCaptures.plugins.refused.outcome.status).toBe("errored");
  expect(capsule.privateCaptures.knowledge.jobs.find((job) => job.kind === "compute-cooccurrence")).toMatchObject({
    mode: "bulk",
    ownerId: null,
    status: "succeeded",
  });
  expect(capsule.privateCaptures.knowledge.refinery.customRuns.map((run) => run.id)).toEqual([
    capsule.privateCaptures.knowledge.refinery.customFirst.id,
    capsule.privateCaptures.knowledge.refinery.customSecond.id,
  ]);
  expect(capsule.privateCaptures.knowledge.keywords.pairs.length).toBeGreaterThan(0);
  expect(capsule.privateCaptures.knowledge.themes.assignments.length).toBeGreaterThan(0);
  expect(capsule.privateCaptures.rpg.restoredSnapshot.variantId).toBeNull();
  expect(capsule.privateCaptures.rpg.reads.tracker.ambient?.location).toBe("Orbital loom");
  expect(capsule.privateCaptures.rpg.schedules.completed).toMatchObject([{ status: "succeeded", kind: "reconcile-stats" }]);
  const providerRpg = capsule.privateCaptures.rpgProvider;
  const providerAssistant = providerRpg.turn.messages.find((message) => message.role === "assistant");
  const providerOriginal = providerRpg.foldedRows.snapshots.find((row) => row.variantId === providerAssistant?.selectedVariantId);
  if (providerAssistant === undefined || providerOriginal === undefined) {
    throw new Error("completed native provider graph lost its original folded variant snapshot");
  }
  expect(providerRpg.snapshot.id).not.toBe(providerOriginal.id);
  expect(providerRpg.snapshot).toMatchObject({ messageId: null, variantId: null, asOfMessageId: providerAssistant.id, committed: 1 });
  expect(rpgSnapshotStateSchema.parse(providerRpg.snapshot)).toEqual(rpgSnapshotStateSchema.parse(providerOriginal));
  expect(providerRpg.snapshot.fieldLocks).toEqual(providerOriginal.fieldLocks);
  expect(providerOriginal).toMatchObject({ messageId: providerAssistant.id, variantId: providerAssistant.selectedVariantId, committed: 0 });
  expect(capsule.privateCaptures.rpgProvider.journal).toMatchObject([
    { type: "event", label: "" },
    { type: "custom", label: "Expedition" },
  ]);
  const variants = capsule.privateCaptures.knowledgeVariants;
  expect(variants.home.arcThemes.length).toBeGreaterThan(0);
  expect(variants.selectedHotspot).toMatchObject([{ messageId: variants.slot.id, variantCount: 3, snippet: CORPUS_KNOWLEDGE_SWIPE_TAKES[0] }]);
  expect(variants.images.indexed.every((capture) => capture.vectors.length === 2 && capture.analysis?.captionMeta.artStyle === "illustration")).toBe(true);
  expect(variants.images.members.map((member) => member.characterId)).toEqual(expect.arrayContaining(variants.images.cards.map((card) => card.id)));
  expect(swipes.remaining()).toBe(0);
  const lifecycle = capsule.privateCaptures.chatLifecycle;
  expect(lifecycle.imported.imported.claims).toHaveLength(1);
  expect(lifecycle.handoff.marker?.acceptedByUserId).toBe(lifecycle.handoff.participant.userId);
  expect(lifecycle.handoff.finalMarker).toBeUndefined();
  expect(lifecycle.handoff.accepted?.participants.filter((seat) => seat.role === "host").map((seat) => seat.userId)).toEqual([
    lifecycle.handoff.participant.userId,
  ]);
  expect(lifecycle.handoff.final.participants.filter((seat) => seat.role === "host").map((seat) => seat.userId)).toEqual([
    lifecycle.handoff.participant.userId,
  ]);
  expect(lifecycle.handoff.finalSeat.characterId).toBe(lifecycle.handoff.copiedCharacter.id);
  expect(lifecycle.handoff.copiedCharacter.id).not.toBe(lifecycle.handoff.character.id);
  expect(lifecycle.aborted.turn.aborted).toBe(true);
  expect(lifecycle.held.completed.locks).toEqual([]);
  expect(lifecycle.handoff.completed.pending).toEqual([]);
  expect(capsule.privateCaptures.imagery.newerReuse.generations).toEqual(capsule.privateCaptures.imagery.newest.generations);
  expect(capsule.privateCaptures.imagery.rows).toHaveLength(6);
  expect(lifecycleWire.remaining()).toBe(0);
  const rpgFlight = capsule.privateCaptures;
  expect(rpgFlight.rpgRecursion.rows.journal.map((row) => row.title)).toEqual(RPG_JOURNAL_TITLES.slice(0, 2));
  expect(rpgFlight.rpgMembers.checkpointAfter).toEqual(rpgFlight.rpgMembers.checkpointBefore);
  expect(rpgFlight.rpgMembers.recovery.before.rpg?.gameId).toBe(rpgFlight.rpgMembers.forkGame.id);
  expect(rpgFlight.rpgMembers.recovery.healed.rpg).toBeNull();
  expect(rpgFlight.rpgMembers.recovery.repeated).toEqual(rpgFlight.rpgMembers.recovery.healed);
  expect(rpgFlight.rpgMembers.handedChat.participants.filter((seat) => seat.role === "host").map((seat) => seat.userId)).toEqual([
    rpgFlight.rpgMembers.participant.userId,
  ]);
  expect(rpgFlight.rpgRounds.cancelled.after).toEqual(rpgFlight.rpgRounds.cancelled.before);
  expect(rpgFlight.rpgRounds.cancelled.cancelledCalls).toEqual([]);
  expect(rpgFlight.rpgRounds.cancelled.attemptsWhileWaiting).toBe(rpgFlight.rpgRounds.cancelled.attemptsBeforeNext);
  expect(rpgFlight.rpgRounds.foreignStop.signalAborted).toBe(false);
  expect(rpgFlightWire.remaining()).toEqual({ recursion: 0, rounds: 0 });
  const search = capsule.privateCaptures.search;
  const connections = capsule.privateCaptures.connection;
  const libraryViews = capsule.privateCaptures.libraryViews;
  const statsSettings = capsule.privateCaptures.statsSettings;
  const sdkSessions = capsule.privateCaptures.sdkSessions;
  const notifications = capsule.privateCaptures.notifications;
  const imageVariants = capsule.privateCaptures.imageVariants;
  expect(capsule.wire.notificationInbox).toBeDefined();
  expect(capsule.wire.notificationInbox).toEqual(notifications.publication);
  expect(capsule.wire.chatLifecycleMember).toBeDefined();
  expect(capsule.wire.chatLifecycleMember).toEqual(lifecycle.publication);
  expect(capsule.wire.worldInfoLibrary).toBeDefined();
  expect(capsule.wire.worldInfoLibrary).toEqual(libraryViews.publication.worldInfo);
  expect(capsule.wire.regexLibrary).toBeDefined();
  expect(capsule.wire.regexLibrary).toEqual(libraryViews.publication.regex);
  expect(capsule.wire.libraryRelations).toBeDefined();
  expect(capsule.wire.libraryRelations).toEqual(libraryViews.publication.relations);
  expect(capsule.wire.searchLibrary).toEqual(capsule.privateCaptures.searchPublication);
  expect(capsule.privateCaptures.searchImageJobs).toMatchObject([
    { ownerId: capsule.privateCaptures.baseline.ownerId, kind: "index", status: "succeeded", params: { source: "image" } },
  ]);
  expect(capsule.wire.memberIdentities).toBeDefined();
  expect(capsule.wire.memberIdentities).toEqual({
    notificationReader: notifications.admission.identity,
    sharedMember: capsule.privateCaptures.sharedMemberAuthentication.identity,
  });
  expect(imageVariants.skips.map(({ first }) => first.skip)).toMatchObject([
    { reason: "below-dimension-floor", width: 8, height: 8 },
    { reason: "below-dimension-floor", width: 8, height: 64 },
  ]);
  for (const { first, repeated, forced } of imageVariants.skips) {
    expect(first).toMatchObject({ result: null, vectors: [], analysis: undefined });
    expect(repeated).toEqual(first);
    expect(forced).toEqual(first);
  }
  expect(imageVariants.skipPostsAfter).toEqual(imageVariants.skipPostsBefore);
  expect(imageVariants.captioned.picture).toMatchObject({ promptSource: "captioned", costUsd: null });
  expect(imageVariants.previews.captioned.output.costUsd).toBeGreaterThan(0);
  expect(imageVariants.warning.picture.warnings.map((warning) => warning.code)).toEqual(["image_edit_dropped"]);
  expect(imageVariants.edited.generations).toMatchObject([{ edited: true, tokensIn: 23, tokensOut: 11, costUsd: null, costProvenance: "unrecorded" }]);
  expect(imageVariants.rows).toHaveLength(4);
  expect(imageVariants.nullProvenance.map((read) => read.output)).toEqual([null, null, null]);
  expect(imageVariants.afterRefusals).toEqual(imageVariants.beforeRefusals);
  expect(imageVariants.physical.remaining).toBe(0);
  expect(imageVariants.physical.images.every(({ authenticated }) => authenticated)).toBe(true);
  expect(imageVariants.bindings.after.map(({ task, binding }) => [task, binding?.connectionId ?? null])).toEqual(
    imageVariants.bindings.before.map(({ task, binding }) => [task, binding?.connectionId ?? null]),
  );
  expect(notifications.rows.length).toBeGreaterThan(0);
  expect(notifications.inbox.afterRefusal).toEqual(notifications.inbox.beforeRefusal);
  expect(notifications.inbox.foreignAfter).toEqual(notifications.inbox.foreignBefore);
  expect(notifications.live).toContain(notifications.kicked.id);
  expect(notifications.liveSockets).toBe(0);
  expect(notifications.physicalCloses).toHaveLength(2);
  expect(
    notifications.physicalCloses.every(
      (receipt) => receipt.requestDestroyed && receipt.responseClosed && receipt.responseDestroyed && receipt.generatorStopped,
    ),
  ).toBe(true);
  expect(new Set(notifications.rows.map((row) => row.type))).toEqual(new Set(NOTIFICATION_TYPES));
  expect(notifications.producers.paused.result).toEqual({ outcome: "paused" });
  expect(notifications.producers.foreignAfter).toEqual(notifications.producers.foreignBefore);
  expect(notifications.dropped.drained).toEqual({ ran: 0, dropped: 1 });
  expect(notifications.dropped.repeated).toEqual({ ran: 0, dropped: 0 });
  const notificationFires = [
    ...notifications.producers.ruleRun.fires,
    ...notifications.producers.notifyRun.fires,
    ...notifications.producers.paused.fires,
    ...notifications.producers.clean.fires,
  ].toSorted((left, right) => left.id.localeCompare(right.id));
  expect(sdkSessions.empty.rows).toEqual([]);
  expect(sdkSessions.rows.length).toBeGreaterThan(0);
  expect(sdkSessions.rows.filter((row) => row.isPrimary).map((row) => row.connectionId)).toEqual([
    sdkSessions.connection.id,
    sdkSessions.alternateConnection.id,
  ]);
  expect(sdkSessions.foreign.after).toEqual(sdkSessions.foreign.before);
  expect(sdkSessions.foreign.callsAfter).toBe(sdkSessions.foreign.callsBefore);
  expect(sdkSessions.cancellation).toMatchObject({ kind: "aborted" });
  expect(sdkSessions.exits.every(({ exitCode, signalCode }) => exitCode === 0 && signalCode === null)).toBe(true);
  expect(statsSettings.stats.character.output).toMatchObject({ characterId: variants.character.id, assistantTurns: 1, swipes: 2 });
  expect(statsSettings.stats.overview.output?.assistantTurns).toBeGreaterThan(0);
  expect(statsSettings.stats.byModel.output.some((row) => row.generations > 0 && row.tokensOutProvenance === "measured")).toBe(true);
  expect(statsSettings.stats.personas.output.find((row) => row.personaId === statsSettings.history.personaId)?.chatCount).toBeGreaterThan(0);
  expect(statsSettings.stats.boundary.output).toEqual([statsSettings.stats.timeseries.output[0]]);
  expect(statsSettings.afterRepeat.overview.output).toEqual(statsSettings.stats.overview.output);
  expect(statsSettings.settings.duplicate.output.css).toBe(statsSettings.settings.source.output.css);
  expect(statsSettings.settings.source.output.css).not.toBeNull();
  expect(statsSettings.settings.restored.output.config).toEqual(statsSettings.settings.before.output.config);
  expect(statsSettings.settings.importedAgain.output.created).toBe(false);
  expect(statsSettings.afterRefusals).toEqual(statsSettings.beforeRefusals);
  expect(libraryViews.regex.after.output.map((script) => script.id)).toEqual([libraryViews.regex.second.id, libraryViews.regex.first.id]);
  expect(libraryViews.world.orderedEntries.output.map((entry) => entry.id)).toEqual([libraryViews.world.second.id, libraryViews.world.first.id]);
  expect(libraryViews.roster.appliedAgain.output).toMatchObject({
    added: [],
    alreadyPresent: [libraryViews.roster.addedCharacter.id, capsule.privateCaptures.libraries.character.id],
  });
  expect(libraryViews.preset.restoredDefault).toBe(libraryViews.preset.previous);
  expect(libraryViews.roster.persisted.rules.length).toBeGreaterThan(0);
  expect(libraryViews.roster.repeatedRules.output).toEqual(libraryViews.roster.firstRules.output);
  expect(libraryViews.documents.chunks.length).toBeGreaterThan(0);
  expect(libraryViews.documents.repeatedChunks).toEqual(libraryViews.documents.chunks);
  expect(libraryViews.refusals.after).toEqual(libraryViews.refusals.before);
  expect(libraryViews.tags.pendingAfter.output.map((tag) => tag.id)).toContain(capsule.privateCaptures.libraries.tag.id);
  expect(connections.capabilities.summary).toMatchObject({ task: "summarize", connectionId: connections.own.row.id, model: CORPUS_CONNECTION_MODEL });
  expect(connections.list.some((row) => row.id === connections.foreign.row.id)).toBe(false);
  expect(connections.catalogs.afterRawDraft).toEqual(connections.catalogs.beforeRawDraft);
  expect(connections.refusals.after).toEqual(connections.refusals.before);
  expect(connections.refusals.requestsAfter).toBe(connections.refusals.requestsBefore);
  expect(connections.account.afterMalformed).toEqual(connections.account.beforeMalformed);
  expect(connections.account.credits).toEqual({ total: 25, used: 4 });
  expect(connections.account.cost).toEqual({ totalCost: 0.000_011, tokensPrompt: 5, tokensCompletion: 3 });
  expect(connections.diagnostics.ok.ok).toBe(true);
  expect(connections.diagnostics.throttled.status).toBe("throttled");
  expect(connections.diagnostics.unavailable.response).toBeNull();
  expect(new Set(search.reads.outputs.map((output) => output.over))).toEqual(
    new Set(["entities", "characters", "discover", "segments", "digests", "corpus", "images", "documents"]),
  );
  expect(search.reads.outputs.every((output) => output.hits.length > 0 && output.coverage.reranked === false)).toBe(true);
  expect(search.lexical.capped.coverage.matchingCharacters).toBe(2);
  expect(search.lexical.capped.hits).toHaveLength(1);
  expect(search.spaces.moving).toEqual({ paused: true, embed: true, imageEmbed: true });
  expect(search.spaces.settled).toEqual({ paused: false, embed: false, imageEmbed: false });
  expect(search.reads.status).toEqual(search.spaces.settled);
  expect(search.foreign.map((output) => output.hits)).toEqual([[], []]);
  expect(search.foreignSeed).toEqual([]);
  expect(search.spaces.callsAfterEmpty).toEqual(search.spaces.callsBeforeEmpty);
  const documents = search.reads.outputs.find((output) => output.over === "documents");
  const imageHits = search.reads.outputs.filter((output) => output.over === "images").flatMap((output) => output.hits);
  if (documents === undefined) {
    throw new Error("completed native search graph lost its routed document arm");
  }
  expect(documents.hits.some((hit) => hit.documentId === capsule.privateCaptures.libraries.document.id)).toBe(true);
  expect(documents.hits.some((hit) => hit.documentId === search.foreignDocument.document.id)).toBe(false);
  for (const asset of capsule.privateCaptures.knowledgeVariants.images.assets) {
    expect(imageHits.filter((hit) => hit.assetId === asset.id).map((hit) => [hit.hash, hit.lens])).toEqual([
      [asset.hash, "image-raw"],
      [asset.hash, "image-captioned"],
    ]);
  }
  if (process.platform === "linux") {
    const ownedRoot = await realpath(capsule.layout.root);
    const descriptors = await Promise.all(
      (await readdir("/proc/self/fd")).map(async (descriptor) => {
        try {
          return await readlink(`/proc/self/fd/${descriptor}`);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return null;
          }
          throw error;
        }
      }),
    );
    // biome-ignore lint/nursery/noConditionalExpect: /proc is Linux-only; portable capsule assertions run on every platform.
    expect(descriptors.filter((path) => path?.startsWith(`${ownedRoot}/`))).toEqual([]);
  }
  const source = await createDb(capsule.layout.databaseUrl);
  let sourceMarker: Awaited<ReturnType<typeof source.all>>;
  let notificationPlugin: typeof plugins.$inferSelect | undefined;
  let sourceMemberUsers: (typeof users.$inferSelect)[];
  let sourceMemberSessions: (typeof sessions.$inferSelect)[];
  const memberIds = [notifications.reader.userId, capsule.privateCaptures.sharedMemberAuthentication.identity.viewer.userId];
  try {
    await assertReferentialIntegrity(source);
    expect(
      await source
        .select()
        .from(imageryGenerations)
        .where(
          inArray(
            imageryGenerations.id,
            imageVariants.rows.map((row) => row.id),
          ),
        )
        .orderBy(imageryGenerations.id),
    ).toEqual(imageVariants.rows);
    expect(
      await source
        .select()
        .from(assets)
        .where(
          inArray(
            assets.id,
            imageVariants.assetRows.map((row) => row.id),
          ),
        )
        .orderBy(assets.id),
    ).toEqual(imageVariants.assetRows);
    expect(
      await source
        .select()
        .from(imageIndexSkips)
        .where(
          inArray(
            imageIndexSkips.assetId,
            imageVariants.skips.map(({ asset }) => asset.id),
          ),
        )
        .orderBy(imageIndexSkips.assetId),
    ).toEqual(
      imageVariants.skips
        .map(({ first }) => first.skip)
        .filter((row) => row !== undefined)
        .toSorted((left, right) => left.assetId.localeCompare(right.assetId)),
    );
    expect(await captureCorpusNotificationRows(source, notifications.recipientIds)).toEqual(notifications.rows);
    notificationPlugin = await source.select().from(plugins).where(eq(plugins.id, notifications.producers.plugin.outcome.id)).get();
    expect(notificationPlugin).toMatchObject({
      ownerId: notifications.reader.userId,
      status: "errored",
      consecutiveCrashes: PLUGIN_CRASH_DISABLE_THRESHOLD,
      lastError: expect.stringContaining(CORPUS_NOTIFICATION_PLUGIN_ERROR),
    });
    expect(
      await source
        .select()
        .from(automationFires)
        .where(
          inArray(
            automationFires.id,
            notificationFires.map((fire) => fire.id),
          ),
        )
        .orderBy(automationFires.id),
    ).toEqual(notificationFires);
    expect(await captureSdkSessionRows(source, sdkSessions.room.chat.id, sdkSessions.connection.id)).toEqual(sdkSessions.restored.rows);
    expect(await captureSdkSessionRows(source, sdkSessions.room.chat.id, sdkSessions.alternateConnection.id)).toEqual(sdkSessions.alternate.rows);
    expect(await captureRpgSnapshot(source, providerOriginal.id)).toEqual(providerOriginal);
    expect(
      await source
        .select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, capsule.privateCaptures.libraries.document.id))
        .orderBy(documentChunks.chunkIdx),
    ).toEqual(search.canonical.chunks);
    sourceMarker = await source.all(sql`PRAGMA user_version`);
    sourceMemberUsers = await source.select().from(users).where(inArray(users.id, memberIds)).orderBy(users.id);
    sourceMemberSessions = await source.select().from(sessions).where(inArray(sessions.userId, memberIds)).orderBy(sessions.id);
    expect((await source.select({ id: sessions.id }).from(sessions)).length).toBeGreaterThan(0);
    expect((await source.select({ id: userCredentials.id }).from(userCredentials)).length).toBeGreaterThan(0);
    expect((await source.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash))).length).toBeGreaterThan(0);
    expect(await source.select().from(chatLocks)).toEqual([]);
    expect(await source.select().from(pendingTurns)).toEqual([]);
    expect(await source.select().from(chatHandoffResumptions)).toEqual([]);
    expect((await detachWal(source)).sole).toBe(true);
  } finally {
    closeDb(source);
  }
  {
    await using echoRoot = await createServerHarness({ secretBoxKey: key });
    const principal = await echoRoot.principalFor(echoRoot.ownerId);
    await seedUserCredential(echoRoot.db, echoRoot.services.credentials.add, { principal, provider: "custom-openai", key: PROVIDER_KEY });
    const caller = await echoRoot.internalCallerFor(echoRoot.ownerId);
    const card = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "publication-echo", name: PROVIDER_KEY, description: "A publication boundary witness." }),
    });
    const output = await caller.character.list(undefined);
    expect(output.items.find((item) => item.id === card.id)?.name).toBe(PROVIDER_KEY);
    const original = capsule.wire.reads["character.list"];
    const rejected = join(parent, "refused clone");
    try {
      // Intervene only at publication with genuine routed bytes; the captured source graph remains untouched.
      Object.assign(capsule.wire.reads, { "character.list": [{ input: undefined, output }] });
      expect(() => capsule.publishWire()).toThrow("Corpus publication contains private material");
      await expect(prepareCorpusFixture(capsule, rejected)).rejects.toThrow("Corpus publication contains private material");
      await expect(access(rejected)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      Object.assign(capsule.wire.reads, { "character.list": original });
    }
  }
  const fixture = ownership.use(await prepareCorpusFixture(capsule, join(parent, "stage clone")));
  const loaded = loadCorpusFixture(fixture.layout.root);
  expect(loaded.wire).toEqual(capsule.wire);
  expect(loaded.wire.notificationInbox).toBeDefined();
  expect(loaded.wire.notificationInbox).toEqual(notifications.publication);
  expect(loaded.wire.chatLifecycleMember).toBeDefined();
  expect(loaded.wire.chatLifecycleMember).toEqual(lifecycle.publication);
  expect(loaded.wire.worldInfoLibrary).toBeDefined();
  expect(loaded.wire.worldInfoLibrary).toEqual(libraryViews.publication.worldInfo);
  expect(loaded.wire.regexLibrary).toBeDefined();
  expect(loaded.wire.regexLibrary).toEqual(libraryViews.publication.regex);
  expect(loaded.wire.libraryRelations).toEqual(libraryViews.publication.relations);
  expect(loaded.wire.memberIdentities).toBeDefined();
  expect(loaded.wire.memberIdentities).toEqual({
    notificationReader: notifications.admission.identity,
    sharedMember: capsule.privateCaptures.sharedMemberAuthentication.identity,
  });
  const published = await readFile(join(fixture.layout.root, "corpus.json"), "utf8");
  expect(capsule.publishWire()).toBe(published);
  expect(capsule.privateCaptures.plugins.wirePrivateLiterals.some((value) => published.includes(value))).toBe(false);
  for (const privateMaterial of [
    CORPUS_CONNECTION_KEY,
    CORPUS_CONNECTION_FOREIGN_KEY,
    CORPUS_CONNECTION_HOSTED_KEY,
    connections.own.credential.row.ciphertext,
    connections.own.credential.row.iv,
    connections.own.credential.row.tag,
  ]) {
    expect(published).not.toContain(privateMaterial);
    expect(JSON.stringify(connections.diagnostics)).not.toContain(privateMaterial);
  }
  const portable = parseCorpusWire(published);
  expect(portable.notificationInbox).toBeDefined();
  expect(portable.notificationInbox).toEqual(notifications.publication);
  expect(portable.chatLifecycleMember).toBeDefined();
  expect(portable.chatLifecycleMember).toEqual(lifecycle.publication);
  expect(portable.worldInfoLibrary).toBeDefined();
  expect(portable.worldInfoLibrary).toEqual(libraryViews.publication.worldInfo);
  expect(portable.regexLibrary).toBeDefined();
  expect(portable.regexLibrary).toEqual(libraryViews.publication.regex);
  expect(portable.libraryRelations).toEqual(libraryViews.publication.relations);
  expect(portable.memberIdentities).toBeDefined();
  expect(portable.memberIdentities).toEqual({
    notificationReader: notifications.admission.identity,
    sharedMember: capsule.privateCaptures.sharedMemberAuthentication.identity,
  });
  expect(portable.reads["chat.getChat"].map(({ output }) => output.id)).toEqual([
    capsule.privateCaptures.baseline.identities.soloChatId,
    capsule.privateCaptures.baseline.identities.groupChatId,
  ]);
  expect(portable.oidc?.confirmation.chatId).toBe(capsule.privateCaptures.oidc.wire.confirmation.chatId);
  expect(portable.auth.signedInMe).toEqual(capsule.wire.auth.signedInMe);
  const privateValues = [
    ...imageVariants.secrets,
    ...notifications.secrets,
    OWNER_PASSWORD,
    PROVIDER_KEY,
    CORPUS_SDK_TOKEN,
    sdkSessions.credential.row.ciphertext,
    sdkSessions.credential.row.iv,
    sdkSessions.credential.row.tag,
    ...sdkSessions.rows.map((row) => row.sdkSessionId),
    key.toString("hex"),
    NATIVE_OIDC_SETTINGS.OIDC_CLIENT_SECRET,
    capsule.privateCaptures.credential.row.ciphertext,
    capsule.privateCaptures.oidc.pending.secretHash,
    ...capsule.privateCaptures.oidc.transactions.flatMap((row) => [row.state, row.codeVerifier, row.nonce]),
    ...capsule.privateCaptures.oidc.ownerSessions.map((row) => row.tokenHash),
    ...capsule.privateCaptures.oidc.joinerSessions.map((row) => row.tokenHash),
  ].filter((value) => value !== null);
  expect(privateValues.some((value) => published.includes(value))).toBe(false);
  const clone = await createDb(fixture.layout.databaseUrl);
  try {
    await assertReferentialIntegrity(clone);
    expect(
      await clone
        .select()
        .from(imageryGenerations)
        .where(
          inArray(
            imageryGenerations.id,
            imageVariants.rows.map((row) => row.id),
          ),
        )
        .orderBy(imageryGenerations.id),
    ).toEqual(imageVariants.rows);
    expect(
      await clone
        .select()
        .from(assets)
        .where(
          inArray(
            assets.id,
            imageVariants.assetRows.map((row) => row.id),
          ),
        )
        .orderBy(assets.id),
    ).toEqual(imageVariants.assetRows);
    expect(
      await clone
        .select()
        .from(imageIndexSkips)
        .where(
          inArray(
            imageIndexSkips.assetId,
            imageVariants.skips.map(({ asset }) => asset.id),
          ),
        )
        .orderBy(imageIndexSkips.assetId),
    ).toEqual(
      imageVariants.skips
        .map(({ first }) => first.skip)
        .filter((row) => row !== undefined)
        .toSorted((left, right) => left.assetId.localeCompare(right.assetId)),
    );
    expect(await captureCorpusNotificationRows(clone, notifications.recipientIds)).toEqual(notifications.rows);
    expect(await clone.select().from(plugins).where(eq(plugins.id, notifications.producers.plugin.outcome.id)).get()).toEqual(notificationPlugin);
    expect(
      await clone
        .select()
        .from(automationFires)
        .where(
          inArray(
            automationFires.id,
            notificationFires.map((fire) => fire.id),
          ),
        )
        .orderBy(automationFires.id),
    ).toEqual(notificationFires);
    expect(await captureSdkSessionRows(clone, sdkSessions.room.chat.id, sdkSessions.connection.id)).toEqual(sdkSessions.restored.rows);
    expect(await captureSdkSessionRows(clone, sdkSessions.room.chat.id, sdkSessions.alternateConnection.id)).toEqual(sdkSessions.alternate.rows);
    expect(await clone.select().from(ownerStats).where(eq(ownerStats.ownerId, capsule.privateCaptures.baseline.ownerId)).get()).toEqual(
      capsule.privateCaptures.postSearchStats.owner,
    );
    expect(
      await clone
        .select()
        .from(themes)
        .where(eq(themes.id, typeIdSchema(ID_PREFIX.theme).parse(statsSettings.settings.source.output.id)))
        .get(),
    ).toEqual(statsSettings.persisted.source);
    expect(await clone.select().from(userSettings).where(eq(userSettings.userId, capsule.privateCaptures.baseline.ownerId)).get()).toEqual(
      statsSettings.persisted.settings,
    );
    expect(await captureDocumentChunks(clone, libraryViews.documents.created.output.document.id)).toEqual(libraryViews.documents.chunks);
    expect(await captureWorldBookRows(clone, libraryViews.world.book.id)).toEqual(libraryViews.world.persisted);
    expect(await captureRegexRows(clone, [libraryViews.regex.first.id, libraryViews.regex.second.id])).toEqual(libraryViews.regex.persisted);
    expect(await captureRosterRows(clone, [libraryViews.roster.persisted.preset.id])).toEqual({
      presets: [libraryViews.roster.persisted.preset],
      members: libraryViews.roster.persisted.members,
      rules: libraryViews.roster.persisted.rules,
    });
    const schedules = capsule.privateCaptures.rpg.schedules;
    const imagery = capsule.privateCaptures.imagery;
    expect(
      await clone
        .select()
        .from(imageryGenerations)
        .where(
          inArray(
            imageryGenerations.id,
            imagery.rows.map((row) => row.id),
          ),
        )
        .orderBy(imageryGenerations.id),
    ).toEqual(imagery.rows);
    expect(await clone.select().from(imageryImportCalls).where(eq(imageryImportCalls.id, imagery.imported.claim.id))).toEqual([imagery.imported.claim]);
    expect(
      await clone
        .select()
        .from(chatImportClaims)
        .where(
          inArray(
            chatImportClaims.chatId,
            lifecycle.imported.imported.claims.map((row) => row.chatId),
          ),
        ),
    ).toEqual(lifecycle.imported.imported.claims);
    expect(await clone.select().from(messageReactions).where(eq(messageReactions.id, lifecycle.imported.segment.id))).toEqual([lifecycle.imported.segment]);
    expect(
      await clone
        .select()
        .from(compactionSpend)
        .where(
          inArray(
            compactionSpend.id,
            lifecycle.compacted.spend.map((row) => row.id),
          ),
        )
        .orderBy(compactionSpend.createdAt, compactionSpend.id),
    ).toEqual(lifecycle.compacted.spend);
    expect(await clone.select().from(workloadSchedules).where(eq(workloadSchedules.id, schedules.stopped.id))).toEqual([schedules.stopped]);
    expect(await clone.select({ id: workloadSchedules.id }).from(workloadSchedules).where(eq(workloadSchedules.id, schedules.deletedSchedule.id))).toEqual([]);
    expect((await clone.select({ id: sessions.id }).from(sessions)).length).toBe(0);
    expect((await clone.select({ id: userCredentials.id }).from(userCredentials)).length).toBe(0);
    expect((await clone.select({ id: users.id }).from(users).where(isNotNull(users.passwordHash))).length).toBe(0);
    expect((await clone.select({ id: users.id }).from(users).where(eq(users.id, capsule.privateCaptures.oidc.ownerId))).length).toBe(1);
    {
      const searchReplay = replayCorpusSearchWire(capsule.privateCaptures.searchPhysical);
      await using cloneRoot = await createServerHarness({
        db: clone,
        ownerId: capsule.privateCaptures.baseline.ownerId,
        authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" },
        clock,
        ids,
        casDir: fixture.layout.assets,
        variantDir: fixture.layout.variants,
        importStagingDir: fixture.layout.importStaging,
        temporaryParentDir: parent,
        pluginSpawn: spawn,
        providerFetch: searchReplay.execute,
      });
      const relations = loaded.wire.libraryRelations;
      assert(relations !== undefined, "prepared clone lost its native library relation stages");
      const ownerCaller = await cloneRoot.internalCallerFor(relations.viewerUserId);
      const searchLibrary = loaded.wire.searchLibrary;
      assert(searchLibrary !== undefined, "prepared clone lost its settled native search cohort");
      await assertNativeSearchReads(ownerCaller, searchLibrary);
      expect(searchReplay.remaining()).toBe(0);
      const relationReads = relations.reads;
      expect(await ownerCaller.preset.get(relationReads.presetDetail.input)).toEqual(relationReads.presetDetail.output);
      expect(await ownerCaller.preset.list(relationReads.presetList.input)).toEqual(relationReads.presetList.output);
      expect(await ownerCaller.preset.listUsage(relationReads.presetRestored.input)).toEqual(relationReads.presetRestored.output);
      expect(await ownerCaller.preset.resolveEffective(relationReads.presetEffective.input)).toEqual(relationReads.presetEffective.output);
      expect(await ownerCaller.automation.listRules(relationReads.rulesRepeated.input)).toEqual(relationReads.rulesRepeated.output);
      expect(await ownerCaller.rosterPreset.get(relationReads.rosterDetail.input)).toEqual(relationReads.rosterDetail.output);
      expect((await ownerCaller.rosterPreset.list(relationReads.rosterList.input)).find((row) => row.id === relations.ids.rosterPresetId)).toEqual(
        relationReads.rosterList.output.find((row) => row.id === relations.ids.rosterPresetId),
      );
      expect(await ownerCaller.persona.listConnectedToCharacter(relationReads.personaConnected.input)).toEqual(relationReads.personaConnected.output);
      expect(await ownerCaller.persona.listConnectedCharacters(relationReads.personaCharacters.input)).toEqual(relationReads.personaCharacters.output);
      for (const reach of [
        relationReads.characterReach,
        relationReads.chatReach,
        relationReads.worldBookReach,
        relationReads.personaReach,
        relationReads.presetReach,
      ]) {
        expect(await ownerCaller.tag.listAttachedEntities(reach.input)).toEqual(reach.output);
      }
      expect(await ownerCaller.tag.listPendingSuggestions(relationReads.tagPendingAfter.input)).toEqual(relationReads.tagPendingAfter.output);
      const nativeUsage = (await ownerCaller.tag.listTagsWithUsage()).find((tag) => tag.id === relations.ids.tagId);
      expect(nativeUsage).toEqual(relationReads.tagUsage.output.find((tag) => tag.id === relations.ids.tagId));
      expect(nativeUsage).not.toEqual(relationReads.tagBefore.output.find((tag) => tag.id === relations.ids.tagId));
      expect(await ownerCaller.rosterPreset.applyToChat(relationReads.rosterAppliedAgain.input)).toEqual(relationReads.rosterAppliedAgain.output);
      const foreignCaller = await cloneRoot.internalCallerFor(capsule.privateCaptures.sharedMemberAuthentication.identity.viewer.userId);
      await expect(foreignCaller.preset.get(relationReads.presetDetail.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(foreignCaller.preset.resolveEffective(relationReads.presetEffective.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(foreignCaller.automation.listRules(relationReads.rulesRepeated.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(foreignCaller.rosterPreset.get(relationReads.rosterDetail.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(foreignCaller.tag.listAttachedEntities(relationReads.characterReach.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(foreignCaller.persona.listConnectedCharacters(relationReads.personaCharacters.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
      const identities = loaded.wire.memberIdentities;
      assert(identities !== undefined, "prepared clone lost its actual member identities");
      const reader = await cloneRoot.principalFor(identities.notificationReader.viewer.userId);
      const member = await cloneRoot.principalFor(identities.sharedMember.viewer.userId);
      const address = await cloneRoot.listen();
      const origin = `http://${address.address}:${String(address.port)}`;
      const login = async (handle: string, password: string): Promise<Response> => {
        const response = await fetch(new URL("/api/auth/login", origin), {
          method: "POST",
          headers: { [CSRF_HEADER]: "1", forwarded: "" },
          body: new URLSearchParams({ handle, password }),
        });
        await response.arrayBuffer();
        return response;
      };
      for (const [viewer, sourceAuth] of [
        [reader, { cookie: notifications.admission.cookie, secrets: notifications.secrets }],
        [member, capsule.privateCaptures.sharedMemberAuthentication],
      ] as const) {
        await expect(captureCorpusCookieIdentity(cloneRoot, viewer, sourceAuth.cookie)).rejects.toThrow("request refused (401)");
        const sourcePassword = sourceAuth.secrets[0];
        assert(sourcePassword !== undefined, "source admission omitted its private password witness");
        const staleLogin = await login(viewer.handle, sourcePassword);
        expect(staleLogin.status).toBe(401);
        expect(staleLogin.headers.getSetCookie()).toEqual([]);
      }
      await expect(captureCorpusCookieIdentity(cloneRoot, member, "")).rejects.toThrow("request refused (401)");
      const readerAuthentication = await captureCookieAuth(cloneRoot, reader, CLONE_READER_PASSWORD);
      const memberAuthentication = await captureCookieAuth(cloneRoot, member, CLONE_MEMBER_PASSWORD);
      expect(readerAuthentication.identity).toEqual(identities.notificationReader);
      expect(memberAuthentication.identity).toEqual(identities.sharedMember);
      expect(readerAuthentication.secrets.filter((value) => notifications.secrets.includes(value))).toEqual([]);
      expect(memberAuthentication.secrets.filter((value) => capsule.privateCaptures.sharedMemberAuthentication.secrets.includes(value))).toEqual([]);
      await expect(captureCorpusCookieIdentity(cloneRoot, member, readerAuthentication.cookie)).rejects.toThrow("does not admit the expected viewer");
      const cloneSessions = await clone.select().from(sessions).where(inArray(sessions.userId, memberIds));
      expect(cloneSessions).toHaveLength(2);
      expect(new Set(cloneSessions.map((row) => row.userId))).toEqual(new Set(memberIds));
      expect(cloneSessions.every((row) => sourceMemberSessions.every((sourceRow) => sourceRow.id !== row.id && sourceRow.tokenHash !== row.tokenHash))).toBe(
        true,
      );
      const rotatedReader = await captureCookieAuth(cloneRoot, reader, CLONE_ROTATED_READER_PASSWORD);
      expect(rotatedReader.identity).toEqual(identities.notificationReader);
      await expect(captureCorpusCookieIdentity(cloneRoot, reader, readerAuthentication.cookie)).rejects.toThrow("request refused (401)");
      expect(await captureCorpusCookieIdentity(cloneRoot, member, memberAuthentication.cookie)).toEqual(identities.sharedMember);
      const logout = await fetch(new URL("/api/auth/logout", origin), {
        method: "POST",
        headers: { [CSRF_HEADER]: "1", cookie: memberAuthentication.cookie, forwarded: "" },
      });
      await logout.arrayBuffer();
      expect(logout.status).toBe(200);
      await expect(captureCorpusCookieIdentity(cloneRoot, member, memberAuthentication.cookie)).rejects.toThrow("request refused (401)");
      expect(await captureCorpusCookieIdentity(cloneRoot, reader, rotatedReader.cookie)).toEqual(identities.notificationReader);
      const afterSetup = await readFile(join(fixture.layout.root, "corpus.json"), "utf8");
      expect(afterSetup).toBe(published);
      expect(parseCorpusWire(afterSetup)).toEqual(loaded.wire);
      for (const secret of [...readerAuthentication.secrets, ...memberAuthentication.secrets, ...rotatedReader.secrets]) {
        expect(afterSetup).not.toContain(secret);
      }
      await cloneRoot.settleBackground();
    }
    // A physical clone control changes metadata only; it never fabricates domain canon or another graph.
    await clone.run(sql.raw(`PRAGMA user_version = ${CLONE_MARKER}`));
    expect(await clone.all(sql`PRAGMA user_version`)).not.toEqual(sourceMarker);
  } finally {
    closeDb(clone);
  }
  const ownerId = capsule.privateCaptures.baseline.ownerId;
  const hash = capsule.privateCaptures.libraries.asset.hash;
  const sourceCas = createCas(capsule.layout.assets);
  const cloneCas = createCas(fixture.layout.assets);
  for (const row of imageVariants.assetRows) {
    expect(await sourceCas.verify(row.ownerId, row.hash)).toBe(true);
    expect(await cloneCas.read(row.ownerId, row.hash)).toEqual(await sourceCas.read(row.ownerId, row.hash));
  }
  expect(await sourceCas.verify(ownerId, hash)).toBe(true);
  expect(await cloneCas.read(ownerId, hash)).toEqual(await sourceCas.read(ownerId, hash));
  await cloneCas.remove(ownerId, hash);
  expect(await cloneCas.exists(ownerId, hash)).toBe(false);
  expect(await sourceCas.verify(ownerId, hash)).toBe(true);
  const unchanged = await createDb(capsule.layout.databaseUrl);
  try {
    expect(await unchanged.all(sql`PRAGMA user_version`)).toEqual(sourceMarker);
    expect((await unchanged.select({ id: userCredentials.id }).from(userCredentials)).length).toBeGreaterThan(0);
    expect(await unchanged.select().from(users).where(inArray(users.id, memberIds)).orderBy(users.id)).toEqual(sourceMemberUsers);
    expect(await unchanged.select().from(sessions).where(inArray(sessions.userId, memberIds)).orderBy(sessions.id)).toEqual(sourceMemberSessions);
  } finally {
    closeDb(unchanged);
  }
  await fixture[Symbol.asyncDispose]();
  await expect(access(fixture.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
  await access(capsule.layout.root);
  await capsule[Symbol.asyncDispose]();
  await expect(access(capsule.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
}, 20_000);
