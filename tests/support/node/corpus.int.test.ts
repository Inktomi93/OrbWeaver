// @subject tests/support/node/corpus.ts
import "@orb/testkit/node/composed-real.ts";
// The native clone's module graph belongs to import time, not the case's execution budget.
import "@orb/tooling/snap";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdtemp, readdir, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import {
  assertReferentialIntegrity,
  chatHandoffResumptions,
  chatImportClaims,
  chatLocks,
  closeDb,
  compactionSpend,
  createDb,
  detachWal,
  documentChunks,
  imageryGenerations,
  imageryImportCalls,
  messageReactions,
  ownerStats,
  pendingTurns,
  sessions,
  themes,
  userCredentials,
  userSettings,
  users,
  workloadSchedules,
} from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createCas } from "@orb/server/infra/storage/cas";
import { parseCorpusWire } from "@orb/testkit/iso/corpus.ts";
import { createCorpusCapsule, loadCorpusFixture, prepareCorpusFixture } from "@orb/testkit/node/corpus.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { NATIVE_OIDC_SETTINGS } from "@orb/testkit/node/oidc-issuer.ts";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { CORPUS_CHAT_MODEL, corpusImageryPhysicalBytes, createCorpusChatWire } from "./corpus-chat-wire.ts";
import { CORPUS_CONNECTION_FOREIGN_KEY, CORPUS_CONNECTION_HOSTED_KEY, CORPUS_CONNECTION_KEY, CORPUS_CONNECTION_MODEL } from "./corpus-connection-wire.ts";
import { CORPUS_IMAGE_MODEL } from "./corpus-imagery.ts";
import { CORPUS_KNOWLEDGE_SWIPE_TAKES, corpusKnowledgeVariantsText, createKnowledgeSwipeWire } from "./corpus-knowledge-wire.ts";
import { captureCorpusNotificationRows } from "./corpus-notifications.ts";
import { createRpgFlightWire, RPG_JOURNAL_TITLES, RPG_RECURSION_MODEL, RPG_ROUND_MODEL } from "./corpus-rpg-flight-wire.ts";
import { createCorpusRpgWire } from "./corpus-rpg-wire.ts";
import { CORPUS_SDK_TOKEN } from "./corpus-sdk-protocol.ts";
import { captureSdkSessionRows } from "./factories/connection.ts";
import { captureDocumentChunks } from "./factories/embedding-generation.ts";
import { captureRegexRows } from "./factories/regex.ts";
import { captureRosterRows } from "./factories/roster-preset.ts";
import { captureRpgSnapshot } from "./factories/rpg.ts";
import { captureWorldBookRows } from "./factories/world-info.ts";

const OWNER_PASSWORD = "synthetic-capsule-owner-password";
const PROVIDER_KEY = "synthetic-capsule-provider-key";
const CLONE_MARKER = 123;

test("a completed migrated capsule closes its real producers before cloning scrubbed independent DB and CAS bytes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-completed-corpus-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const rpgWire = createCorpusRpgWire();
  const swipes = createKnowledgeSwipeWire();
  const lifecycleWire = createCorpusChatWire();
  const rpgFlightWire = createRpgFlightWire();
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, CORPUS_CHAT_MODEL, CORPUS_IMAGE_MODEL, RPG_RECURSION_MODEL, RPG_ROUND_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: corpusKnowledgeVariantsText,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: await corpusImageryPhysicalBytes(),
    usage: { promptTokens: 40, completionTokens: 15 },
    completion: (body) => rpgFlightWire.completion(body) ?? rpgWire.completion(body) ?? swipes.completion(body) ?? lifecycleWire.completion(body),
  });
  const key = randomBytes(32);
  const capsule = ownership.use(
    await createCorpusCapsule({
      directory: join(parent, "capsule root"),
      server: {
        authConfig: { ...authConfigFromEnv(), mode: "local" },
        providerFetch: execution.execute,
        secretBoxKey: key,
        temporaryParentDir: parent,
        pluginSpawn: spawn,
      },
      seed: { ownerPassword: OWNER_PASSWORD, log: () => undefined },
      privateCredential: { provider: "custom-openai", key: PROVIDER_KEY, metadata: { auth: "endpoint" } },
    }),
  );
  expect(await readdir(parent)).toEqual(["capsule root"]);
  expect(capsule.privateCaptures.oidc.ownerId).toBe(capsule.privateCaptures.baseline.ownerId);
  expect(capsule.privateCaptures.recall.traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)).toBe(true);
  expect(capsule.privateCaptures.recall.memory.speakers.length).toBeGreaterThan(0);
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
  expect(notifications.rows.length).toBeGreaterThan(0);
  expect(notifications.inbox.afterRefusal).toEqual(notifications.inbox.beforeRefusal);
  expect(notifications.inbox.foreignAfter).toEqual(notifications.inbox.foreignBefore);
  expect(notifications.live).toContain(notifications.kicked.id);
  expect(notifications.liveSockets).toBe(0);
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
  try {
    await assertReferentialIntegrity(source);
    expect(await captureCorpusNotificationRows(source, notifications.recipientIds)).toEqual(notifications.rows);
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
  const fixture = ownership.use(await prepareCorpusFixture(capsule, join(parent, "stage clone")));
  const loaded = loadCorpusFixture(fixture.layout.root);
  expect(loaded.wire).toEqual(capsule.wire);
  const published = await readFile(join(fixture.layout.root, "corpus.json"), "utf8");
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
  expect(portable.reads["chat.getChat"].map(({ output }) => output.id)).toEqual([
    capsule.privateCaptures.baseline.identities.soloChatId,
    capsule.privateCaptures.baseline.identities.groupChatId,
  ]);
  expect(portable.oidc?.confirmation.chatId).toBe(capsule.privateCaptures.oidc.wire.confirmation.chatId);
  expect(portable.auth.signedInMe).toEqual(capsule.wire.auth.signedInMe);
  const privateValues = [
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
    expect(await captureCorpusNotificationRows(clone, notifications.recipientIds)).toEqual(notifications.rows);
    expect(await captureSdkSessionRows(clone, sdkSessions.room.chat.id, sdkSessions.connection.id)).toEqual(sdkSessions.restored.rows);
    expect(await captureSdkSessionRows(clone, sdkSessions.room.chat.id, sdkSessions.alternateConnection.id)).toEqual(sdkSessions.alternate.rows);
    expect(await clone.select().from(ownerStats).where(eq(ownerStats.ownerId, capsule.privateCaptures.baseline.ownerId)).get()).toEqual(
      statsSettings.rows.owner,
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
  expect(await sourceCas.verify(ownerId, hash)).toBe(true);
  expect(await cloneCas.read(ownerId, hash)).toEqual(await sourceCas.read(ownerId, hash));
  await cloneCas.remove(ownerId, hash);
  expect(await cloneCas.exists(ownerId, hash)).toBe(false);
  expect(await sourceCas.verify(ownerId, hash)).toBe(true);
  const unchanged = await createDb(capsule.layout.databaseUrl);
  try {
    expect(await unchanged.all(sql`PRAGMA user_version`)).toEqual(sourceMarker);
    expect((await unchanged.select({ id: userCredentials.id }).from(userCredentials)).length).toBeGreaterThan(0);
  } finally {
    closeDb(unchanged);
  }
  await fixture[Symbol.asyncDispose]();
  await expect(access(fixture.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
  await access(capsule.layout.root);
  await capsule[Symbol.asyncDispose]();
  await expect(access(capsule.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
}, 20_000);
