// Retrieval rechecks databank consent after the physical query-embedding boundary.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createDb, embedGenerationTargets, embedSpaceState, preCloseHousekeeping, runMigrations } from "@orb/db";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors, seedRecallRoom } from "@orb/testkit/node/corpus-seed.ts";
import { SHIPPED_MIGRATIONS } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

test("room document consent is current at the native scan, not frozen before query embedding", async () => {
  await using resources = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "identity-enforcement-972-search-"));
  resources.defer(() => rm(directory, { recursive: true, force: true }));
  const db = await createDb(pathToFileURL(join(directory, "scope.db")).href);
  resources.defer(() => preCloseHousekeeping(db));
  await runMigrations(db, SHIPPED_MIGRATIONS);
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A completed corpus response.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  let held: { readonly entered: PromiseWithResolvers<void>; readonly released: PromiseWithResolvers<void> } | undefined;
  const root = resources.use(
    await createServerHarness({
      db,
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).pathname === "/v1/embeddings" && held !== undefined) {
          const gate = held;
          held = undefined;
          gate.entered.resolve();
          await gate.released.promise;
        }
        return await provider.execute(request);
      },
    }),
  );
  const { owner, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  const invite = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const hostGlobal = await root.services.databank.createFromText({ principal: owner, name: "host-global.txt", text: "Host global marker." });
  const hostAttached = await root.services.databank.createFromText({ principal: owner, name: "host-attached.txt", text: "Host attached marker." });
  const memberGlobal = await root.services.databank.createFromText({ principal: member, name: "member-global.txt", text: "Cross-owner revoked marker." });
  const memberPrivate = await root.services.databank.createFromText({ principal: member, name: "member-private.txt", text: "Unconsented private marker." });
  await root.services.databank.attachGlobal({ principal: owner, documentId: hostGlobal.document.id });
  await root.services.databank.attachToChat({ principal: owner, chatId, documentId: hostAttached.document.id });
  await root.services.databank.attachGlobal({ principal: member, documentId: memberGlobal.document.id });
  for (const produced of [hostGlobal, hostAttached, memberGlobal, memberPrivate]) {
    const ingested = await root.app.databankIngest.ingestDocument({ documentId: produced.document.id, signal: new AbortController().signal });
    expect(ingested.failed).toEqual([]);
    expect(ingested.chunksUpserted).toBeGreaterThan(0);
  }
  await root.settleBackground();
  const memberCaller = await root.internalCallerFor(member.userId);
  const memberRoom = await seedRecallRoom(memberCaller);
  await caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, maxTier: 0 } } });
  for (const [actor, room] of [
    [caller, chatId],
    [memberCaller, memberRoom],
  ] as const) {
    await actor.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
    await actor.chat.commitMessage({ chatId: room, timeZone: "UTC", content: "The first recorded scope witness." });
    await actor.chat.commitMessage({ chatId: room, timeZone: "UTC", content: "The second recorded scope witness." });
  }
  const sweeps: Awaited<ReturnType<typeof caller.workloads.start>>[] = [];
  for (const actor of [caller, memberCaller]) {
    sweeps.push(
      await actor.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
      await actor.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
      await actor.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
    );
  }
  await expect
    .poll(async () => {
      root.timers.advance(2000);
      const jobs = (await caller.workloads.list()).filter((job) => sweeps.some((sweep) => sweep.id === job.id));
      expect(jobs.filter((job) => job.status === "failed" || job.status === "cancelled")).toEqual([]);
      return jobs.length === sweeps.length && jobs.every((job) => job.status === "succeeded");
    })
    .toBe(true);
  expect(
    await root.services.search.spaceStatus({ ownerId: owner.userId }),
    JSON.stringify({ states: await db.select().from(embedSpaceState), targets: await db.select().from(embedGenerationTargets) }),
  ).toMatchObject({ embed: false });
  const search = (): ReturnType<typeof root.services.search.documents> =>
    root.services.search.documents({ ownerId: owner.userId, scope: { chatId }, queryText: "current document consent", k: 10 });
  const positive = await search();
  expect(positive.map((hit) => hit.documentId).toSorted()).toEqual([hostGlobal.document.id, hostAttached.document.id, memberGlobal.document.id].toSorted());
  expect(JSON.stringify(positive)).not.toContain("Unconsented private marker");
  const personal = await root.services.search.documents({ ownerId: owner.userId, scope: { ownerId: owner.userId }, queryText: "personal bank", k: 10 });
  expect(personal.map((hit) => hit.documentId).toSorted()).toEqual([hostGlobal.document.id, hostAttached.document.id].toSorted());

  const revocations = [
    { id: memberGlobal.document.id, revoke: () => root.services.chat.selfLeave({ principal: member, chatId }), marker: "Cross-owner revoked marker" },
    {
      id: hostGlobal.document.id,
      revoke: () => root.services.chat.setChatDocumentVisibility({ principal: owner, chatId, visibility: { hidden: [hostGlobal.document.id] } }),
      marker: "Host global marker",
    },
    {
      id: hostAttached.document.id,
      revoke: () => root.services.databank.detachFromChat({ principal: owner, chatId, documentId: hostAttached.document.id }),
      marker: "Host attached marker",
    },
  ];
  for (const revocation of revocations) {
    expect((await search()).map((hit) => hit.documentId)).toContain(revocation.id);
    const gate = { entered: Promise.withResolvers<void>(), released: Promise.withResolvers<void>() };
    held = gate;
    const searching = search();
    try {
      await Promise.race([
        gate.entered.promise,
        searching.then(() => {
          throw new Error("the nonempty document scope did not reach physical query embedding");
        }),
      ]);
      await revocation.revoke();
    } finally {
      held = undefined;
      gate.released.resolve();
    }
    const result = await searching;
    expect(result.map((hit) => hit.documentId)).not.toContain(revocation.id);
    expect(JSON.stringify(result)).not.toContain(revocation.marker);
  }
  const requestsBeforeEmpty = provider.requests.length;
  expect(await search()).toEqual([]);
  expect(provider.requests).toHaveLength(requestsBeforeEmpty);
});
