// @subject tests/support/iso/corpus-library-relations.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ruleViewSchema } from "@orb/contracts/automation";
import { healthResponseSchema } from "@orb/contracts/diagnostics";
import { effectivePresetSchema, presetDetailSchema, presetSummarySchema, presetUsageViewSchema } from "@orb/contracts/preset";
import { closeDb, createDb, localPath, runMigrations, sessions } from "@orb/db";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { cloneStageDb } from "@orb/tooling/snap";
import { z } from "zod";
import { createFrozenClock } from "../iso/clock.ts";
import { hydrateCorpusWire, parseCorpusWire, serializeCorpusWire } from "../iso/corpus.ts";
import { createSeededIds } from "../iso/ids.ts";
import { seedCorpusActors } from "./corpus-actors.ts";
import { captureCorpusCookieIdentity } from "./corpus-auth.ts";
import { seedCorpusLibraryViews } from "./corpus-library-views.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { captureCookieAuth, captureCorpusReads, seedCorpusLibraries } from "./corpus-seed.ts";
import { SHIPPED_MIGRATIONS } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("portable preset and live-rule captures equal fresh native reads in a scrubbed clone with fresh private authentication", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-library-publication-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const sourceLayout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "source") });
  const sourceDb = await createDb(sourceLayout.databaseUrl);
  const clock = createFrozenClock();
  const ids = createSeededIds();
  const authEnv = { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" };
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The native library retains its own viewer.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const produced = await (async (): Promise<{
    readonly wire: ReturnType<typeof parseCorpusWire>;
    readonly authentication: Awaited<ReturnType<typeof captureCookieAuth>>;
    readonly foreignId: Awaited<ReturnType<typeof seedCorpusActors>>["secondUserId"];
  }> => {
    try {
      await runMigrations(sourceDb, SHIPPED_MIGRATIONS);
      await using root = await createServerHarness({
        db: sourceDb,
        clock,
        ids,
        env: authEnv,
        providerFetch: execution.execute,
        secretBoxKey: randomBytes(32),
        casDir: sourceLayout.assets,
        variantDir: sourceLayout.variants,
        importStagingDir: sourceLayout.importStaging,
      });
      const actors = await seedCorpusActors(root);
      const library = await seedCorpusLibraries(root);
      const views = await seedCorpusLibraryViews(root, library, actors);
      const authentication = await captureCookieAuth(root, actors.owner, "private-source-library-password");
      const reads = await captureCorpusReads(root, { soloChatId: library.room.chat.id, groupChatId: library.room.chat.id, documentId: library.document.id });
      const wire = hydrateCorpusWire({
        auth: authentication.auth,
        reads,
        health: healthResponseSchema.parse(await (await root.http.request("/healthz")).json()),
        libraryRelations: views.publication.relations,
      });
      await root.settleBackground();
      return { wire: parseCorpusWire(serializeCorpusWire(wire, authentication.secrets)), authentication, foreignId: actors.secondUserId };
    } finally {
      closeDb(sourceDb);
    }
  })();
  const cloneLayout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "clone") });
  const sourcePath = localPath(sourceLayout.databaseUrl);
  assert(sourcePath !== undefined);
  // The publication scrub, as a published corpus clone gets it: private runtime state removed and known secrets refused.
  cloneStageDb(
    sourcePath,
    { databaseUrl: cloneLayout.databaseUrl, assetsDir: cloneLayout.assets },
    { publication: { privateLiterals: produced.authentication.secrets } },
  );
  const cloneDb = await createDb(cloneLayout.databaseUrl);
  ownership.defer(() => closeDb(cloneDb));
  expect(await cloneDb.select().from(sessions)).toEqual([]);
  const relations = produced.wire.libraryRelations;
  assert(relations !== undefined);
  await using clone = await createServerHarness({
    db: cloneDb,
    clock,
    ids,
    ownerId: relations.viewerUserId,
    env: authEnv,
    secretBoxKey: randomBytes(32),
    casDir: cloneLayout.assets,
    variantDir: cloneLayout.variants,
    importStagingDir: cloneLayout.importStaging,
  });
  const owner = await clone.principalFor(relations.viewerUserId);
  await expect(captureCorpusCookieIdentity(clone, produced.authentication.identity.viewer, produced.authentication.cookie)).rejects.toThrow(
    "request refused (401)",
  );
  const fresh = await captureCookieAuth(clone, owner, "private-fresh-clone-library-password");
  expect(fresh.identity).toEqual(produced.authentication.identity);
  expect(fresh.secrets.filter((secret) => produced.authentication.secrets.includes(secret))).toEqual([]);
  const { reads } = relations;
  const address = await clone.listen();
  const origin = `http://${address.address}:${String(address.port)}`;
  for (const [path, read, schema] of [
    ["preset.get", reads.presetDetail, presetDetailSchema],
    ["preset.list", reads.presetList, presetSummarySchema.array()],
    ["preset.listUsage", reads.presetRestored, presetUsageViewSchema],
    ["preset.resolveEffective", reads.presetEffective, effectivePresetSchema],
    ["automation.listRules", reads.rulesRepeated, ruleViewSchema.array()],
  ] as const) {
    const url = new URL(`/api/trpc/${path}`, origin);
    if (read.input !== undefined) {
      url.searchParams.set("input", JSON.stringify(read.input));
    }
    const response = await fetch(url, { headers: { cookie: fresh.cookie, forwarded: "" } });
    expect(response.status).toBe(200);
    const envelope = z.object({ result: z.object({ data: schema }) }).parse(await response.json());
    expect(envelope.result.data).toEqual(read.output);
  }
  expect(reads.presetRestored.output).not.toEqual(reads.presetActive.output);
  const foreign = await captureCookieAuth(clone, await clone.principalFor(produced.foreignId), "private-fresh-clone-foreign-password");
  for (const [path, read] of [
    ["preset.get", reads.presetDetail],
    ["preset.resolveEffective", reads.presetEffective],
    ["automation.listRules", reads.rulesRepeated],
  ] as const) {
    const url = new URL(`/api/trpc/${path}`, origin);
    url.searchParams.set("input", JSON.stringify(read.input));
    const response = await fetch(url, { headers: { cookie: foreign.cookie, forwarded: "" } });
    expect.soft(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain(JSON.stringify(read.output));
  }
  // Roster, persona and tag relations read back from the scrubbed clone exactly as the source captured them.
  const ownerCaller = await clone.internalCallerFor(relations.viewerUserId);
  expect(await ownerCaller.rosterPreset.get(reads.rosterDetail.input)).toEqual(reads.rosterDetail.output);
  expect((await ownerCaller.rosterPreset.list(reads.rosterList.input)).find((row) => row.id === relations.ids.rosterPresetId)).toEqual(
    reads.rosterList.output.find((row) => row.id === relations.ids.rosterPresetId),
  );
  expect(await ownerCaller.persona.listConnectedToCharacter(reads.personaConnected.input)).toEqual(reads.personaConnected.output);
  expect(await ownerCaller.persona.listConnectedCharacters(reads.personaCharacters.input)).toEqual(reads.personaCharacters.output);
  for (const reach of [reads.characterReach, reads.chatReach, reads.worldBookReach, reads.personaReach, reads.presetReach]) {
    expect(await ownerCaller.tag.listAttachedEntities(reach.input)).toEqual(reach.output);
  }
  expect(await ownerCaller.tag.listPendingSuggestions(reads.tagPendingAfter.input)).toEqual(reads.tagPendingAfter.output);
  const nativeUsage = (await ownerCaller.tag.listTagsWithUsage()).find((tag) => tag.id === relations.ids.tagId);
  expect(nativeUsage).toEqual(reads.tagUsage.output.find((tag) => tag.id === relations.ids.tagId));
  expect(nativeUsage).not.toEqual(reads.tagBefore.output.find((tag) => tag.id === relations.ids.tagId));
  expect(await ownerCaller.rosterPreset.applyToChat(reads.rosterAppliedAgain.input)).toEqual(reads.rosterAppliedAgain.output);
  const foreignCaller = await clone.internalCallerFor(produced.foreignId);
  await expect(foreignCaller.rosterPreset.get(reads.rosterDetail.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreignCaller.tag.listAttachedEntities(reads.characterReach.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(foreignCaller.persona.listConnectedCharacters(reads.personaCharacters.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  const invite = await clone.services.chat.createInvite({
    principal: owner,
    chatId: relations.ids.rosterChatId,
    input: { invitedHandle: foreign.identity.viewer.handle },
  });
  await clone.services.chat.acceptInvite({ principal: await clone.principalFor(produced.foreignId), inviteId: invite.invite.id });
  const memberRules = new URL("/api/trpc/automation.listRules", origin);
  memberRules.searchParams.set("input", JSON.stringify(reads.rulesRepeated.input));
  const memberResponse = await fetch(memberRules, { headers: { cookie: foreign.cookie, forwarded: "" } });
  expect(memberResponse.status).toBe(403);
  expect(await memberResponse.text()).not.toContain(JSON.stringify(reads.rulesRepeated.output));
  const memberCaller = await clone.internalCallerFor(produced.foreignId);
  const memberChat = await memberCaller.chat.getChat(reads.rosterChat.input);
  expect(memberChat.viewerIsHost).toBe(false);
  const relabeled = structuredClone(produced.wire);
  assert(relabeled.libraryRelations !== undefined);
  Object.assign(relabeled.libraryRelations, { viewerUserId: produced.foreignId });
  Object.assign(relabeled.libraryRelations.reads.rosterChat, { output: memberChat });
  expect(() => serializeCorpusWire(relabeled, produced.authentication.secrets)).toThrow("relation identity mismatch");
  const published = serializeCorpusWire(produced.wire, produced.authentication.secrets);
  const viewerMarker = `"libraryRelations":{"viewerUserId":${JSON.stringify(relations.viewerUserId)}`;
  const chatMarker = JSON.stringify(reads.rosterChat.output);
  expect(published.split(viewerMarker)).toHaveLength(2);
  expect(published.split(chatMarker)).toHaveLength(2);
  const relabeledPublished = published
    .replace(viewerMarker, `"libraryRelations":{"viewerUserId":${JSON.stringify(produced.foreignId)}`)
    .replace(chatMarker, JSON.stringify(memberChat));
  expect(() => parseCorpusWire(relabeledPublished)).toThrow("relation identity mismatch");
});
